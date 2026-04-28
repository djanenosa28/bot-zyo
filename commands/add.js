const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getTicketEntry } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add')
    .setDescription('Tambahkan member ke dalam ticket ini')
    .addUserOption(option => option.setName('user').setDescription('Pilih user yang ingin ditambahkan').setRequired(true)),

  async execute(interaction) {
    const ticket = await getTicketEntry(interaction.channelId);
    if (!ticket) {
      return interaction.reply({ content: '❌ Command ini hanya bisa digunakan di dalam channel ticket!', ephemeral: true });
    }

    const userToAdd = interaction.options.getUser('user');
    
    await interaction.channel.permissionOverwrites.edit(userToAdd, {
      ViewChannel: true,
      SendMessages: true,
      AttachFiles: true,
      ReadMessageHistory: true
    });

    return interaction.reply({ content: `✅ <@${userToAdd.id}> telah ditambahkan ke ticket ini.` });
  }
};
