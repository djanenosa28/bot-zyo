const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { executeClone } = require('../utils/cloner');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clone')
    .setDescription('Clone struktur server (Role, Channel, Permission)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('source_id')
        .setDescription('ID server yang ingin di-copy')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('target_id')
        .setDescription('ID server yang ingin ditimpa (target)')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('copy_chat')
        .setDescription('Copy 50 pesan embed terakhir di setiap channel? (Opsional)')
        .setRequired(false)),

  async execute(interaction) {
    const sourceId = interaction.options.getString('source_id');
    const targetId = interaction.options.getString('target_id') || interaction.guildId;
    const copyChat = interaction.options.getBoolean('copy_chat') || false;

    // 1. Validate permissions and token
    if (!process.env.DISCORD_USER_TOKEN || process.env.DISCORD_USER_TOKEN === 'MASUKKAN_TOKEN_USER_ANDA_DI_SINI') {
      return interaction.reply({ 
        content: '❌ **User Token tidak ditemukan!**\nSilakan isi `DISCORD_USER_TOKEN` di file `.env` terlebih dahulu.', 
        flags: [MessageFlags.Ephemeral] 
      });
    }

    const targetGuild = await interaction.client.guilds.fetch(targetId).catch(() => null);
    if (!targetGuild) {
      return interaction.reply({ 
        content: `❌ **Bot tidak ada di server target!**\nPastikan bot sudah masuk ke server dengan ID: \`${targetId}\``, 
        flags: [MessageFlags.Ephemeral] 
      });
    }

    await interaction.reply({ 
      content: `🚀 **Memulai proses cloning...**\nSumber: \`${sourceId}\`\nTarget: \`${targetGuild.name}\`\n\n*Proses ini akan memakan waktu beberapa menit. Jangan matikan bot.*`
    });

    try {
      // Execute progress updates via following up
      await executeClone(sourceId, targetGuild, { copyMessages: copyChat }, async (status) => {
        await interaction.editReply({ 
           content: `🚀 **Proses Cloning:**\n${status}`
        }).catch(() => {});
      });

    } catch (error) {
      console.error('Cloning Error:', error);
      await interaction.followUp({ 
        content: `❌ **Error saat cloning:** ${error.message}`, 
        flags: [MessageFlags.Ephemeral] 
      });
    }
  }
};
