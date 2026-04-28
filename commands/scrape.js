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

        // Fetch category
        const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);
        if (!category || category.type !== 4) {
            return interaction.editReply('❌ ID Category tidak valid atau bukan sebuah Category.');
        }

        // Get all text channels inside this category
        const textChannels = interaction.guild.channels.cache.filter(
            ch => ch.parentId === categoryId && ch.type === 0 // Type 0 = GuildText
        );

        if (textChannels.size === 0) {
            return interaction.editReply('❌ Tidak ada text channel yang ditemukan di dalam category ini.');
        }

        await interaction.editReply(`⏳ Sedang memproses **${textChannels.size}** channel... Mohon tunggu.`);

        const results = [];

        // ── Regexes ───────────────────────────────────────────────────────────
        const discordEmojiRegex = /<a?:[\w\d_]+:\d+>/g;

        // Target: price inside bold markers **Rp. 5.000** (this is always the FINAL price)
        // Also matches single-star *Rp. 5.000*
        const boldPriceRegex = /\*{1,2}Rp\.\s*([\d.,]+)\*{1,2}/g;

        // Extract item name = text at start of line before ~~...~~ or before the final price
        function extractItemName(line) {
            // Get text before first ~~ (strikethrough) or before first **Rp.
            const beforeStrike = line.split('~~')[0];
            const beforeBoldPrice = line.split(/\*{1,2}Rp\./)[0];
            const candidate = beforeStrike.length < beforeBoldPrice.length
                ? beforeStrike
                : beforeBoldPrice;

            return candidate
                .replace(discordEmojiRegex, '')          // Remove Discord emojis
                .replace(/^[-*•>~`|🔹🔸▸►▷→✦✧·\s]+/u, '') // Remove leading symbols
                .replace(/[:\-–—→>]+$/, '')               // Remove trailing separators
                .replace(/\s{2,}/g, ' ')
                .trim();
        }

        for (const [, ch] of textChannels) {
            try {
                const messages = await ch.messages.fetch({ limit: 100 });

                for (const [, msg] of messages) {
                    if (!msg.content && msg.embeds.length === 0) continue;

                    // Collect all text sources
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

                    // Process line by line
                    for (const line of fullText.split('\n')) {
                        if (!line.includes('Rp.')) continue;

                        boldPriceRegex.lastIndex = 0;
                        let match;

                        while ((match = boldPriceRegex.exec(line)) !== null) {
                            const rawPrice = match[1].trim();
                            const priceNum = parseInt(rawPrice.replace(/[.,]/g, '').replace(/\D/g, ''), 10);
                            if (priceNum <= 0) continue;

                            // Get item name from this line
                            const cleanItem = extractItemName(line);
                            if (!cleanItem || /^\d+$/.test(cleanItem)) continue;

                            results.push({
                                channel: ch.name,
                                item: cleanItem,
                                price_display: `Rp. ${rawPrice}`,
                                price_number: priceNum
                            });
                        }
                    }
                }
            } catch (err) {
                console.error(`Gagal memproses channel ${ch.name}:`, err);
            }
        }

        if (results.length === 0) {
            return interaction.editReply('⚠️ Tidak ada data harga yang ditemukan dengan format "Nama Item Rp. Harga".');
        }

        // ─── Build CSV ────────────────────────────────────────────────────────
        const csvHeader = 'Channel,Item,Harga Display,Harga (Angka)\n';
        const csvRows = results.map(r =>
            `"${r.channel}","${r.item.replace(/"/g, '""')}","${r.price_display}",${r.price_number}`
        ).join('\n');
        const csvContent = csvHeader + csvRows;

        // ─── Build JSON ───────────────────────────────────────────────────────
        const jsonContent = JSON.stringify({
            category: category.name,
            category_id: categoryId,
            total_items: results.length,
            scraped_at: new Date().toISOString(),
            data: results
        }, null, 2);

        // ─── Attach Files ─────────────────────────────────────────────────────
        const timestamp = Date.now();
        const csvFile = new AttachmentBuilder(Buffer.from(csvContent, 'utf-8'), {
            name: `scrape-${category.name}-${timestamp}.csv`
        });
        const jsonFile = new AttachmentBuilder(Buffer.from(jsonContent, 'utf-8'), {
            name: `scrape-${category.name}-${timestamp}.json`
        });

        await interaction.editReply({
            content: `✅ **Scraping Selesai!**\n📊 Total item ditemukan: **${results.length}**\n📂 Category: **${category.name}**\n\nFile CSV dan JSON siap diunduh:`,
            files: [csvFile, jsonFile]
        });
    }
};
