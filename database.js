const { createClient } = require('@libsql/client');
require('dotenv').config();

const client = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

async function initDatabase() {
  try {
    // Existing table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS store_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        image_data BLOB,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // New Auto-Store table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS auto_store (
        channel_id TEXT PRIMARY KEY,
        guild_id TEXT,
        open_time TEXT DEFAULT '08:00',
        close_time TEXT DEFAULT '22:00',
        is_active INTEGER DEFAULT 0,
        last_notified_date TEXT, -- To prevent double messages in the same minute
        last_notified_type TEXT  -- 'open' or 'close'
      )
    `);
    // New Emoji Stealer table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS steal_monitor (
        channel_id TEXT PRIMARY KEY,
        guild_id TEXT,
        is_active INTEGER DEFAULT 0
      )
    `);
    // Ticket Config table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS ticket_config (
        guild_id TEXT PRIMARY KEY,
        open_category_id TEXT,
        closed_category_id TEXT,
        archive_category_id TEXT,
        staff_role_id TEXT
      )
    `);

    // Active Tickets table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS active_tickets (
        channel_id TEXT PRIMARY KEY,
        user_id TEXT,
        guild_id TEXT,
        status TEXT DEFAULT 'open' -- 'open', 'closed', 'archived'
      )
    `);
    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

async function saveMessage(title, content, imageData) {
  try {
    const result = await client.execute({
      sql: 'INSERT INTO store_messages (title, content, image_data) VALUES (?, ?, ?)',
      args: [title, content, imageData || null],
    });
    return result;
  } catch (error) {
    console.error('Error saving message to database:', error);
    throw error;
  }
}

async function getAutoStoreConfigs() {
  const result = await client.execute('SELECT * FROM auto_store WHERE is_active = 1');
  return result.rows;
}

async function updateAutoStoreConfig(channelId, guildId, openTime, closeTime) {
  await client.execute({
    sql: `INSERT INTO auto_store (channel_id, guild_id, open_time, close_time) 
          VALUES (?, ?, ?, ?) 
          ON CONFLICT(channel_id) DO UPDATE SET open_time=excluded.open_time, close_time=excluded.close_time`,
    args: [channelId, guildId, openTime, closeTime]
  });
}

async function setAutoStoreStatus(channelId, guildId, isActive) {
  await client.execute({
    sql: `INSERT INTO auto_store (channel_id, guild_id, is_active) 
          VALUES (?, ?, ?) 
          ON CONFLICT(channel_id) DO UPDATE SET is_active=excluded.is_active`,
    args: [channelId, guildId, isActive ? 1 : 0]
  });
}

async function updateLastNotified(channelId, type, dateString) {
  await client.execute({
    sql: 'UPDATE auto_store SET last_notified_type = ?, last_notified_date = ? WHERE channel_id = ?',
    args: [type, dateString, channelId]
  });
}

async function setStealStatus(channelId, guildId, isActive) {
  await client.execute({
    sql: `INSERT INTO steal_monitor (channel_id, guild_id, is_active) 
          VALUES (?, ?, ?) 
          ON CONFLICT(channel_id) DO UPDATE SET is_active=excluded.is_active`,
    args: [channelId, guildId, isActive ? 1 : 0]
  });
}

async function isStealActive(channelId) {
  const result = await client.execute({
    sql: 'SELECT is_active FROM steal_monitor WHERE channel_id = ?',
    args: [channelId]
  });
  return result.rows.length > 0 && result.rows[0].is_active === 1;
}

// Ticket Helpers
async function saveTicketConfig(guildId, openId, closedId, archiveId, staffId) {
  await client.execute({
    sql: `INSERT INTO ticket_config (guild_id, open_category_id, closed_category_id, archive_category_id, staff_role_id) 
          VALUES (?, ?, ?, ?, ?) 
          ON CONFLICT(guild_id) DO UPDATE SET 
            open_category_id=excluded.open_category_id, 
            closed_category_id=excluded.closed_category_id, 
            archive_category_id=excluded.archive_category_id, 
            staff_role_id=excluded.staff_role_id`,
    args: [guildId, openId, closedId, archiveId, staffId]
  });
}

async function getTicketConfig(guildId) {
  const result = await client.execute({
    sql: 'SELECT * FROM ticket_config WHERE guild_id = ?',
    args: [guildId]
  });
  return result.rows[0];
}

async function createTicketEntry(channelId, userId, guildId) {
  await client.execute({
    sql: 'INSERT INTO active_tickets (channel_id, user_id, guild_id) VALUES (?, ?, ?)',
    args: [channelId, userId, guildId]
  });
}

async function updateTicketStatus(channelId, status) {
  await client.execute({
    sql: 'UPDATE active_tickets SET status = ? WHERE channel_id = ?',
    args: [status, channelId]
  });
}

async function getTicketEntry(channelId) {
  const result = await client.execute({
    sql: 'SELECT * FROM active_tickets WHERE channel_id = ?',
    args: [channelId]
  });
  return result.rows[0];
}

module.exports = {
  initDatabase,
  saveMessage,
  getAutoStoreConfigs,
  updateAutoStoreConfig,
  setAutoStoreStatus,
  updateLastNotified,
  setStealStatus,
  isStealActive,
  saveTicketConfig,
  getTicketConfig,
  createTicketEntry,
  updateTicketStatus,
  getTicketEntry
};
