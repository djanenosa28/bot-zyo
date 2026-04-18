const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { setStealStatus } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('steal')
    .setDescription('Emoji Stealer System')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('on')
        .setDescription('Aktifkan monitoring pencurian emoji di channel ini'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('off')
        .setDescription('Matikan monitoring pencurian emoji di channel ini')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const channelId = interaction.channelId;
    const guildId = interaction.guildId;

    if (subcommand === 'on') {
      await setStealStatus(channelId, guildId, true);
      await interaction.reply({ 
        content: '✅ **Emoji Stealer AKTIF!**\nSekarang Anda bisa mencuri emoji dengan format: `<emoji> = <nama_baru>`', 
        flags: [MessageFlags.Ephemeral] 
      });
    } else if (subcommand === 'off') {
      await setStealStatus(channelId, guildId, false);
      await interaction.reply({ 
        content: '❌ **Emoji Stealer DIMATIKAN.**', 
        flags: [MessageFlags.Ephemeral] 
      });
    }
  }
};
