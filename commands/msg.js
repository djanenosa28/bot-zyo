const { 
  SlashCommandBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder, 
  EmbedBuilder, 
  AttachmentBuilder,
  MessageFlags
} = require('discord.js');
const { saveMessage } = require('../database');
const { resolveEmojis } = require('../utils/emojiResolver');

// Configuration
const MAX_EMOJIS = 3;

// Cache for attachments (InteractionID -> Data)
const attachmentCache = new Map();

// Filter Logic
function isClean(text) {
  // Repeated symbol filter
  const symbolRegex = /([^a-zA-Z0-9\s])\1{4,}/g; 
  if (symbolRegex.test(text)) return { clean: false, reason: 'Jangan menggunakan simbol berulang terlalu banyak.' };

  return { clean: true };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('msg')
    .setDescription('Kirim pesan store dalam bentuk embed')
    .addAttachmentOption(option => 
      option.setName('gambar')
        .setDescription('Upload gambar untuk embed (opsional)')
        .setRequired(false)),

  async execute(interaction) {
    const attachment = interaction.options.getAttachment('gambar');
    
    if (attachment) {
      try {
        const response = await fetch(attachment.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        attachmentCache.set(interaction.id, {
          buffer,
          contentType: attachment.contentType,
          name: attachment.name
        });
      } catch (error) {
        console.error('Error downloading attachment:', error);
      }
    }

    const modal = new ModalBuilder()
      .setCustomId(`msg_modal_${interaction.id}`)
      .setTitle('Buat Pesan Store');

    const titleInput = new TextInputBuilder()
      .setCustomId('msg_title')
      .setLabel('Judul')
      .setPlaceholder('Masukkan judul di sini...')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const contentInput = new TextInputBuilder()
      .setCustomId('msg_content')
      .setLabel('Pesan / Deskripsi')
      .setPlaceholder('Tulis detail produk atau pesan Anda...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(contentInput)
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    const interactionId = interaction.customId.replace('msg_modal_', '');
    const rawTitle = interaction.fields.getTextInputValue('msg_title');
    const rawContent = interaction.fields.getTextInputValue('msg_content');

    // 1. Resolve typed emojis (:fire: -> 🔥)
    const title = resolveEmojis(interaction.client, rawTitle);
    const content = resolveEmojis(interaction.client, rawContent);

    // 2. Validate Input
    const titleCheck = isClean(title);
    const contentCheck = isClean(content);

    if (!titleCheck.clean || !contentCheck.clean) {
      const reason = (!titleCheck.clean ? titleCheck.reason : contentCheck.reason);
      return interaction.reply({ content: `⚠️ **Input Ditolak:** ${reason}`, flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply();

    try {
      const cachedImage = attachmentCache.get(interactionId);
      
      await saveMessage(title, content, cachedImage ? cachedImage.buffer : null);

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(content)
        .setColor(0x00AE86)
        .setTimestamp();

      const files = [];

      if (cachedImage) {
        const embedImageName = `image_${interactionId}.${cachedImage.name.split('.').pop()}`;
        const attachment = new AttachmentBuilder(cachedImage.buffer, { name: embedImageName });
        embed.setImage(`attachment://${embedImageName}`);
        files.push(attachment);
      }

      await interaction.editReply({ embeds: [embed], files: files });
      attachmentCache.delete(interactionId);

    } catch (error) {
      console.error('Error processing modal submit:', error);
      await interaction.editReply({ content: 'Terjadi kesalahan saat memproses pesan.', flags: [MessageFlags.Ephemeral] });
    }
  }
};
