/**
 * Helper to resolve :name: to <:name:id> based on client's accessible emojis
 */
function resolveEmojis(client, text) {
    if (!text) return text;

    // 1. Transform existing <a?:name:id> to :name: (Auto-fix for pasted/cloned emojis)
    const rawEmojiRegex = /<a?:([\w\d_]+):(\d+)>/g;
    let cleanedText = text.replace(rawEmojiRegex, (match, name) => `:${name}:`);

    // 2. Resolve typed or cleaned :emoji_name: to actual emoji codes in this server
    const nameRegex = /:([\w\d_]+):/g;
    return cleanedText.replace(nameRegex, (match, name) => {
        // Search case-insensitive to be more flexible
        const emoji = client.emojis.cache.find(e => e.name.toLowerCase() === name.toLowerCase());
        return emoji ? emoji.toString() : match;
    });
}

module.exports = { resolveEmojis };
