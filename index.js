const { Client, Collection, GatewayIntentBits, Events, MessageFlags, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const {
  initDatabase,
  getAutoStoreConfigs,
  updateLastNotified,
  isStealActive,
  getTicketConfig,
  createTicketEntry,
  getTicketEntry,
  updateTicketStatus,
  isAntiPhishingActive
} = require('./database');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  AttachmentBuilder
} = require('discord.js');

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
            const openEmbed = new EmbedBuilder()
              .setTitle('🟢 Zyo Store Telah Buka!')
              .setDescription('Selamat Pagi Semuanya! Zyo Store kini kembali beroperasi untuk melayani kebutuhan Anda.')
              .addFields(
                { name: '📦 Info Stok', value: 'Tanyakan stok sebelum order agar transaksi lebih lancar.', inline: false },
                { name: '🛒 Cara Order', value: 'Order? Pesan Melalui [Klik Di Sini](https://discord.com/channels/1441411153011150890/1452840963570667650) atau DM Owner', inline: false }
              )
              .setColor(0x00FF00)
              .setTimestamp();

            await channel.send({ content: '@everyone', embeds: [openEmbed] });
            await updateLastNotified(channel_id, 'open', currentDate);
          }
        }

        // Close Check
        if (currentTime === close_time && (last_notified_date !== currentDate || last_notified_type !== 'close')) {
          const channel = await client.channels.fetch(channel_id).catch(() => null);
          if (channel) {
            const closeEmbed = new EmbedBuilder()
              .setTitle('🔴 Zyo Store Telah Tutup')
              .setDescription('Terima kasih bagi yang sudah berbelanja hari ini!')
              .addFields(
                { name: 'ℹ️ Informasi Pesanan', value: 'Pesanan yang masuk melebihi jam tutup store akan diproses keesokan harinya saat jam operasional kembali dibuka.', inline: false },
                { name: '🛒 Tetap Ingin Order?', value: 'Order tetap bisa dilakukan melalui [Klik Di Sini](https://discord.com/channels/1441411153011150890/1452840963570667650) atau DM Owner.', inline: false }
              )
              .setColor(0xFF0000)
              .setFooter({ text: 'Kami akan segera hadir kembali besok pagi!' })
              .setTimestamp();

            await channel.send({ embeds: [closeEmbed] });
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

  // Anti-Phishing Logic
  const isPhishingChannel = await isAntiPhishingActive(message.channelId);
  if (isPhishingChannel) {
    const hasLink = /https?:\/\/[^\s]+/i.test(message.content);
    const hasAttachment = message.attachments.size > 0;
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);

    if ((hasLink || hasAttachment) && !isAdmin) {
      try {
        await message.guild.members.ban(message.author.id, { 
          deleteMessageSeconds: 604800, // 7 days (maximum allowed)
          reason: 'Anti-Phishing: Mengirim link/gambar di channel terlarang' 
        });
        
        const warnMessage = await message.channel.send(`🚨 **Anti-Phishing System**\n<@${message.author.id}> telah di-banned karena mengirim link/gambar di channel ini.`);
        setTimeout(() => warnMessage.delete().catch(()=>null), 5000);
      } catch (error) {
        console.error('Gagal membanned user (anti-phishing):', error);
      }
      return; // Stop processing further for this message
    }
  }

  // Check if channel is monitored for Emoji Stealer
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

// Button Interaction Handler (Ticket System)
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const { customId, guild, channel, user, client: bot } = interaction;

  // 1. Create Ticket
  if (customId === 'ticket_create') {
    await interaction.deferReply({ ephemeral: true });

    const config = await getTicketConfig(guild.id);
    if (!config) return interaction.editReply('❌ Role & Category sistem tiket belum di-setup!');

    const ticketName = `ticket-${user.username}`.toLowerCase();

    // Check if user already has a ticket
    // (Optional logic: can be added here if needed)

    try {
      const ticketChannel = await guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: config.open_category_id,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
          { id: config.staff_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }
        ]
      });

      await createTicketEntry(ticketChannel.id, user.id, guild.id);

      const welcomeEmbed = new EmbedBuilder()
        .setAuthor({ name: 'Zyo Store', iconURL: bot.user.displayAvatarURL() })
        .setDescription('Support will be with you shortly.\nTo close this press the close button')
        .setFooter({ text: 'TicketTool.xyz - Ticketing without clutter', iconURL: bot.user.displayAvatarURL() })
        .setColor(0x2F3136);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Secondary).setEmoji('🔒')
      );

      await ticketChannel.send({ content: `<@&${config.staff_role_id}> Welcome <@${user.id}>`, embeds: [welcomeEmbed], components: [row] });
      await interaction.editReply(`✅ Tiket Anda telah dibuat: <#${ticketChannel.id}>`);
    } catch (error) {
      console.error(error);
      await interaction.editReply('❌ Terjadi kesalahan saat membuat tiket.');
    }
  }

  // 2. Request Close Ticket
  if (customId === 'ticket_close') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_confirm_close').setLabel('Close').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_cancel_close').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({ content: 'Are you sure you would like to close this ticket?', components: [row] });
  }

  // 3. Cancel Close
  if (customId === 'ticket_cancel_close') {
    await interaction.message.delete();
  }

  // 4. Confirm Close Ticket
  if (customId === 'ticket_confirm_close') {
    await interaction.deferUpdate();
    const config = await getTicketConfig(guild.id);
    const ticket = await getTicketEntry(channel.id);

    await updateTicketStatus(channel.id, 'closed');

    // Rename channel to closed-username
    const owner = await guild.members.fetch(ticket.user_id).catch(() => null);
    if (owner) {
      await channel.setName(`closed-${owner.user.username}`).catch(() => { });
    }

    await channel.setParent(config.closed_category_id, { lockPermissions: false });

    // Remove user write access
    await channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: false });

    // Remove original close button message
    await interaction.message.delete().catch(() => { });

    const closedEmbed = new EmbedBuilder()
      .setDescription(`Ticket Closed by <@${user.id}>`)
      .setColor(0xFFFF00);

    const controlEmbed = new EmbedBuilder()
      .setDescription('```Support team ticket controls```')
      .setColor(0x2F3136);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
      new ButtonBuilder().setCustomId('ticket_reopen').setLabel('Open').setStyle(ButtonStyle.Secondary).setEmoji('🔓'),
      new ButtonBuilder().setCustomId('ticket_archive').setLabel('Archive').setStyle(ButtonStyle.Success).setEmoji('📁'),
      new ButtonBuilder().setCustomId('ticket_delete').setLabel('Delete').setStyle(ButtonStyle.Danger).setEmoji('⛔')
    );

    await channel.send({ embeds: [closedEmbed] });
    await channel.send({ embeds: [controlEmbed], components: [row] });
  }

  // 5. Re-open Ticket
  if (customId === 'ticket_reopen') {
    await interaction.deferUpdate();
    const config = await getTicketConfig(guild.id);
    const ticket = await getTicketEntry(channel.id);

    await updateTicketStatus(channel.id, 'open');

    // Rename back to ticket-username
    const owner = await guild.members.fetch(ticket.user_id).catch(() => null);
    if (owner) {
      await channel.setName(`ticket-${owner.user.username}`).catch(() => { });
    }

    await channel.setParent(config.open_category_id, { lockPermissions: false });
    await channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: true });

    await interaction.message.delete().catch(() => { });
    await channel.send({ content: `✅ Ticket dibuka kembali oleh <@${user.id}>` });
  }

  // 6. Archive Ticket
  if (customId === 'ticket_archive') {
    await interaction.deferUpdate();
    const config = await getTicketConfig(guild.id);
    const ticket = await getTicketEntry(channel.id);

    await updateTicketStatus(channel.id, 'archived');
    await channel.setParent(config.archive_category_id, { lockPermissions: false });

    // Lock access for user
    await channel.permissionOverwrites.edit(ticket.user_id, { ViewChannel: false });

    await interaction.message.delete().catch(() => { });
    await channel.send({ content: `📁 Ticket telah diarsipkan ke kategori <#${config.archive_category_id}> oleh <@${user.id}>` });
  }

  // 7. Delete Ticket (Permanent)
  if (customId === 'ticket_delete') {
    await interaction.reply({ content: '⛔ Channel akan dihapus dalam 5 detik...', ephemeral: false });
    setTimeout(async () => {
      await channel.delete().catch(() => { });
    }, 5000);
  }

  // 7. Transcript (Simplified)
  if (customId === 'ticket_transcript') {
    await interaction.deferReply();
    const messages = await channel.messages.fetch({ limit: 100 });
    const content = messages.reverse().map(m => `${m.author.tag}: ${m.content}`).join('\n');
    const attachment = new AttachmentBuilder(Buffer.from(content, 'utf-8'), { name: `transcript-${channel.name}.txt` });

    await interaction.editReply({ content: '📄 Berikut riwayat percakapan tiket ini:', files: [attachment] });
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
