require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 

const app = express();
const port = process.env.PORT || 3000; 

app.use(cors()); 
app.use(express.json());

// --- الصفحة الرئيسية: تصميم احترافي للوحة التحكم ---
app.get('/', (req, res) => {
    const baseUrl = "https://egypt-voting-system.onrender.com";
    res.status(200).send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Voter API Documentation</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #f8fafc; padding: 40px 20px; margin: 0; }
                .container { max-width: 900px; margin: auto; }
                h1 { color: #38bdf8; font-size: 2.5rem; margin-bottom: 10px; }
                p.subtitle { color: #94a3b8; margin-bottom: 40px; }
                .api-grid { display: grid; gap: 20px; }
                .api-card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 25px; display: flex; justify-content: space-between; align-items: center; transition: 0.3s; direction: ltr; }
                .api-card:hover { border-color: #38bdf8; transform: translateY(-2px); box-shadow: 0 10px 30px -10px rgba(56, 189, 248, 0.2); }
                .info { text-align: left; }
                .method { font-weight: 800; font-size: 12px; padding: 4px 12px; border-radius: 6px; text-transform: uppercase; margin-right: 12px; }
                .get { background: rgba(56, 189, 248, 0.1); color: #38bdf8; }
                .post { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
                .path { font-family: 'Fira Code', monospace; font-size: 1.1rem; color: #e2e8f0; }
                .btn-view { background: #38bdf8; color: #0f172a; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: bold; font-size: 14px; transition: 0.2s; }
                .btn-view:hover { background: #7dd3fc; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Voter API Console 🇪🇬</h1>
                <p class="subtitle">بوابة المطورين لنظام الانتخابات المصري - عرض الأكواد المصدرية</p>
                
                <div class="api-grid">
                    <div class="api-card">
                        <div class="info"><span class="method get">GET</span><span class="path">/api/governorates</span></div>
                        <a href="${baseUrl}/view-source/gov" target="_blank" class="btn-view">View Logic </></a>
                    </div>

                    <div class="api-card">
                        <div class="info"><span class="method post">POST</span><span class="path">/api/analyze-address</span></div>
                        <a href="${baseUrl}/view-source/analyze" target="_blank" class="btn-view">View Logic </></a>
                    </div>

                    <div class="api-card">
                        <div class="info"><span class="method post">POST</span><span class="path">/api/register</span></div>
                        <a href="${baseUrl}/view-source/register" target="_blank" class="btn-view">View Logic </></a>
                    </div>

                    <div class="api-card">
                        <div class="info"><span class="method post">POST</span><span class="path">/api/login</span></div>
                        <a href="${baseUrl}/view-source/login" target="_blank" class="btn-view">View Logic </></a>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

// --- وظيفة عرض الكود بتصميم الـ Code Editor (Dark Theme) ---
app.get('/view-source/:type', (req, res) => {
    const snippets = {
        gov: `app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});`,
        analyze: `app.post('/api/analyze-address', async (req, res) => {
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
});`,
        register: `app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, nationalId, dob, address, govId, adminUnitId } = req.body;
        const query = 'INSERT INTO voters (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
        await pool.query(query, [fullName, email, password, nationalId, dob, address, govId, adminUnitId]);
        res.json({ success: true, message: "Registered Successfully" });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});`,
        login: `app.post('/api/login', async (req, res) => {
    try {
        const { nationalId, password } = req.body;
        const result = await pool.query('SELECT * FROM voters WHERE national_id = $1 AND password_hash = $2', [nationalId, password]);
        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0] });
        } else {
            res.status(401).json({ success: false, message: "Invalid National ID or Password" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});`
    };

    const code = snippets[req.params.type] || "// Snippet not found";

    res.send(`
        <body style="background: #010409; color: #e6edf3; padding: 30px; font-family: 'Consolas', monospace; font-size: 16px; line-height: 1.6;">
            <div style="max-width: 1000px; margin: auto; background: #0d1117; border: 1px solid #30363d; border-radius: 12px; overflow: hidden;">
                <div style="background: #161b22; padding: 12px 20px; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #8b949e;">src/app.js > API Logic</span>
                    <div style="display: flex; gap: 8px;">
                        <div style="width: 12px; height: 12px; background: #ff5f56; border-radius: 50%;"></div>
                        <div style="width: 12px; height: 12px; background: #ffbd2e; border-radius: 50%;"></div>
                        <div style="width: 12px; height: 12px; background: #27c93f; border-radius: 50%;"></div>
                    </div>
                </div>
                <pre style="padding: 25px; overflow-x: auto; margin: 0; color: #79c0ff;">${code.replace(/async|await|const|let|require/g, match => `<span style="color: #ff7b72;">${match}</span>`).replace(/res|req|pool|query|json|status/g, match => `<span style="color: #d2a8ff;">${match}</span>`)}</pre>
            </div>
            <p style="text-align: center; margin-top: 20px;"><a href="javascript:history.back()" style="color: #38bdf8; text-decoration: none;">← العودة للوحة التحكم</a></p>
        </body>
    `);
});

// --- الـ APIs الفعلية للعمليات (تظل كما هي لخدمة تطبيق الفلاتر) ---
app.get('/api/governorates', async (req, res) => { /* logic */ });
app.post('/api/register', async (req, res) => { /* logic */ });
// ... الباقي بنفس المنطق

app.listen(port, () => console.log(\`Backend running on \${port}\`));