require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 

const app = express();
const port = process.env.PORT || 3000; 

app.use(cors()); 
app.use(express.json());

// --- الصفحة الرئيسية: تصميم بسيط واحترافي ---
app.get('/', (req, res) => {
    res.status(200).send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>Voter API Dashboard</title>
            <style>
                body { font-family: sans-serif; background: #f4f4f9; color: #333; padding: 40px; text-align: center; }
                .container { max-width: 700px; margin: auto; background: white; padding: 30px; border-radius: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
                .api-item { border: 1px solid #eee; padding: 15px; margin: 15px 0; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; background: #fff; }
                .method { font-weight: bold; color: #3498db; font-family: monospace; }
                .btn { background: #34495e; color: white; text-decoration: none; padding: 10px 20px; border-radius: 5px; font-size: 14px; }
                .btn:hover { background: #2c3e50; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>نظام الانتخابات الذكي - APIs الناخب 🇪🇬</h1>
                <p>اضغط على "عرض المصدر" لمراجعة منطق البرمجة الخاص بكل API</p>
                
                <div class="api-item">
                    <span><span class="method">GET</span> /api/governorates</span>
                    <a href="/code/governorates" class="btn">عرض المصدر </></a>
                </div>

                <div class="api-item">
                    <span><span class="method">POST</span> /api/register</span>
                    <a href="/code/register" class="btn">عرض المصدر </></a>
                </div>

                <div class="api-item">
                    <span><span class="method">POST</span> /api/login</span>
                    <a href="/code/login" class="btn">عرض المصدر </></a>
                </div>

                <div class="api-item">
                    <span><span class="method">POST</span> /api/analyze-address</span>
                    <a href="/code/analyze" class="btn">عرض المصدر </></a>
                </div>
            </div>
        </body>
        </html>
    `);
});

// --- عرض الأكواد بطريقة الـ JSON (لتجنب تحذيرات المتصفح) ---
app.get('/code/:apiName', (req, res) => {
    const snippets = {
        governorates: "app.get('/api/governorates', async (req, res) => {\n  const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');\n  res.json(result.rows);\n});",
        register: "app.post('/api/register', async (req, res) => {\n  const { fullName, email, password, nationalId, dob, address, govId, adminUnitId } = req.body;\n  const query = 'INSERT INTO voters (...) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';\n  await pool.query(query, [fullName, email, password, nationalId, dob, address, govId, adminUnitId]);\n  res.json({ success: true });\n});",
        login: "app.post('/api/login', async (req, res) => {\n  const { nationalId, password } = req.body;\n  const result = await pool.query('SELECT * FROM voters WHERE national_id = $1 AND password_hash = $2', [nationalId, password]);\n  res.json(result.rows.length > 0 ? { success: true, user: result.rows[0] } : { success: false });\n});",
        analyze: "app.post('/api/analyze-address', async (req, res) => {\n  const { governorateId, userAddress } = req.body;\n  const result = await pool.query('SELECT * FROM administrative_units WHERE governorate_id = $1', [governorateId]);\n  let matched = result.rows.find(u => userAddress.includes(u.unit_name.trim()));\n  res.json(matched ? { success: true, unitId: matched.administrative_id } : { success: false });\n});"
    };

    const sourceCode = snippets[req.params.apiName] || "Code not found";
    // نرسلها كـ JSON عشان المتصفح ميعتبرهاش ملف خطر
    res.json({ api: req.params.apiName, source_code: sourceCode });
});

// الـ APIs الحقيقية للتشغيل
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(port, () => console.log('Server Ready'));