require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); // تأكد إن الفولدر ده موجود والملف جواه
const bcrypt = require('bcrypt'); 
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors()); 
app.use(express.json());

// --- الصفحة الرئيسية ---
app.get('/', (req, res) => {
    res.send('<h1>🇪🇬 Egypt Voting System API is Live</h1>');
});

// --- API التسجيل ---
app.post('/api/register', async (req, res) => {
    // شلنا الـ unit_name من هنا لأننا هنطلعه من الـ address
    const { 
        full_name, email, password, national_id, 
        birth_date, governorate_name, address, face_signature 
    } = req.body;

    // 1. التعديل هنا: شلنا الـ unit_name من شرط الـ Validation
    if (!email || !password || !national_id || !address || !governorate_name) {
        return res.status(400).json({
            "success": false,
            "message": "بيانات ناقصة: تأكد من إدخال الإيميل، الباسورد، الرقم القومي، والمحافظة، والعنوان كما في البطاقة"
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        // 2. الـ SQL Query اللي بتدور على اسم المركز جوه نص العنوان
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
                "message": "عذراً، لم نستطع تحديد المركز/القسم من العنوان المكتوب. تأكد من كتابة اسم المركز بوضوح (مثلاً: مركز الدلنجات)" 
            });
        }

        const detectedUnit = unitQuery.rows[0];

        // 3. الحفظ النهائي باستخدام الوحدة المستنتجة
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

// --- API تسجيل الدخول (الـ Login) ---
aapp.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Query بتجيب بيانات المستخدم + اسم المحافظة بتاعته
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

        // التأكد من الباسورد
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ "success": false, "message": "كلمة المرور خطأ" });

        // الرد اللي هيطلعلك فيه كل معلومات التسجيل
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
                "detected_administrative_unit": user.administrative_unit, // دي اللي استنتجناها من العنوان
                "has_voted": user.has_voted,
                "created_at": user.created_at
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ "success": false, "message": "خطأ في السيرفر" });
    }
});

// 4. كود جلب المحافظات (عشان القائمة المنسدلة في التطبيق)
// GET /api/governorates
app.get('/api/governorates', async (req, res) => {
    try {
        // Query بتجيب كل المحافظات من الجدول اللي رفعناه من الـ PDF
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        
        // إرجاع البيانات في شكل Array
        res.json({
            "success": true,
            "count": result.rows.length,
            "data": result.rows
        });
    } catch (err) {
        console.error("Error fetching governorates:", err);
        res.status(500).json({ 
            "success": false, 
            "message": "خطأ في جلب بيانات المحافظات" 
        });
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Server is running!'));