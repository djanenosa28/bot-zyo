const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('copycategory')
        .setDescription('Copy pesan embed dari kategori A ke B berdasarkan title')
        .addChannelOption(option =>
            option.setName('source_category')
                .setDescription('Kategori sumber (yang mau dicopy)')
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('target_category_id')
                .setDescription('ID Kategori tujuan (tempat paste, bisa lintas server)')
                .setRequired(true)),

    async execute(interaction) {
        // Biar bot gak time-out saat mikir/proses data yang banyak
        await interaction.deferReply();

        const sourceCategory = interaction.options.getChannel('source_category');
        const targetCategoryId = interaction.options.getString('target_category_id');

        let targetCategory;
        try {
            targetCategory = await interaction.client.channels.fetch(targetCategoryId);
        } catch (err) {
            return interaction.editReply(`❌ Kategori tujuan dengan ID \`${targetCategoryId}\` tidak ditemukan. Pastikan bot sudah bergabung di server tersebut!`);
        }

        if (targetCategory.type !== ChannelType.GuildCategory) {
            return interaction.editReply(`❌ ID yang dimasukkan bukan sebuah Kategori!`);
        }

        // Pastikan semua channel di dalam server terkait sudah diambil (fetch) agar tidak ada channel yang terlewat karena cache kosong
        await sourceCategory.guild.channels.fetch();
        await targetCategory.guild.channels.fetch();

        // Ambil semua text channel di dalam kategori masing-masing
        const sourceChannels = sourceCategory.children.cache.filter(c => c.type === ChannelType.GuildText);
        const targetChannels = targetCategory.children.cache.filter(c => c.type === ChannelType.GuildText);

        let successCount = 0;
        let errorCount = 0;

        // Looping setiap channel di kategori sumber
        for (const [_, channel] of sourceChannels) {
            try {
                // Ambil semua pesan di channel
                let allMessages = [];
                let lastId;

                while (true) {
                    const options = { limit: 100 };
                    if (lastId) options.before = lastId;

                    const messages = await channel.messages.fetch(options);
                    if (messages.size === 0) break;

                    allMessages.push(...messages.values());
                    lastId = messages.last().id;
                }

                // Filter hanya pesan yang memiliki embed dan dibalik (supaya dari pesan paling lama ke baru)
                const embedMessages = allMessages.filter(msg => msg.embeds.length > 0).reverse();

                for (const msg of embedMessages) {
                    for (const embed of msg.embeds) {
                        // Skip jika embed tidak punya title
                        if (!embed.title) continue;

                        // Bersihkan title dari simbol, ubah ke huruf kecil, dan pecah per kata (spasi)
                        // Contoh: "Akun Canva Pro!" -> ["akun", "canva", "pro"]
                        const keywords = embed.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);

                        let matchedChannel = null;

                        // Cek setiap kata kunci ke channel di kategori target
                        for (const word of keywords) {
                            if (!word) continue; // Skip string kosong

                            // Cari channel yang namanya mengandung kata kunci tersebut
                            matchedChannel = targetChannels.find(c => c.name.toLowerCase().includes(word));

                            // Jika ketemu 1 channel yang cocok, langsung stop pencarian kata kunci
                            if (matchedChannel) break;
                        }

                        if (matchedChannel) {
                            // Paste embed ke channel yang cocok
                            await matchedChannel.send({ embeds: [embed] });
                            successCount++;
                        } else {
                            // Anggap error jika tidak ada channel yang cocok dengan kata di title
                            errorCount++;
                        }
                    }
                }
            } catch (err) {
                console.error(`Gagal membaca pesan dari channel ${channel.name}:`, err);
            }
        }

        await interaction.editReply(`✅ **Proses selesai!**\nBerhasil dipaste: ${successCount} embed.\nError (Channel tujuan tidak ditemukan): ${errorCount} embed.`);
    }
};