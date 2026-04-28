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

        // ── Pre-processing helpers ────────────────────────────────────────────
        // Strip Discord emoji format: <:name:id> or <a:name:id>
        const discordEmojiRegex = /<a?:[\w\d_]+:\d+>/g;

        function cleanText(raw) {
            return raw
                .replace(/~~[^~]+~~/g, '')          // Remove strikethrough (OLD price): ~~Rp. 10.000~~
                .replace(discordEmojiRegex, '')       // Remove Discord emoji <:name:id>
                .replace(/\*\*([^*]+)\*\*/g, '$1')   // Remove bold **text** → text
                .replace(/\*([^*]+)\*/g, '$1')        // Remove italic *text* → text
                .replace(/__([^_]+)__/g, '$1')        // Remove underline
                .replace(/`[^`]+`/g, '')              // Remove inline code
                .replace(/\s{2,}/g, ' ')              // Collapse multiple spaces
                .trim();
        }

        // ── Price regex ───────────────────────────────────────────────────────
        // Matches: "Item text [optional: or →] Rp. 5.000"
        // After cleanup, format becomes: "7 Hari:  > Rp. 5.000" → captures "7 Hari" and "5.000"
        const priceRegex = /([^\n]+?)\s*(?:[→>:])?\s*Rp\.\s+([\d.,]+)/gi;

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

                    // ── CLEAN FIRST, THEN PARSE ──────────────────────────────
                    const fullText = cleanText(texts.join('\n'));

                    // Process line-by-line for better context
                    const lines = fullText.split('\n');
                    for (const line of lines) {
                        const cleanLine = line.trim();
                        if (!cleanLine.includes('Rp.')) continue;

                        priceRegex.lastIndex = 0;
                        const match = priceRegex.exec(cleanLine);
                        if (!match) continue;

                        const rawItem = match[1].trim();
                        const rawPrice = match[2].trim();

                        // Clean item name further
                        let cleanItem = rawItem
                            .replace(/^[-*•>~`|🔹🔸▸►▷→✦✧·\s]+/u, '') // leading symbols
                            .replace(/[:\-–—→>]+$/, '')                   // trailing separators
                            .trim();

                        // Skip empty or pure-number items
                        if (!cleanItem || /^\d+$/.test(cleanItem)) continue;

                        const priceNum = parseInt(rawPrice.replace(/[.,]/g, '').replace(/\D/g, ''), 10);
                        if (priceNum <= 0) continue;

                        results.push({
                            channel: ch.name,
                            item: cleanItem,
                            price_display: `Rp. ${rawPrice}`,
                            price_number: priceNum
                        });
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
