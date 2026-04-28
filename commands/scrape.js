const { SlashCommandBuilder, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('scrape')
        .setDescription('Ambil semua data harga dari channel dalam satu category')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('category_id')
                .setDescription('ID Category yang ingin di-scrape')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const categoryId = interaction.options.getString('category_id');

        const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);
        if (!category || category.type !== 4) {
            return interaction.editReply('❌ ID Category tidak valid atau bukan sebuah Category.');
        }

        const textChannels = interaction.guild.channels.cache.filter(
            ch => ch.parentId === categoryId && ch.type === 0
        );

        if (textChannels.size === 0) {
            return interaction.editReply('❌ Tidak ada text channel di dalam category ini.');
        }

        await interaction.editReply(`⏳ Sedang memproses **${textChannels.size}** channel...`);

        const results = [];

        // Regex harga coret: ~~Rp. 10.000~~
        const strikeRegex = /~~.*?Rp\.\s*([\d.,]+).*?~~/g;
        // Regex harga asli: **Rp. 5.000** atau *Rp. 5.000*
        const boldRegex = /\*{1,2}Rp\.\s*([\d.,]+)\*{1,2}/g;
        // Nama item = teks mentah di awal baris (sebelum : atau sebelum ~~ atau sebelum **)
        const itemRegex = /^([^~*\n]+?)(?:\s*[:\-–—→>]|\s*~~|\s*\*)/;

        for (const [, ch] of textChannels) {
            try {
                const messages = await ch.messages.fetch({ limit: 100 });

                for (const [, msg] of messages) {
                    if (!msg.content && msg.embeds.length === 0) continue;

                    const texts = [];
                    if (msg.content) texts.push(msg.content);
                    for (const embed of msg.embeds) {
                        if (embed.description) texts.push(embed.description);
                        if (embed.title) texts.push(embed.title);
                        for (const field of embed.fields || []) {
                            texts.push(`${field.name}\n${field.value}`);
                        }
                    }

                    const fullText = texts.join('\n');

                    for (const line of fullText.split('\n')) {
                        if (!line.includes('Rp.')) continue;

                        // Cari harga coret
                        strikeRegex.lastIndex = 0;
                        const strikeMatch = strikeRegex.exec(line);
                        const hargaCoret = strikeMatch ? `Rp. ${strikeMatch[1]}` : '';

                        // Cari harga asli (bold)
                        boldRegex.lastIndex = 0;
                        const boldMatch = boldRegex.exec(line);
                        const hargaAsli = boldMatch ? `Rp. ${boldMatch[1]}` : '';

                        // Kalau tidak ada harga apapun yang cocok, skip
                        if (!hargaCoret && !hargaAsli) continue;

                        // Ambil nama item mentah dari awal baris
                        const itemMatch = itemRegex.exec(line);
                        const namaItem = itemMatch ? itemMatch[1].trim() : line.split('~~')[0].split('**')[0].trim();

                        if (!namaItem) continue;

                        results.push({
                            channel: ch.name,
                            item: namaItem,
                            harga_coret: hargaCoret,
                            harga_asli: hargaAsli
                        });
                    }
                }
            } catch (err) {
                console.error(`Gagal memproses channel ${ch.name}:`, err);
            }
        }

        if (results.length === 0) {
            return interaction.editReply('⚠️ Tidak ada data harga yang ditemukan.');
        }

        // ─── CSV ──────────────────────────────────────────────────────────────
        const csvHeader = 'Channel,Item,Harga Coret,Harga Asli\n';
        const csvRows = results.map(r =>
            `"${r.channel}","${r.item.replace(/"/g, '""')}","${r.harga_coret}","${r.harga_asli}"`
        ).join('\n');

        // ─── JSON ─────────────────────────────────────────────────────────────
        const jsonContent = JSON.stringify({
            category: category.name,
            category_id: categoryId,
            total_items: results.length,
            scraped_at: new Date().toISOString(),
            data: results
        }, null, 2);

        const timestamp = Date.now();
        const csvFile = new AttachmentBuilder(Buffer.from(csvHeader + csvRows, 'utf-8'), {
            name: `scrape-${category.name}-${timestamp}.csv`
        });
        const jsonFile = new AttachmentBuilder(Buffer.from(jsonContent, 'utf-8'), {
            name: `scrape-${category.name}-${timestamp}.json`
        });

        await interaction.editReply({
            content: `✅ **Scraping Selesai!**\n📊 Total item: **${results.length}**\n📂 Category: **${category.name}**`,
            files: [csvFile, jsonFile]
        });
    }
};
