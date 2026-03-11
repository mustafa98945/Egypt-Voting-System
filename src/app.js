require('dotenv').conrequire('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 

const app = express();
const port = process.env.PORT || 3000; 

app.use(cors()); 
app.use(express.json());

// --- الصفحة الرئيسية (Dashboard) بلينكات لكل الروابط ---
app.get('/', (req, res) => {
    const baseUrl = "https://egypt-voting-system.onrender.com";
    res.status(200).send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>لوحة تحكم API الانتخابات</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f0f2f5; padding: 20px; text-align: center; }
                .container { max-width: 800px; margin: auto; background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
                .api-card { border: 1px solid #eee; padding: 15px; margin: 15px 0; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; direction: ltr; }
                .method { font-weight: bold; padding: 5px 12px; border-radius: 6px; font-size: 12px; width: 50px; text-align: center; }
                .get { background: #e3f2fd; color: #1976d2; }
                .post { background: #e8f5e9; color: #2e7d32; }
                .path { font-family: monospace; font-weight: bold; margin-left: 10px; color: #333; }
                .btn { background: #3498db; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: bold; }
                .btn:hover { background: #2980b9; }
                h1 { color: #2c3e50; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>لوحة تحكم API مشروع الانتخابات 🇪🇬</h1>
                <p style="color: #27ae60;">● السيرفر متصل أونلاين ويعمل بنجاح</p>
                <hr>

                <div class="api-card">
                    <div><span class="method get">GET</span><span class="path">/api/governorates</span></div>
                    <a href="${baseUrl}/api/governorates" target="_blank" class="btn">فتح البيانات 🔗</a>
                </div>

                <div class="api-card">
                    <div><span class="method post">POST</span><span class="path">/api/analyze-address</span></div>
                    <a href="${baseUrl}/test/analyze" target="_blank" class="btn" style="background: #2c3e50;">رؤية المثال 📄</a>
                </div>

                <div class="api-card">
                    <div><span class="method post">POST</span><span class="path">/api/register</span></div>
                    <a href="${baseUrl}/test/register" target="_blank" class="btn" style="background: #2c3e50;">رؤية المثال 📄</a>
                </div>

                <div class="api-card">
                    <div><span class="method post">POST</span><span class="path">/api/login</span></div>
                    <a href="${baseUrl}/test/login" target="_blank" class="btn" style="background: #2c3e50;">رؤية المثال 📄</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// --- روابط المساعدة (Test endpoints) ---
app.get('/test/:type', (req, res) => {
    const examples = {
        analyze: { governorateId: 1, userAddress: "شارع المشاية المنصورة" },
        register: { fullName: "اسم المستخدم", nationalId: "2990101...", email: "user@example.com", password: "123" },
        login: { nationalId: "2990101...", password: "123" }
    };
    res.json({ note: "Example for POST request body", example_data: examples[req.params.type] || "Not Found" });
});

// --- الـ API Endpoints الأساسية ---
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/analyze-address', async (req, res) => {
    try {
        const { governorateId, userAddress } = req.body;
        const result = await pool.query('SELECT administrative_id, unit_name FROM administrative_units WHERE governorate_id = $1', [governorateId]);
        let matched = result.rows.find(u => userAddress.includes(u.unit_name.replace('مركز ', '').replace('قسم ', '').trim()));
        res.json(matched ? { success: true, found: true, unitId: matched.administrative_id, unitName: matched.unit_name } : { success: true, found: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, nationalId, dob, address, govId, adminUnitId } = req.body;
        const query = 'INSERT INTO voters (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
        await pool.query(query, [fullName, email, password, nationalId, dob, address, govId, adminUnitId]);
        res.json({ success: true, message: "Registered" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { nationalId, password } = req.body;
        const result = await pool.query('SELECT * FROM voters WHERE national_id = $1 AND password_hash = $2', [nationalId, password]);
        res.json(result.rows.length > 0 ? { success: true, user: result.rows[0] } : { success: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(port, () => console.log(`Server running on port ${port}`));