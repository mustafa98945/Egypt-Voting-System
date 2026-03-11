require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 

const app = express();
const port = process.env.PORT || 3000; 

app.use(cors()); 
app.use(express.json());

// --- 1. الصفحة الرئيسية: لوحة تحكم مطوري النظام ---
app.get('/', (req, res) => {
    res.status(200).send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Voter API Dashboard</title>
            <style>
                :root { --primary: #2563eb; --bg: #f8fafc; --text: #0f172a; --card: #ffffff; }
                body { font-family: 'Segoe UI', Tahoma, sans-serif; background: var(--bg); color: var(--text); padding: 40px 20px; margin: 0; }
                .container { max-width: 800px; margin: auto; background: var(--card); padding: 40px; border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); text-align: center; }
                h1 { font-size: 2.2rem; font-weight: 800; color: #1e293b; margin-bottom: 30px; border-bottom: 3px solid var(--primary); display: inline-block; padding-bottom: 10px; }
                .api-list { display: flex; flex-direction: column; gap: 15px; margin-top: 20px; }
                .api-card { background: white; border: 1px solid #e2e8f0; padding: 20px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; direction: ltr; transition: 0.3s; }
                .api-card:hover { transform: translateY(-3px); border-color: var(--primary); box-shadow: 0 10px 20px rgba(0,0,0,0.05); }
                .endpoint { font-family: 'Consolas', monospace; font-weight: bold; color: #334155; }
                .method { font-size: 0.7rem; font-weight: 900; padding: 5px 12px; border-radius: 8px; margin-right: 12px; color: white; }
                .get { background: #3b82f6; }
                .post { background: #10b981; }
                .btn { background: #0f172a; color: white; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 0.9rem; transition: 0.2s; }
                .btn:hover { background: var(--primary); }
                .footer { margin-top: 40px; color: #94a3b8; font-size: 0.8rem; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Voter API Console 🇪🇬</h1>
                <p style="color: #64748b;">نظام الانتخابات الإلكتروني - بوابة الأكواد والخدمات</p>
                <div class="api-list">
                    <div class="api-card">
                        <div><span class="method get">GET</span> <span class="endpoint">/api/governorates</span></div>
                        <a href="/view-logic/gov" class="btn">عرض الكود </></a>
                    </div>
                    <div class="api-card">
                        <div><span class="method post">POST</span> <span class="endpoint">/api/register</span></div>
                        <a href="/view-logic/reg" class="btn">عرض الكود </></a>
                    </div>
                    <div class="api-card">
                        <div><span class="method post">POST</span> <span class="endpoint">/api/login</span></div>
                        <a href="/view-logic/log" class="btn">عرض الكود </></a>
                    </div>
                    <div class="api-card">
                        <div><span class="method post">POST</span> <span class="endpoint">/api/analyze-address</span></div>
                        <a href="/view-logic/anz" class="btn">عرض الكود </></a>
                    </div>
                </div>
                <div class="footer">Mustafa - Smart Voting System Project 2026</div>
            </div>
        </body>
        </html>
    `);
});

// --- 2. عرض الكود المصدري (Logic Viewer) ---
app.get('/view-logic/:type', (req, res) => {
    const codes = {
        gov: `// جلب المحافظات مرتبة أبجدياً\napp.get('/api/governorates', async (req, res) => {\n  const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');\n  res.json(result.rows);\n});`,
        reg: `// تسجيل الناخب مع استنتاج تلقائي للمركز/القسم\napp.post('/api/register', async (req, res) => {\n  const { fullName, email, password, nationalId, dob, address, govId } = req.body;\n\n  // 1. استنتاج المركز من العنوان\n  const units = await pool.query('SELECT administrative_id, unit_name FROM administrative_units WHERE governorate_id = $1', [govId]);\n  const matched = units.rows.find(u => address.includes(u.unit_name.replace('مركز ', '').replace('قسم ', '').trim()));\n  const adminUnitId = matched ? matched.administrative_id : null;\n\n  // 2. الحفظ في الداتابيز\n  const query = 'INSERT INTO voters (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';\n  await pool.query(query, [fullName, email, password, nationalId, dob, address, govId, adminUnitId]);\n  \n  res.json({ success: true, inferredUnit: matched ? matched.unit_name : "Unknown" });\n});`,
        log: `// التحقق من بيانات الدخول\napp.post('/api/login', async (req, res) => {\n  const { nationalId, password } = req.body;\n  const result = await pool.query('SELECT * FROM voters WHERE national_id = $1 AND password_hash = $2', [nationalId, password]);\n  res.json(result.rows.length > 0 ? { success: true, user: result.rows[0] } : { success: false });\n});`,
        anz: `// تحليل العنوان بشكل منفصل\napp.post('/api/analyze-address', async (req, res) => {\n  const { governorateId, userAddress } = req.body;\n  const units = await pool.query('SELECT * FROM administrative_units WHERE governorate_id = $1', [governorateId]);\n  let matched = units.rows.find(u => userAddress.includes(u.unit_name.trim()));\n  res.json(matched ? { success: true, unitId: matched.administrative_id } : { success: false });\n});`
    };

    const source = codes[req.params.type] || "// Code not found";

    res.send(`
        <body style="background: #0f172a; padding: 40px; font-family: monospace; color: #e2e8f0;">
            <div style="max-width: 850px; margin: auto; background: #1e293b; border-radius: 12px; overflow: hidden; border: 1px solid #334155;">
                <div style="background: #334155; padding: 12px 20px; color: #94a3b8; font-size: 13px;">💻 Code Preview - logic.js</div>
                <pre style="margin: 0; padding: 30px; color: #38bdf8; font-size: 16px; line-height: 1.6; overflow-x: auto;">${source}</pre>
            </div>
            <p style="text-align: center;"><a href="/" style="color: #38bdf8; text-decoration: none; font-family: sans-serif;">← العودة للوحة التحكم</a></p>
        </body>
    `);
});

// --- 3. الـ APIs الحقيقية للتشغيل (خدمة تطبيق الفلاتر) ---

// جلب المحافظات
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// تسجيل الناخب الذكي
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, nationalId, dob, address, govId } = req.body;
        
        // استنتاج المركز
        const unitsResult = await pool.query('SELECT administrative_id, unit_name FROM administrative_units WHERE governorate_id = $1', [govId]);
        const matched = unitsResult.rows.find(u => address.includes(u.unit_name.replace('مركز ', '').replace('قسم ', '').trim()));
        const adminUnitId = matched ? matched.administrative_id : null;

        // الحفظ
        const query = 'INSERT INTO voters (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
        await pool.query(query, [fullName, email, password, nationalId, dob, address, govId, adminUnitId]);

        res.json({ success: true, inferredUnit: matched ? matched.unit_name : "Not Found" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    try {
        const { nationalId, password } = req.body;
        const result = await pool.query('SELECT * FROM voters WHERE national_id = $1 AND password_hash = $2', [nationalId, password]);
        res.json(result.rows.length > 0 ? { success: true, user: result.rows[0] } : { success: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(port, () => console.log('Server Live on port ' + port));