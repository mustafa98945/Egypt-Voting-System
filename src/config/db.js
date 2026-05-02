const { Pool } = require('pg');
require('dotenv').config();

// ✅ تأكد إن DATABASE_URL هو رابط Transaction Pooler (port 6543)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },

  // ✅ مهم جداً في Free plan
  max: 3,                    // عدد قليل من الاتصالات
  idleTimeoutMillis: 10000,  // يقفل الاتصال بعد 10 ثواني لو مش مستخدم
  connectionTimeoutMillis: 2000
});

// ✅ تأكيد الاتصال
pool.on('connect', () => {
  console.log('✅ Connected to Supabase (Transaction Pooler)');
});

// ✅ مراقبة الأخطاء
pool.on('error', (err) => {
  console.error('🔥 Unexpected DB Error:', err);
});

// ✅ Export
module.exports = pool;