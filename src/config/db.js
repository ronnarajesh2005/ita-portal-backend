const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // Local MySQL auto-generates a self-signed SSL cert on install, and
  // mysql2 can attempt to negotiate SSL automatically even with no ssl
  // option set, then fail verifying that self-signed cert. Explicitly
  // disabling SSL avoids that for local dev.
  //
  // When switching back to Aiven for deployment, replace the line below
  // with the commented-out block underneath it (Aiven requires SSL).
  ssl: false,
  // ssl: {
  //   ca: fs.readFileSync(path.join(__dirname, '..', '..', 'ca.pem')),
  //   rejectUnauthorized: true,
  // },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL connected successfully');
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
  }
}

testConnection();

module.exports = pool;