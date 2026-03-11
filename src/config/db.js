const { Pool } = require('pg');
require('dotenv').config(); 

const pool = new Pool({
  // بيقرأ الرابط من ملف الـ .env اللي عملناه
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // السطر ده ضروري جداً للربط مع Supabase و Render
    rejectUnauthorized: false 
  }
});

// اختبار بسيط للتأكد من الاتصال أول ما السيرفر يقوم
pool.connect((err, client, release) => {
  if (err) {
    return console.error('خطأ في الاتصال بقاعدة البيانات:', err.stack);
  }
  console.log('تم الاتصال بـ Supabase بنجاح! 🚀');
  release();
});

module.exports = pool;