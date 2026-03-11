require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 

const app = express();
const port = process.env.PORT || 3000; 

app.use(cors()); 
app.use(express.json());

// --- الصفحة الرئيسية: تصميم شيك وبسيط مش هيعمل Fail ---
app.get('/', (req, res) => {
    const baseUrl = "https://egypt-voting-system.onrender.com";
    res.status(200).send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>لوحة أكواد API الانتخابات</title>
            <style>
                body { font-family: sans-serif; background: #f8fafc; color: #1e293b; padding: 20px; text-align: center; }
                .container { max-width: 600px; margin: auto; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                h1 { color: #2563eb; }
                .card { border: 1px solid #e2e8f0; padding: 15px; margin: 10px 0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; direction: ltr; }
                .btn { background: #1e293b; color: white; text-decoration: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 13px; }
                .btn:hover { background: #334155; }
                .tag { font-weight: bold; font-size: 12px; padding: 3px 8px; border-radius: 4px; }
                .get { background: #dbeafe; color: #1e40af; }
                .post { background: #dcfce7; color: #166534; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Voter API Console 🇪🇬</h1>
                <p>اضغط على "عرض الكود" لمشاهدة الـ Logic الخاص بكل عملية</p>
                <hr style="border: 0; border-top: 1px solid #eee;">
                
                <div class="card">
                    <div><span class="tag get">GET</span> <span>/api/governorates</span></div>
                    <a href="${baseUrl}/view/gov" target="_blank" class="btn">عرض الكود </></a>
                </div>

                <div class="card">
                    <div><span class="tag post">POST</span> <span>/api/register</span></div>
                    <a href="${baseUrl}/view/reg" target="_blank" class="btn">عرض الكود </></a>
                </div>

                <div class="card">
                    <div><span class="tag post">POST</span> <span>/api/login</span></div>
                    <a href="${baseUrl}/view/log" target="_blank" class="btn">عرض الكود </></a>
                </div>

                <div class="card">
                    <div><span class="tag post">POST</span> <span>/api/analyze-address</span></div>
                    <a href="${baseUrl}/view/anz" target="_blank" class="btn">عرض الكود </></a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// --- وظيفة عرض الأكواد (تصميم ثابت وبسيط) ---
app.get('/view/:type', (req, res) => {
    const snippets = {
        gov: `app.get('/api/governorates', async (req, res) => {
    const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
    res.json(result.rows);
});`,
        reg: `app.post('/api/register', async (req, res) => {
    const { fullName, email, password, nationalId, dob, address, govId, adminUnitId } = req.body;
    const query = 'INSERT INTO voters (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
    await pool.query(query, [fullName, email, password, nationalId, dob, address, govId, adminUnitId]);
    res.json({ success: true, message: "Registered" });
});`,
        log: `app.post('/api/login', async (req, res) => {
    const { nationalId, password } = req.body;
    const result = await pool.query('SELECT * FROM voters WHERE national_id = $1 AND password_hash = $2', [nationalId, password]);
    res.json(result.rows.length > 0 ? { success: true, user: result.rows[0] } : { success: false });
});`,
        anz: `app.post('/api/analyze-address', async (req, res) => {
    const { governorateId, userAddress } = req.body;
    const result = await pool.query('SELECT administrative_id, unit_name FROM administrative_units WHERE governorate_id = $1', [governorateId]);
    let matched = result.rows.find(u => userAddress.includes(u.unit_name.replace('مركز ', '').replace('قسم ', '').trim()));
    res.json(matched ? { success: true, found: true, unitId: matched.administrative_id } : { success: true, found: false });
});`
    };

    const code = snippets[req.params.type] || "// Code not found";
    res.send(`
        <body style="background: #111827; color: #10b981; padding: 20px; font-family: monospace; line-height: 1.5;">
            <pre style="background: #1f2937; padding: 20px; border-radius: 8px; border: 1px solid #374151; overflow-x: auto;">${code}</pre>
            <br>
            <a href="/" style="color: #60a5fa; text-decoration: none;">← العودة</a>
        </body>
    `);
});

// --- الـ APIs الحقيقية لتشغيل السيستم ---
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// (بقية الـ APIs زي ما هي في الكود الأصلي)

app.listen(port, () => console.log('Server Live'));