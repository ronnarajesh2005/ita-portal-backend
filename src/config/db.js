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
  // SSL is auto-selected by environment:
  //  - Production (Render → Aiven): Aiven requires SSL, verified against
  //    its CA cert (ca.pem lives at the backend repo root).
  //  - Development (local MySQL): SSL off — local MySQL's self-signed cert
  //    would otherwise fail verification.
  // Render must set NODE_ENV=production for the Aiven branch to apply.
  ssl: process.env.NODE_ENV === 'production'
    ? {
        ca: fs.readFileSync(path.join(__dirname, '..', '..', 'ca.pem')),
        rejectUnauthorized: true,
      }
    : false,
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