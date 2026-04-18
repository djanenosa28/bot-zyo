const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { resolveEmojis } = require('./emojiResolver');
require('dotenv').config();

const DELAY = 1500; // 1.5s delay to avoid rate limits
const MSG_DELAY = 3000; // 3s delay for messages

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch raw guild data using User Token via REST
 */
async function getGuildData(guildId) {
    const headers = {
        'Authorization': process.env.DISCORD_USER_TOKEN,
        'Content-Type': 'application/json'
    };

    const rolesRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers });
    const roles = await rolesRes.json();

    const channelsRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, { headers });
    const channels = await channelsRes.json();

    if (!Array.isArray(roles) || !Array.isArray(channels)) {
        throw new Error('Gagal mengambil data server. Pastikan User Token valid dan memiliki akses ke server sumber.');
    }

    return { roles, channels };
}

/**
 * Fetch last messages from a channel using User Token
 */
async function fetchMessages(channelId, limit = 50) {
    const headers = {
        'Authorization': process.env.DISCORD_USER_TOKEN,
        'Content-Type': 'application/json'
    };

    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=${limit}`, { headers });
    if (!res.ok) return [];
    return await res.json();
}

/**
 * Wipe all categories and channels in target guild
 */
async function wipeGuild(guild) {
    const channels = await guild.channels.fetch();
    for (const channel of channels.values()) {
        await channel.delete().catch(() => {});
        await wait(500);
    }
}

/**
 * Main Cloning Logic
 */
async function executeClone(sourceId, targetGuild, options, progressCallback) {
    const { copyMessages = false } = options;

    progressCallback('📥 Mengambil data dari server sumber...');
    const { roles: sourceRoles, channels: sourceChannels } = await getGuildData(sourceId);

    // 1. Wipe Target
    progressCallback('🧹 Menghapus struktur lama di server tujuan...');
    await wipeGuild(targetGuild);

    const roleMap = new Map();
    roleMap.set(sourceId, targetGuild.id); // Map @everyone role IDs

    // 2. Clone Roles
    progressCallback('🛡️ Menduplikasi Roles...');
    const sortedRoles = sourceRoles.sort((a, b) => a.position - b.position);
    
    for (const roleData of sortedRoles) {
        if (roleData.name === '@everyone' || roleData.managed) continue;

        try {
            const newRole = await targetGuild.roles.create({
                name: roleData.name,
                color: roleData.color,
                hoist: roleData.hoist,
                permissions: BigInt(roleData.permissions),
                mentionable: roleData.mentionable,
                reason: 'Auto-Clone System'
            });
            roleMap.set(roleData.id, newRole.id);
            await wait(DELAY);
        } catch (e) {
            console.error(`Gagal membuat role ${roleData.name}:`, e);
        }
    }

    // 3. Clone Categories
    progressCallback('📁 Menduplikasi Kategori...');
    const categoryMap = new Map();
    const sourceCategories = sourceChannels.filter(c => c.type === 4);

    for (const catData of sourceCategories) {
        try {
            const overwrites = (catData.permission_overwrites || []).map(o => ({
                id: roleMap.get(o.id) || o.id,
                allow: BigInt(o.allow),
                deny: BigInt(o.deny),
                type: o.type
            }));

            const newCat = await targetGuild.channels.create({
                name: catData.name,
                type: ChannelType.GuildCategory,
                permissionOverwrites: overwrites
            });
            categoryMap.set(catData.id, newCat.id);
            await wait(DELAY);
        } catch (e) {
            console.error(`Gagal membuat kategori ${catData.name}:`, e);
        }
    }

    // 4. Clone Channels
    progressCallback('💬 Menduplikasi Channel...');
    const sourceTextVoice = sourceChannels.filter(c => c.type !== 4);
    const createdChannels = []; // Store { oldId, newObj } for message cloning

    for (const chanData of sourceTextVoice) {
        try {
            const overwrites = (chanData.permission_overwrites || []).map(o => ({
                id: roleMap.get(o.id) || o.id,
                allow: BigInt(o.allow),
                deny: BigInt(o.deny),
                type: o.type
            }));

            const newChannel = await targetGuild.channels.create({
                name: chanData.name,
                type: chanData.type,
                parent: categoryMap.get(chanData.parent_id),
                topic: chanData.topic,
                nsfw: chanData.nsfw,
                permissionOverwrites: overwrites
            });
            
            if (chanData.type === 0) { // Text Channel
                createdChannels.push({ oldId: chanData.id, newObj: newChannel });
            }
            
            await wait(DELAY);
        } catch (e) {
            console.error(`Gagal membuat channel ${chanData.name}:`, e);
        }
    }

    // 5. Clone Messages (Optional)
    if (copyMessages) {
        progressCallback('📜 Mengangkut Pesan & Embed (Bisa memakan waktu lama)...');
        for (const entry of createdChannels) {
            const messages = await fetchMessages(entry.oldId, 50);
            if (messages.length === 0) continue;

            const sortedMessages = messages.reverse(); // Oldest first
            progressCallback(`🚚 Mengirim pesan di #${entry.newObj.name}...`);

            for (const msg of sortedMessages) {
                // Only clone embeds for now as requested
                if (msg.embeds && msg.embeds.length > 0) {
                    try {
                        const processedEmbeds = msg.embeds.map(e => {
                            const newEmbed = new EmbedBuilder(e);
                            // Resolve emojis in title and description
                            if (e.title) newEmbed.setTitle(resolveEmojis(targetGuild.client, e.title));
                            if (e.description) newEmbed.setDescription(resolveEmojis(targetGuild.client, e.description));
                            return newEmbed;
                        });

                        await entry.newObj.send({ embeds: processedEmbeds });
                        await wait(MSG_DELAY);
                    } catch (e) {
                        console.error(`Gagal mengirim embed di channel ${entry.newObj.name}:`, e);
                    }
                }
            }
        }
    }

    progressCallback('✅ Server Berhasil Di-Clone!');
}

module.exports = { executeClone };
