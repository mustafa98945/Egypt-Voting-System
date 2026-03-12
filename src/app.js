require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 

const app = express();
app.use(cors()); 
app.use(express.json());

// 1. تجربة السيرفر (Home)
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Egypt Voting System API</title>
                <style>
                    body { 
                        background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); 
                        color: white; 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        display: flex; 
                        justify-content: center; 
                        align-items: center; 
                        height: 100vh; 
                        margin: 0; 
                        text-align: center;
                    }
                    .container { 
                        background: rgba(255, 255, 255, 0.1); 
                        padding: 30px; 
                        border-radius: 15px; 
                        box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
                        backdrop-filter: blur(4px);
                        border: 1px solid rgba(255, 255, 255, 0.18);
                    }
                    h1 { margin-bottom: 10px; font-size: 2.5rem; }
                    p { font-size: 1.2rem; opacity: 0.9; }
                    .status { 
                        display: inline-block; 
                        margin-top: 20px; 
                        padding: 10px 20px; 
                        background: #27ae60; 
                        border-radius: 50px; 
                        font-weight: bold; 
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🇪🇬 Egypt Voting System</h1>
                    <p>The Backend API is running smoothly</p>
                    <div class="status">● System Online</div>
                </div>
            </body>
        </html>
    `);
});

// 2. كود التسجيل (اللي نجح معاك في Postman)
// POST: /api/register
// POST /api/register
app.post('/api/register', async (req, res) => {
    const { national_id, full_name, birth_date, gender, address, governorate_name, unit_name } = req.body;

    try {
        // 1. نجيب الـ ID بتاع الوحدة الإدارية والمحافظة بناءً على الأسماء اللي بعتها
        const query = `
    SELECT au.administrative_id 
    FROM administrative_units au
    JOIN governorates g ON au.governorate_id = g.governorate_id
    WHERE TRIM(au.unit_name) = $1 
    AND TRIM(g.governorate_name) = $2
`;

        if (unitQuery.rows.length === 0) {
            return res.status(400).json({ error: "الوحدة الإدارية أو المحافظة غير صحيحة" });
        }

        const admin_id = unitQuery.rows[0].administrative_id;

        // 2. نسجل الناخب في جدول الـ voters
        const newVoter = await pool.query(
            `INSERT INTO voters (national_id, full_name, birth_date, gender, address, administrative_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [national_id, full_name, birth_date, gender, address, admin_id]
        );

        res.status(201).json({ message: "تم التسجيل بنجاح", voter: newVoter.rows[0] });

    } catch (err) {
        console.error(err.message);
        res.status(500).send("خطأ في السيرفر");
    }
});

// 3. كود تسجيل الدخول (الـ Login)
// POST: /api/login
// POST /api/login
app.post('/api/login', async (req, res) => {
    const { national_id } = req.body;

    try {
        const voterData = await pool.query(
            `SELECT 
                v.national_id, 
                v.full_name, 
                v.address, 
                g.governorate_name AS governorate,
                au.unit_name AS administrative_unit,
                au.parent_circle AS electoral_circle
             FROM voters v
             JOIN administrative_units au ON v.administrative_id = au.administrative_id
             JOIN governorates g ON au.governorate_id = g.governorate_id
             WHERE v.national_id = $1`,
            [national_id]
        );

        if (voterData.rows.length === 0) {
            return res.status(404).json({ message: "هذا الرقم القومي غير مسجل" });
        }

        // إرسال البيانات كاملة للموبايل أو الويب
        res.json(voterData.rows[0]);

    } catch (err) {
        console.error(err.message);
        res.status(500).send("خطأ في السيرفر");
    }
});
// 4. كود جلب المحافظات (عشان الـ Dropdown في الفرونت)
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_id ASC');
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(process.env.PORT || 3000, () => console.log('Server is running!'));