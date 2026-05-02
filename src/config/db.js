const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },

  // ✅ أهم تعديل
  max: 5,                     // قلل عدد الاتصالات
  idleTimeoutMillis: 30000,   // يقفل الاتصال لو مش مستخدم
  connectionTimeoutMillis: 2000
});

// ✅ اختبار الاتصال بطريقة آمنة
pool.on('connect', () => {
  console.log('✅ Database connected successfully');
});

pool.on('error', (err) => {
  console.error('Unexpected DB error', err);
});

module.exports = pool;