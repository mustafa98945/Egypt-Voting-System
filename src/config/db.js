const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,                    // قلل أكتر
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 1000
});

pool.on('connect', () => {
  console.log('✅ Connected to Supabase via Pooler');
});

pool.on('error', (err) => {
  console.error('🔥 DB Error:', err);
});

module.exports = pool;