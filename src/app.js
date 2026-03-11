require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 

const app = express();
const port = process.env.PORT || 3000; 

// Middlewares
app.use(cors()); 
app.use(express.json());

// --- الصفحة الرئيسية (Interactive API Dashboard) ---
app.get('/', (req, res) => {
    const baseUrl = "https://egypt-voting-system.onrender.com";

    res.status(200).send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>لوحة تحكم API الانتخابات</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f2f5; margin: 0; padding: 20px; color: #333; }
                .container { max-width: 900px; margin: auto; background: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
                h1 { color: #2c3e50; margin-bottom: 10px; border-bottom: 3px solid #3498db; display: inline-block; padding-bottom: 5px; }
                .status-badge { background: #d4edda; color: #155724; padding: 5px 15px; border-radius: 50px; font-weight: bold; font-size: 14px; display: inline-block; margin-bottom: 20px; }
                .endpoint-card { background: #ffffff; border: 1px solid #e1e4e8; border-radius: 12px; padding: 20px; margin-bottom: 15px; text-align: left; direction: ltr; transition: 0.3s; }
                .endpoint-card:hover { transform: translateY(-5px); box-shadow: 0 5px 15px rgba(0,0,0,0.05); border-color: #3498db; }
                .method { font-weight: bold; padding: 5px 10px; border-radius: 6px; margin-right: 10px; font-size: 13px; }
                .get { background: #e3f2fd; color: #1976d2; }
                .post { background: #e8f5e9; color: #2e7d32; }
                .api-link { color: #2c3e50; text-decoration: none; font-family: 'Courier New', Courier, monospace; font-weight: bold; font-size: 16px; }
                .api-link:hover { color: #3498db; text-decoration: underline; }
                .btn-try { float: right; background: #3498db; color: white; text-decoration: none; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: bold; }
                .btn-try:hover { background: #2980b9; }
                .description { margin-top: 10px; color: #666; font-size: 14px; direction: rtl; text-align: right; font-family: 'Segoe UI'; }
                footer { margin-top: 40px; color: #999; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Egypt Voting System API 🇪🇬</h1>
                <br>
                <div class="status-badge">🟢 السيرفر يعمل بنجاح ومتصل بـ Supabase</div>
                
                <div class="endpoint-card">
                    <a href="${baseUrl}/api/governorates" target="_blank" class="btn-try">فتح الرابط 🔗</a>
                    <span class="method get">GET</span>
                    <a href="${baseUrl}/api/governorates" target="_blank" class="api-link">/api/governorates</a>
                    <div class="description">عرض جميع المحافظات المسجلة في قاعدة البيانات (JSON).</div>
                </div>

                <div class="endpoint-card">
                    <span class="method post">POST</span>
                    <span class="api-link">/api/analyze-address</span>
                    <div class="description">تحليل عنوان المستخدم واقتراح الوحدة الإدارية (يُستخدم من تطبيق Flutter).</div>
                </div>

                <div class="endpoint-card">
                    <span class="method post">POST</span>
                    <span class="api-link">/api/register</span>
                    <div class="description">تسجيل بيانات الناخب الجديدة في قاعدة البيانات.</div>
                </div>

                <div class="endpoint-card">
                    <span class="method post">POST</span>
                    <span class="api-link">/api/login</span>
                    <div class="description">التحقق من بيانات الدخول (الرقم القومي وكلمة المرور).</div>
                </div>

                <footer>Mustafa - Graduation Project 2026</footer>
            </div>
        </body>
        </html>
    `);
});

// 1. Get All Governorates
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Smart Administrative Unit Suggestion
app.post('/api/analyze-address', async (req, res) => {
    try {
        const { governorateId, userAddress } = req.body;
        const result = await pool.query(
            'SELECT administrative_id, unit_name FROM administrative_units WHERE governorate_id = $1',
            [governorateId]
        );

        let units = result.rows;
        let matchedUnit = units.find(unit => 
            userAddress.includes(unit.unit_name.replace('مركز ', '').replace('قسم ', '').trim())
        );

        if (matchedUnit) {
            res.json({ 
                success: true, 
                found: true, 
                unitId: matchedUnit.administrative_id, 
                unitName: matchedUnit.unit_name,
                message: `تم تحديد المنطقة: ${matchedUnit.unit_name}`
            });
        } else {
            res.json({ success: true, found: false, message: "لم يتم تحديد المنطقة تلقائياً" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Voter Registration
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, nationalId, dob, address, govId, adminUnitId } = req.body;
        const query = `
            INSERT INTO voters (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING voter_id`;
        
        const result = await pool.query(query, [fullName, email, password, nationalId, dob, address, govId, adminUnitId]);
        res.json({ success: true, message: "تم تسجيل الناخب بنجاح", voterId: result.rows[0].voter_id });
    } catch (error) {
        if (error.code === '23505') {
            res.status(400).json({ success: false, message: "البيانات مسجلة مسبقاً" });
        } else {
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

// 4. Voter Login
app.post('/api/login', async (req, res) => {
    try {
        const { nationalId, password } = req.body;
        const result = await pool.query(
            'SELECT * FROM voters WHERE national_id = $1 AND password_hash = $2',
            [nationalId, password]
        );

        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0] });
        } else {
            res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});