const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { updateAutoStoreConfig, setAutoStoreStatus } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('auto-store')
    .setDescription('Pengaturan Toko Otomatis')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('config')
        .setDescription('Atur waktu buka dan tutup toko')
        .addStringOption(option => 
          option.setName('buka')
            .setDescription('Waktu buka (Format HH:mm, contoh 08:00)')
            .setRequired(true))
        .addStringOption(option => 
          option.setName('tutup')
            .setDescription('Waktu tutup (Format HH:mm, contoh 22:00)')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('on')
        .setDescription('Aktifkan auto-store di channel ini'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('off')
        .setDescription('Matikan auto-store di channel ini')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const channelId = interaction.channelId;
    const guildId = interaction.guildId;

    if (subcommand === 'config') {
      const openTime = interaction.options.getString('buka');
      const closeTime = interaction.options.getString('tutup');

      // Simple time format validation
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(openTime) || !timeRegex.test(closeTime)) {
        return interaction.reply({ content: 'Format waktu salah! Gunakan HH:mm (contoh 08:00).', flags: [MessageFlags.Ephemeral] });
      }

      await updateAutoStoreConfig(channelId, guildId, openTime, closeTime);
      await interaction.reply({ content: `✅ Pengaturan Auto-Store diperbarui: Buka **${openTime}**, Tutup **${closeTime}**.`, flags: [MessageFlags.Ephemeral] });
      
    } else if (subcommand === 'on') {
      await setAutoStoreStatus(channelId, guildId, true);
      await interaction.reply({ content: '✅ Auto-Store diaktifkan di channel ini.', flags: [MessageFlags.Ephemeral] });
      
    } else if (subcommand === 'off') {
      await setAutoStoreStatus(channelId, guildId, false);
      await interaction.reply({ content: '❌ Auto-Store dimatikan di channel ini.', flags: [MessageFlags.Ephemeral] });
    }
  }
};
