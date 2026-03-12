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
app.get('/', (req, res) => {
    res.send('<h1>🇪🇬 Egypt Voting System API is Live</h1>');
});

// --- API التسجيل مع استنتاج المركز تلقائياً ---
app.post('/api/register', async (req, res) => {
    const { 
        full_name, email, password, national_id, 
        birth_date, governorate_name, address, face_signature 
    } = req.body;

    if (!email || !password || !national_id || !address || !governorate_name) {
        return res.status(400).json({
            "success": false,
            "message": "بيانات ناقصة: تأكد من إدخال الإيميل، الباسورد، الرقم القومي، والمحافظة، والعنوان"
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        // البحث عن المركز داخل نص العنوان
        const unitQuery = await pool.query(
            `SELECT au.administrative_id, au.unit_name 
             FROM administrative_units au
             JOIN governorates g ON au.governorate_id = g.governorate_id
             WHERE $1 LIKE '%' || au.unit_name || '%' 
             AND g.governorate_name = $2 
             LIMIT 1`,
            [address, governorate_name]
        );

        if (unitQuery.rows.length === 0) {
            return res.status(400).json({ 
                "success": false, 
                "message": "عذراً، لم نستطع تحديد المركز من العنوان. اكتب اسم المركز بوضوح." 
            });
        }

        const detectedUnit = unitQuery.rows[0];

        const newUser = await pool.query(
            `INSERT INTO voters (
                full_name, email, password_hash, national_id, 
                date_of_birth, administrative_unit, address, face_signature
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING voter_id`,
            [full_name, email, hashedPassword, national_id, birth_date, detectedUnit.unit_name, address, face_signature]
        );

        res.status(201).json({
            "success": true,
            "detected_unit": detectedUnit.unit_name,
            "message": "تم التسجيل بنجاح وتحديد دائرتك الانتخابية تلقائياً"
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ "success": false, "message": "خطأ داخلي في السيرفر" });
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

// --- API جلب المراكز بناءً على المحافظة ---
app.get('/api/units/:govId', async (req, res) => {
    const { govId } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM administrative_units WHERE governorate_id = $1 ORDER BY unit_name ASC',
            [govId]
        );
        res.json({ "success": true, "data": result.rows });
    } catch (err) {
        res.status(500).json({ "success": false, "message": "خطأ في جلب المراكز" });
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Server is running!'));