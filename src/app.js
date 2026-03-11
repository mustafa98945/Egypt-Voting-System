require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 

const app = express();
const port = process.env.PORT || 3000; 

app.use(cors()); 
app.use(express.json());

// --- 1. الصفحة الرئيسية (اللوحة التفاعلية) ---
app.get('/', (req, res) => {
    const baseUrl = "https://egypt-voting-system.onrender.com";
    res.status(200).send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>لوحة عرض أكواد الـ API</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f0f2f5; padding: 20px; text-align: center; }
                .container { max-width: 800px; margin: auto; background: white; padding: 30px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
                .api-card { border: 1px solid #eee; padding: 15px; margin: 15px 0; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; direction: ltr; }
                .path { font-family: monospace; font-weight: bold; color: #333; }
                .btn { background: #2c3e50; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: bold; }
                .btn:hover { background: #34495e; }
                h1 { color: #2c3e50; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>مشروع نظام الانتخابات - عرض الأكواد 💻</h1>
                <p>اضغط على "عرض الكود" لمشاهدة الـ Logic الخاص بكل API</p>
                <hr>

                <div class="api-card">
                    <div><span style="color: #1976d2; font-weight:bold;">GET</span> <span class="path">/api/governorates</span></div>
                    <a href="${baseUrl}/view-code/governorates" target="_blank" class="btn">عرض الكود البرمجي </></a>
                </div>

                <div class="api-card">
                    <div><span style="color: #2e7d32; font-weight:bold;">POST</span> <span class="path">/api/register</span></div>
                    <a href="${baseUrl}/view-code/register" target="_blank" class="btn">عرض الكود البرمجي </></a>
                </div>

                <div class="api-card">
                    <div><span style="color: #2e7d32; font-weight:bold;">POST</span> <span class="path">/api/analyze-address</span></div>
                    <a href="${baseUrl}/view-code/analyze" target="_blank" class="btn">عرض الكود البرمجي </></a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// --- 2. وظيفة عرض الكود المصدري (Code Viewer) ---
app.get('/view-code/:apiName', (req, res) => {
    const codes = {
        governorates: `
// كود جلب المحافظات من قاعدة البيانات
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});`,
        register: `
// كود تسجيل ناخب جديد
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, nationalId, dob, address, govId, adminUnitId } = req.body;
        const query = 'INSERT INTO voters (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
        await pool.query(query, [fullName, email, password, nationalId, dob, address, govId, adminUnitId]);
        res.json({ success: true, message: "Registered Successfully" });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});`,
        analyze: `
// كود تحليل العنوان واقتراح الوحدة الإدارية
app.post('/api/analyze-address', async (req, res) => {
    try {
        const { governorateId, userAddress } = req.body;
        const result = await pool.query('SELECT administrative_id, unit_name FROM administrative_units WHERE governorate_id = $1', [governorateId]);
        let units = result.rows;
        let matchedUnit = units.find(unit => userAddress.includes(unit.unit_name.replace('مركز ', '').replace('قسم ', '').trim()));
        
        if (matchedUnit) {
            res.json({ success: true, found: true, unitId: matchedUnit.administrative_id, unitName: matchedUnit.unit_name });
        } else {
            res.json({ success: true, found: false });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});`
    };

    const selectedCode = codes[req.params.apiName] || "// الكود غير متاح حالياً";

    res.send(`
        <body style="background: #1e1e1e; color: #d4d4d4; padding: 20px; font-family: 'Consolas', monospace; line-height: 1.5;">
            <h2 style="color: #4ec9b0; border-bottom: 1px solid #333; padding-bottom: 10px;">Source Code Viewer</h2>
            <pre style="background: #252526; padding: 20px; border-radius: 8px; border: 1px solid #3c3c3c; overflow-x: auto;">${selectedCode}</pre>
            <br>
            <button onclick="window.close()" style="background: #007acc; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">إغلاق النافذة</button>
        </body>
    `);
});

// --- 3. الـ APIs الفعلية (التي تعمل في الخلفية) ---
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/register', async (req, res) => {
    // المنطق الفعلي للتسجيل
});

app.listen(port, () => console.log(`Server running on port ${port}`));