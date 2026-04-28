const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('payment')
    .setDescription('Tampilkan daftar rekening dan QRIS pembayaran'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🏦 Daftar Metode Pembayaran - Zyo Store')
      .setDescription('Silakan melakukan pembayaran ke salah satu metode di bawah ini:')
      .addFields(
        { name: '💰 DANA', value: '`0889-8308-2523` (A/N Evi Rif)', inline: true },
        { name: '🏦 SeaBank', value: '`9019 3082 9780` (A/N Evi Rif)', inline: true },
        { name: '🏧 QRIS', value: 'Scan gambar QRIS di bawah ini (+ Rp. 1.000 fee/reff)', inline: false }
      )
      .setFooter({ text: 'Mohon konfirmasi pembayaran ke admin dengan menyertakan bukti transfer.' })
      .setColor(0x00AE86)
      .setTimestamp();

    // Cari file qris dengan berbagai kemungkinan ekstensi
    const possibleFiles = ['qris.jpeg', 'qris.jpg', 'qris.jpeg.jpg', 'qris.png'];
    let foundFile = null;

    for (const fileName of possibleFiles) {
      if (fs.existsSync(path.join(process.cwd(), fileName))) {
        foundFile = fileName;
        break;
      }
    }

    try {
      if (foundFile) {
        const attachment = new AttachmentBuilder(`./${foundFile}`, { name: 'qris_payment.png' });
        embed.setImage('attachment://qris_payment.png');
        await interaction.reply({ embeds: [embed], files: [attachment] });
      } else {
        throw new Error('File QRIS tidak ditemukan');
      }
    } catch (error) {
      console.error('Error sending payment message:', error);
      await interaction.reply({ 
        content: '⚠️ Gambar QRIS tidak ditemukan di server. Pastikan ada file bernama `qris.jpeg` atau `qris.jpg` di folder bot.', 
        embeds: [embed], 
        ephemeral: true 
      }).catch(() => {});
    }
  }
};
