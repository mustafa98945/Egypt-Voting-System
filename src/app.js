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
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, nationalId, dob, address, govName } = req.body;

        // 1. جلب الـ ID الخاص بالمحافظة للتأكد من وجودها
        const govResult = await pool.query(
            'SELECT governorate_id FROM governorates WHERE governorate_name = $1', 
            [govName]
        );

        if (govResult.rows.length === 0) {
            return res.status(400).json({ success: false, message: "Governorate name not found" });
        }

        const govId = govResult.rows[0].governorate_id;

        // 2. جلب المناطق المتاحة للمطابقة
        const units = await pool.query(
            'SELECT unit_name FROM administrative_units WHERE governorate_id = $1', 
            [govId]
        );

        // 3. البحث عن تطابق المنطقة (Smart Match)
        const matched = units.rows.find(u => 
            address.includes(u.unit_name.replace(/مركز|قسم|حي|مدينة/g, '').trim())
        );
        const finalUnit = matched ? matched.unit_name : "Not Determined";

        // 4. الحفظ في الداتابيز
        const query = `
            INSERT INTO voters 
            (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        
        await pool.query(query, [fullName, email, password, nationalId, dob, address, govId, finalUnit]);

        // 5. النتيجة النهائية بالأسماء مش الأرقام
        res.json({ 
            success: true, 
            message: "Registered Successfully", 
            govName: govName, // رجعنا الاسم بدل الـ ID
            savedUnit: finalUnit 
        });

    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});


// 3. كود تسجيل الدخول (الـ Login)
app.post('/api/login', async (req, res) => {
    try {
        const { nationalId, password } = req.body;
        
        // استخدام JOIN لجلب اسم المحافظة بدل الـ ID
        const query = `
            SELECT 
                v.voter_id, 
                v.full_name, 
                v.email, 
                v.national_id, 
                g.governorate_name AS govName, -- هنا جبنا الاسم
                v.administrative_unit AS savedUnit, 
                v.has_voted 
            FROM voters v
            JOIN governorates g ON v.governorate_id = g.governorate_id
            WHERE v.national_id = $1 AND v.password_hash = $2
        `;
        
        const result = await pool.query(query, [nationalId, password]);

        if (result.rows.length > 0) {
            res.json({ 
                success: true, 
                message: "Login Successful", 
                user: result.rows[0] 
            });
        } else {
            res.status(401).json({ success: false, message: "Invalid National ID or Password" });
        }
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
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