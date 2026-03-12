require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 
const bcrypt = require('bcrypt'); 
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors()); 
app.use(express.json());

// --- الصفحة الرئيسية ---
// --- الصفحة الرئيسية الاحترافية ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>نظام التصويت الإلكتروني المصري</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
        <style>
            body {
                font-family: 'Tajawal', sans-serif;
                background-color: #f4f4f4;
                margin: 0;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                text-align: center;
            }
            .container {
                background: white;
                padding: 40px;
                border-radius: 15px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                border-top: 10px solid #ce1126; /* لون علم مصر الأحمر */
            }
            .flag-strip {
                display: flex;
                height: 10px;
                width: 100%;
                position: absolute;
                top: 0;
                left: 0;
            }
            h1 { color: #333; margin-bottom: 10px; }
            p { color: #666; font-size: 1.1em; }
            .status {
                display: inline-block;
                padding: 10px 20px;
                background: #28a745;
                color: white;
                border-radius: 50px;
                font-weight: bold;
                margin-top: 20px;
            }
            .api-link {
                margin-top: 30px;
                font-size: 0.9em;
                color: #007bff;
            }
            .footer { margin-top: 20px; font-size: 0.8em; color: #999; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🇪🇬 منظومة الانتخابات الإلكترونية</h1>
            <p>نظام التصويت الرقمي المؤمن لجمهورية مصر العربية</p>
            <div class="status">السيرفر يعمل بنجاح (Live)</div>
            <div class="api-link">
                المسار الرئيسي للملفات: <code>/api/governorates</code>
            </div>
            <div class="footer">تطوير مصطفى - 2026</div>
        </div>
    </body>
    </html>
    `);
});

// --- API التسجيل مع استنتاج المركز تلقائياً ---
app.post('/api/register', async (req, res) => {
    const { full_name, email, password, national_id, birth_date, governorate_name, address, face_signature } = req.body;

    // التأكد من وجود البيانات الأساسية
    if (!email || !password || !national_id || !address || !governorate_name) {
        return res.status(400).json({
            "success": false,
            "message": "بيانات ناقصة: تأكد من إرسال الإيميل، الباسورد، الرقم القومي، المحافظة، والعنوان"
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        // 1. البحث الذكي عن المركز (مرن جداً لتجنب خطأ لم نتمكن من تحديد المركز)
        const unitQuery = await pool.query(
            `SELECT au.administrative_id, au.unit_name, g.governorate_id 
             FROM administrative_units au
             JOIN governorates g ON au.governorate_id = g.governorate_id
             WHERE (
                $1 LIKE '%' || au.unit_name || '%'  -- هل اسم المركز موجود جوه نص العنوان؟
                OR au.unit_name LIKE '%' || $1 || '%' -- هل نص العنوان فيه كلمة تطابق اسم المركز؟
             )
             AND g.governorate_name = $2 
             LIMIT 1`,
            [address, governorate_name]
        );

        if (unitQuery.rows.length === 0) {
            return res.status(400).json({ 
                "success": false, 
                "message": "لم نتمكن من تحديد المركز من العنوان. يرجى كتابة اسم المركز/القسم بوضوح (مثال: مركز الدلنجات)" 
            });
        }

        const { unit_name, governorate_id } = unitQuery.rows[0];

        // 2. الحفظ في جدول الناخبين
        const newUser = await pool.query(
            `INSERT INTO voters (
                full_name, email, password_hash, national_id, 
                date_of_birth, administrative_unit, address, face_signature, governorate_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING voter_id`,
            [full_name, email, hashedPassword, national_id, birth_date, unit_name, address, face_signature, governorate_id]
        );

        res.status(201).json({ 
            "success": true, 
            "voter_id": newUser.rows[0].voter_id,
            "detected_unit": unit_name 
        });

    } catch (err) {
        console.error("DETAILED ERROR:", err.message);
        res.status(500).json({ "success": false, "message": "خطأ في الداتابيز: " + err.message });
    }
});

// --- API تسجيل الدخول وعرض البيانات كاملة ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const userQuery = `
            SELECT v.*, g.governorate_name 
            FROM voters v
            LEFT JOIN governorates g ON v.governorate_id = g.governorate_id
            WHERE v.email = $1
        `;
        const userResult = await pool.query(userQuery, [email]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ "success": false, "message": "الحساب غير موجود" });
        }

        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ "success": false, "message": "كلمة المرور خطأ" });

        res.json({
            "success": true,
            "message": "تم تسجيل الدخول بنجاح",
            "user_data": {
                "full_name": user.full_name,
                "email": user.email,
                "national_id": user.national_id,
                "birth_date": user.date_of_birth,
                "address_on_card": user.address,
                "governorate": user.governorate_name,
                "detected_administrative_unit": user.administrative_unit,
                "has_voted": user.has_voted
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ "success": false, "message": "خطأ في السيرفر" });
    }
});

// --- API جلب المحافظات ---
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        res.json({ "success": true, "data": result.rows });
    } catch (err) {
        res.status(500).json({ "success": false, "message": "خطأ في جلب المحافظات" });
    }
});

// --- API جلب المحافظات ---
app.get('/api/governorates', async (req, res) => {
    console.log("Request received for /api/governorates"); // هتعرف من الـ Logs إن الطلب وصل فعلاً
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        console.log("Data fetched from DB:", result.rows.length, "rows found");
        
        // حتى لو الجدول فاضي، هيرجع مصفوفة فاضية مش 404
        res.status(200).json({ 
            "success": true, 
            "count": result.rows.length,
            "data": result.rows 
        });
    } catch (err) {
        console.error("DATABASE ERROR:", err.message);
        res.status(500).json({ 
            "success": false, 
            "message": "خطأ في الداتابيز: " + err.message 
        });
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Server is running!'));