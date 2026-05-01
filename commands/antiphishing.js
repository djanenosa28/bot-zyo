const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { setAntiPhishingStatus } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anti-phising')
    .setDescription('Mengaktifkan atau menonaktifkan sistem anti-phishing di channel ini')
    .addBooleanOption(option =>
      option.setName('aktif')
        .setDescription('Pilih True untuk mengaktifkan, False untuk mematikan')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const isActive = interaction.options.getBoolean('aktif');
    const channelId = interaction.channelId;
    const guildId = interaction.guildId;

    try {
      await setAntiPhishingStatus(channelId, guildId, isActive);

      const embed = new EmbedBuilder()
        .setTitle('🛡️ Pengaturan Anti-Phishing')
        .setDescription(`Sistem Anti-Phishing telah **${isActive ? 'Diaktifkan' : 'Dinonaktifkan'}** di channel <#${channelId}>.`)
        .setColor(isActive ? 0x00FF00 : 0xFF0000)
        .setTimestamp();

      if (isActive) {
        embed.addFields({ name: 'Info', value: 'Siapapun (selain Admin) yang mengirimkan link atau gambar di channel ini akan langsung di-banned dan riwayat pesannya dihapus.' });
      }

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error saat mengatur anti-phishing:', error);
      await interaction.reply({ content: '❌ Terjadi kesalahan saat menyimpan pengaturan ke database.', ephemeral: true });
    }
  },
};
