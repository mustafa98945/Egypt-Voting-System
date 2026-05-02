const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  keepAlive: true
});

async function queryWithRetry(text, params, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.log(`DB attempt ${i + 1} failed... retrying`);
      
      if (i === retries - 1) throw err;

      await new Promise(res => setTimeout(res, 3000)); // يستنى 3 ثواني
    }
  }
}

module.exports = { pool, queryWithRetry };