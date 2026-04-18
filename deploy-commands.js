const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    const guildIds = process.env.DISCORD_GUILD_IDS.split(',').map(id => id.trim());
    console.log(`Started refreshing ${commands.length} application (/) commands for ${guildIds.length} server(s).`);

    for (const guildId of guildIds) {
      if (!guildId || !/^\d+$/.test(guildId)) {
        if (guildId) console.log(`[SKIP] ID Server tidak valid (bukan angka): ${guildId}`);
        continue;
      }
      await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guildId),
        { body: commands },
      );
      console.log(`Successfully reloaded application (/) commands for guild: ${guildId}`);
    }

    console.log('Finished refreshing all application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
