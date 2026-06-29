const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let db = {};

if (process.env.DATABASE_URL) {
  console.log("🌍 DATABASE_URL found. Connecting to PostgreSQL...");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  pool.query(`
    CREATE TABLE IF NOT EXISTS graphs (
      id VARCHAR(255) PRIMARY KEY,
      data TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).then(() => {
    console.log("✅ Connected to PostgreSQL database and ensured table exists.");
  }).catch(err => {
    console.error("❌ Failed to connect to PostgreSQL:", err.message);
  });

  db.query = (text, params, callback) => {
    let pgText = text;
    let index = 1;
    pgText = pgText.replace(/\?/g, () => `$${index++}`);
    pool.query(pgText, params, (err, res) => {
      if (err) return callback(err, null);
      callback(null, res.rows);
    });
  };
  
  db.run = (text, params, callback) => {
    let pgText = text;
    let index = 1;
    pgText = pgText.replace(/\?/g, () => `$${index++}`);
    pool.query(pgText, params, (err, res) => {
      callback(err, res);
    });
  };
  
  db.type = "postgres";

} else {
  console.log("🏠 No DATABASE_URL found. Connecting to local SQLite...");
  const dbPath = path.resolve(__dirname, '../../data');
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
  }

  const dbFile = path.join(dbPath, 'synapse.db');
  const sqliteDb = new sqlite3.Database(dbFile, (err) => {
    if (err) {
      console.error("❌ Failed to connect to SQLite:", err.message);
    } else {
      console.log("✅ Connected to local SQLite database.");
      sqliteDb.run(`CREATE TABLE IF NOT EXISTS graphs (
        id TEXT PRIMARY KEY,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
    }
  });

  db.query = (text, params, callback) => {
    sqliteDb.all(text, params, (err, rows) => {
      callback(err, rows);
    });
  };
  
  db.run = (text, params, callback) => {
    sqliteDb.run(text, params, function(err) {
      callback(err, this);
    });
  };

  db.type = "sqlite";
}

module.exports = db;
