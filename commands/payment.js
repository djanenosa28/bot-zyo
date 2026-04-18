const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const QRCode = require('qrcode');
require('dotenv').config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('payment')
    .setDescription('Tampilkan daftar rekening atau buat QRIS Pakasir')
    .addIntegerOption(option =>
      option.setName('nominal')
        .setDescription('Nominal pembayaran (contoh: 10000)')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('qris')
        .setDescription('Buat pembayaran via QRIS Otomatis?')
        .setRequired(false)),

  async execute(interaction) {
    const nominal = interaction.options.getInteger('nominal');
    const isQris = interaction.options.getBoolean('qris');

    // Case 1: Just /payment (Static Bank Info)
    if (!nominal && !isQris) {
      const embed = new EmbedBuilder()
        .setTitle('🏦 Daftar Metode Pembayaran - Zyo Store')
        .setDescription('Silakan pilih salah satu metode pembayaran di bawah ini:')
        .addFields(
          { name: '💰 DANA', value: '`0889-8308-2523` (A/N Evi Rif)', inline: true },
          { name: '🏧 QRIS', value: '+ Rp. 1.000 Reff', inline: false },
          { name: '🏦 SeaBank', value: '`9019 3082 9780` (A/N Evi Rif)', inline: false }
        )
        .setFooter({ text: 'Konfirmasi pembayaran ke admin setelah transfer.' })
        .setColor(0x00AE86)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // Case 2: QRIS Dynamic Payment via Pakasir
    if (nominal && isQris) {
      await interaction.deferReply();

      try {
        const orderId = `ZYO-${Date.now()}`;
        const slug = process.env.PAKASIR_SLUG;
        const apiKey = process.env.PAKASIR_API_KEY;

        // Note: Pakasir common dynamic endpoint for QRIS
        // We'll use the API to create the transaction
        const response = await fetch('https://app.pakasir.com/api/v1/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': apiKey
          },
          body: JSON.stringify({
            slug: slug,
            amount: nominal,
            order_id: orderId,
            payment_method: 'qris'
          })
        });

        const data = await response.json();

        if (data.status !== 'success' && !data.payment) {
          // Fallback if the standard API structure is different
          // Some versions of Pakasir use a direct link
          const paymentUrl = `https://app.pakasir.com/pay/${slug}/${nominal}?order_id=${orderId}`;

          const embed = new EmbedBuilder()
            .setTitle('💠 Pembayaran QRIS Dinamis')
            .setDescription(`Silakan klik link di bawah untuk membayar **Rp ${nominal.toLocaleString('id-ID')}**:\n\n[Klik untuk Bayar](${paymentUrl})`)
            .setColor(0xFFB800)
            .setFooter({ text: `Order ID: ${orderId}` })
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        }

        // If the API returns QR data (raw string or base64)
        const qrString = data.payment.qrCode || data.payment.qris_data;

        if (qrString) {
          // Generate QR Code image from string
          const qrBuffer = await QRCode.toBuffer(qrString, {
            margin: 2,
            width: 512,
            color: {
              dark: '#000000',
              light: '#ffffff'
            }
          });

          const attachment = new AttachmentBuilder(qrBuffer, { name: 'qris.png' });
          const embed = new EmbedBuilder()
            .setTitle('💠 Pembayaran QRIS Dinamis')
            .setDescription(`Silakan scan QR di bawah untuk membayar:\n**Nominal:** Rp ${nominal.toLocaleString('id-ID')}\n**Status:** Menunggu Pembayaran`)
            .setImage('attachment://qris.png')
            .setColor(0x00AE86)
            .setFooter({ text: `Order ID: ${orderId} | Pakasir Gateway` })
            .setTimestamp();

          return interaction.editReply({ embeds: [embed], files: [attachment] });
        }

      } catch (error) {
        console.error('Error generating Pakasir QRIS:', error);
        return interaction.editReply({ content: '❌ Gagal membuat pembayaran QRIS. Silakan hubungi admin.' });
      }
    }

    // Default: If arguments don't match expected pattern
    return interaction.reply({ content: 'Gunakan `/payment` atau `/payment nominal:10000 qris:True`', flags: [MessageFlags.Ephemeral] });
  }
};
