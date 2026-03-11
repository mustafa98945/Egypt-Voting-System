require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 

const app = express();
const port = process.env.PORT || 3000; 

app.use(cors()); 
app.use(express.json());

// --- 1. الصفحة الرئيسية (The Dashboard) ---
app.get('/', (req, res) => {
    const baseUrl = "https://egypt-voting-system.onrender.com";
    res.status(200).send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>لوحة تحكم API الانتخابات</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f7f6; padding: 20px; text-align: center; }
                .container { max-width: 800px; margin: auto; background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
                .api-card { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; direction: ltr; }
                .method { font-weight: bold; padding: 5px 10px; border-radius: 5px; width: 60px; text-align: center; }
                .get { background: #d1ecf1; color: #0c5460; }
                .post { background: #d4edda; color: #155724; }
                .btn { background: #3498db; color: white; text-decoration: none; padding: 8px 15px; border-radius: 5px; font-size: 13px; }
                .btn:hover { background: #2980b9; }
                h2 { color: #2c3e50; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🇪🇬 نظام انتخابات مصر - الـ API الخاص بك</h2>
                <p>اضغط على "فتح" لرؤية النتيجة أو مثال للبيانات</p>
                <hr>
                
                <div class="api-card">
                    <div><span class="method get">GET</span> <span>/api/governorates</span></div>
                    <a href="${baseUrl}/api/governorates" target="_blank" class="btn">فتح الداتا الحقيقية 🔗</a>
                </div>

                <div class="api-card">
                    <div><span class="method post">POST</span> <span>/api/analyze-address</span></div>
                    <a href="${baseUrl}/help/analyze" target="_blank" class="btn" style="background: #7f8c8d;">رؤية مثال الـ JSON 📄</a>
                </div>

                <div class="api-card">
                    <div><span class="method post">POST</span> <span>/api/register</span></div>
                    <a href="${baseUrl}/help/register" target="_blank" class="btn" style="background: #7f8c8d;">رؤية مثال الـ JSON 📄</a>
                </div>

                <div class="api-card">
                    <div><span class="method post">POST</span> <span>/api/login</span></div>
                    <a href="${baseUrl}/help/login" target="_blank" class="btn" style="background: #7f8c8d;">رؤية مثال الـ JSON 📄</a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// --- 2. صفحات المساعدة (لعرض شكل الـ POST Data) ---
app.get('/help/:type', (req, res) => {
    const examples = {
        analyze: { governorateId: 1, userAddress: "أنا ساكن في المنصورة شارع المشاية" },
        register: { fullName: "Mustafa Ahmed", nationalId: "12345678901234", password: "123", email: "test@test.com" },
        login: { nationalId: "12345678901234", password: "123" }
    };
    const data = examples[req.params.type] || { message: "No example found" };
    res.json({ info: "This is a POST example. Use this structure in Flutter/Postman", example_body: data });
});

// --- 3. الـ API Endpoints الحقيقية ---

// Get Governorates
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Smart Suggestion
app.post('/api/analyze-address', async (req, res) => {
    try {
        const { governorateId, userAddress } = req.body;
        const result = await pool.query('SELECT administrative_id, unit_name FROM administrative_units WHERE governorate_id = $1', [governorateId]);
        let matched = result.rows.find(u => userAddress.includes(u.unit_name.replace('مركز ', '').replace('قسم ', '').trim()));
        res.json(matched ? { success: true, found: true, unitId: matched.administrative_id, unitName: matched.unit_name } : { success: true, found: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, nationalId, dob, address, govId, adminUnitId } = req.body;
        const query = `INSERT INTO voters (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
        await pool.query(query, [fullName, email, password, nationalId, dob, address, govId, adminUnitId]);
        res.json({ success: true, message: "Registered successfully" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { nationalId, password } = req.body;
        const result = await pool.query('SELECT * FROM voters WHERE national_id = $1 AND password_hash = $2', [nationalId, password]);
        res.json(result.rows.length > 0 ? { success: true, user: result.rows[0] } : { success: false, message: "Invalid credentials" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(port, () => { console.log(`Server running on port ${port}`); });