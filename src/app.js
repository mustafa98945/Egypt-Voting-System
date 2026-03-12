require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 
const bcrypt = require('bcrypt'); // سيبنا النسخة دي بس في أول الملف ونقدر نستخدمها في أي مكان تحت
const jwt = require('jsonwebtoken');

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

// 2. كود التسجيل
app.post('/api/register', async (req, res) => {
    const { 
        full_name, email, password, national_id, 
        birth_date, governorate_name, unit_name, 
        address, face_signature 
    } = req.body;

    if (!email || !password || !national_id || !unit_name) {
        return res.status(400).json({
            "success": false,
            "message": "بيانات ناقصة: تأكد من إدخال الإيميل، الباسورد، الرقم القومي، والوحدة الإدارية"
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const unitQuery = await pool.query(
            `SELECT au.administrative_id 
             FROM administrative_units au
             JOIN governorates g ON au.governorate_id = g.governorate_id
             WHERE au.unit_name = $1 AND g.governorate_name = $2`,
            [unit_name, governorate_name]
        );

        if (unitQuery.rows.length === 0) {
            return res.status(400).json({ "success": false, "message": "لم يتم العثور على الدائرة الانتخابية" });
        }

        const admin_id = unitQuery.rows[0].administrative_id;

        const newUser = await pool.query(
            `INSERT INTO voters (
                full_name, email, password_hash, national_id, 
                date_of_birth, administrative_unit, address, face_signature
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING voter_id`,
            [full_name, email, hashedPassword, national_id, birth_date, unit_name, address, face_signature]
        );

        res.status(201).json({
            "success": true,
            "voter_id": newUser.rows[0].voter_id,
            "message": "تم إنشاء الحساب بنجاح وتحديد الدائرة الانتخابية"
        });

    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ "success": false, "message": "الإيميل أو الرقم القومي مسجل بالفعل" });
        }
        console.error(err);
        res.status(500).json({ "success": false, "message": "خطأ داخلي في السيرفر" });
    }
});

// 3. كود تسجيل الدخول
app.post('/api/login', async (req, res) => {
    const { email, password, face_features } = req.body;

    try {
        const userQuery = `
            SELECT v.*, g.governorate_name 
            FROM voters v
            LEFT JOIN governorates g ON v.governorate_id = g.governorate_id
            WHERE v.email = $1
        `;
        const userResult = await pool.query(userQuery, [email]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ "success": false, "message": "هذا الحساب غير موجود" });
        }

        const user = userResult.rows[0];

        if (password) {
            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) return res.status(401).json({ "success": false, "message": "كلمة المرور غير صحيحة" });
        } 
        else if (face_features) {
            const faceMatch = await pool.query(
                'SELECT voter_id FROM voters WHERE voter_id = $1 AND face_signature <-> $2 < 0.1',
                [user.voter_id, face_features]
            );
            if (faceMatch.rows.length === 0) {
                return res.status(401).json({ "success": false, "message": "لم يتم التعرف على الوجه" });
            }
        }

        const token = jwt.sign({ id: user.voter_id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.json({
            "success": true,
            "token": token,
            "user": {
                "voter_id": user.voter_id,
                "full_name": user.full_name,
                "email": user.email,
                "national_id": user.national_id,
                "governorate": user.governorate_name,
                "administrative_unit": user.administrative_unit,
                "has_voted": user.has_voted
            }
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ "success": false, "message": "خطأ داخلي في السيرفر" });
    }
});

// 4. كود جلب المحافظات
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_id ASC');
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(process.env.PORT || 3000, () => console.log('Server is running!'));