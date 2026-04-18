const { Client, Collection, GatewayIntentBits, Events, MessageFlags, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { initDatabase, getAutoStoreConfigs, updateLastNotified, isStealActive } = require('./database');

// Initialize Client
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildEmojisAndStickers
  ] 
});

client.commands = new Collection();

// Command Loader
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  }
}

// Background Scheduler (Auto-Store)
async function startScheduler() {
  setInterval(async () => {
    const now = new Date();
    // Offset for WIB (UTC+7) if needed, but here we use local server time (WIB based on system info)
    const currentTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    const currentDate = now.toLocaleDateString('en-GB');

    try {
      const activeConfigs = await getAutoStoreConfigs();

      for (const config of activeConfigs) {
        const { channel_id, open_time, close_time, last_notified_date, last_notified_type } = config;

        // Open Check
        if (currentTime === open_time && (last_notified_date !== currentDate || last_notified_type !== 'open')) {
          const channel = await client.channels.fetch(channel_id).catch(() => null);
          if (channel) {
            await channel.send('Selamat Pagi, Zyo Store Telah Buka @everyone');
            await updateLastNotified(channel_id, 'open', currentDate);
          }
        }

        // Close Check
        if (currentTime === close_time && (last_notified_date !== currentDate || last_notified_type !== 'close')) {
          const channel = await client.channels.fetch(channel_id).catch(() => null);
          if (channel) {
            await channel.send('Zyo Store Telah Tutup, Selamat Malam Semua');
            await updateLastNotified(channel_id, 'close', currentDate);
          }
        }
      }
    } catch (error) {
      console.error('Error in Scheduler:', error);
    }
  }, 60000); // Check every 1 minute
}

client.once(Events.ClientReady, async c => {
  console.log(`Bot Siap! Login sebagai ${c.user.tag}`);
  await initDatabase();
  startScheduler();
});

// Emoji Stealer Logic
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  // Check if channel is monitored
  const active = await isStealActive(message.channelId);
  if (!active) return;

  // Only Admin can trigger steal
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

  // Regex: <emoji> = name
  const regex = /(<a?:[\w\d_]+:(\d+)>)\s*=\s*([\w\d_]+)/g;
  const matches = [...message.content.matchAll(regex)];

  if (matches.length === 0) return;

  let successCount = 0;
  let failCount = 0;

  for (const match of matches) {
    const fullEmoji = match[1];
    const id = match[2];
    const newName = match[3];
    const animated = fullEmoji.startsWith('<a:');
    const url = `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}`;

    try {
      await message.guild.emojis.create({ attachment: url, name: newName });
      successCount++;
    } catch (error) {
      console.error(`Gagal mencuri emoji ${newName}:`, error);
      failCount++;
    }
  }

  if (successCount > 0) {
    message.reply({ 
      content: `✅ **Berhasil mencuri ${successCount} emoji!**${failCount > 0 ? ` (${failCount} gagal)` : ''}`
    });
  } else if (failCount > 0) {
    message.reply({ content: '❌ Gagal mencuri emoji. Pastikan bot punya izin dan slot emoji masih ada.' });
  }
});

// Command Interaction Handler
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Terjadi kesalahan saat menjalankan command!', flags: [MessageFlags.Ephemeral] });
    } else {
      await interaction.reply({ content: 'Terjadi kesalahan saat menjalankan command!', flags: [MessageFlags.Ephemeral] });
    }
  }
});

// Modal Handler
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isModalSubmit()) return;

  // Find the command that handles this modal (currently only 'msg')
  const msgCommand = client.commands.get('msg');
  if (msgCommand && interaction.customId.startsWith('msg_modal_')) {
    try {
      await msgCommand.handleModal(interaction);
    } catch (error) {
      console.error(error);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
