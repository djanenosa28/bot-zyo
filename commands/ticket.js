const { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ChannelType 
} = require('discord.js');
const { saveTicketConfig, getTicketConfig } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Sistem Ticket Zyo Store')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Setup kategori ticket')
                .addChannelOption(option => option.setName('open').setDescription('Kategori untuk tiket BARU').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
                .addChannelOption(option => option.setName('closed').setDescription('Kategori untuk tiket TUTUP').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
                .addChannelOption(option => option.setName('archive').setDescription('Kategori untuk ARSIP').addChannelTypes(ChannelType.GuildCategory).setRequired(true))
                .addRoleOption(option => option.setName('role').setDescription('Role Staff/Admin yang bisa melihat tiket').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('post')
                .setDescription('Kirim pesan pemicu ticket di channel ini')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            const openCat = interaction.options.getChannel('open');
            const closedCat = interaction.options.getChannel('closed');
            const archiveCat = interaction.options.getChannel('archive');
            const staffRole = interaction.options.getRole('role');

            await saveTicketConfig(interaction.guildId, openCat.id, closedCat.id, archiveCat.id, staffRole.id);

            return interaction.reply({ 
                content: `✅ **Setup Berhasil!**\n- Open: <#${openCat.id}>\n- Closed: <#${closedCat.id}>\n- Archive: <#${archiveCat.id}>\n- Role Staff: <@&${staffRole.id}>`,
                ephemeral: true 
            });
        }

        if (subcommand === 'post') {
            const config = await getTicketConfig(interaction.guildId);
            if (!config) {
                return interaction.reply({ content: '❌ Harap jalankan `/ticket setup` terlebih dahulu!', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('Zyo Store')
                .setDescription('To create a ticket use the Create ticket button')
                .setThumbnail(interaction.client.user.displayAvatarURL())
                .setFooter({ text: 'TicketTool.xyz - Ticketing without clutter', iconURL: interaction.client.user.displayAvatarURL() })
                .setColor(0x2F3136);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_create')
                    .setLabel('Create ticket')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📩')
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: '✅ Pesan ticket telah diposting.', ephemeral: true });
        }
    }
};
