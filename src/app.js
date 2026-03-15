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
    res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>منظومة السجل المدني والانتخابات</title>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Tajawal', sans-serif; background-color: #f4f4f4; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; text-align: center; }
            .container { background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border-top: 10px solid #ce1126; }
            .status { display: inline-block; padding: 10px 20px; background: #28a745; color: white; border-radius: 50px; font-weight: bold; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🇪🇬 منظومة الهوية الرقمية المصرية</h1>
            <p>السيرفر متصل بقاعدة بيانات السجل المدني والناخبين</p>
            <div class="status">النظام يعمل بنجاح (Live)</div>
            <p style="margin-top:20px; font-size:0.8em; color:#999;">تطوير مصطفى - 2026</p>
        </div>
    </body>
    </html>
    `);
});

// --- 1. API التحقق من السجل المدني ---
app.post('/api/verify-before-register', async (req, res) => {
    const { national_id, birth_date, expiry_date } = req.body;

    try {
        const citizen = await pool.query(
            `SELECT full_name, governorate_name, unit_name 
             FROM civil_registry 
             WHERE national_id = $1 AND birth_date = $2 AND expiry_date = $3`,
            [national_id, birth_date, expiry_date]
        );

        if (citizen.rows.length === 0) {
            return res.status(401).json({ success: false, message: "حدث خطأ في البيانات المدخلة، يرجى المراجعة" });
        }

        // بنرجع البيانات اللي اليوزر محتاج يشوفها بس
        res.json({ 
            success: true, 
            data: {
                full_name: citizen.rows[0].full_name,
                governorate: citizen.rows[0].governorate_name,
                unit: citizen.rows[0].unit_name
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر" });
    }
});

// --- 2. API تسجيل الحساب النهائي ---
app.post('/api/register', async (req, res) => {
    const { 
        national_id, birth_date, expiry_date, 
        email, password, confirm_password,
        party_card_url // الحقل الجديد اللي جاي من الـ Flutter (اختياري)
    } = req.body;

    if (password !== confirm_password) {
        return res.status(400).json({ success: false, message: "حدث خطأ في البيانات المدخلة" });
    }

    try {
        // 1. التحقق من السجل المدني
        const citizen = await pool.query(
            `SELECT national_id FROM civil_registry 
             WHERE national_id = $1 AND birth_date = $2 AND expiry_date = $3`,
            [national_id, birth_date, expiry_date]
        );

        if (citizen.rows.length === 0) {
            return res.status(401).json({ success: false, message: "حدث خطأ في البيانات المدخلة" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 2. إدخال البيانات في جدول الناخبين
        // استخدمنا || null عشان لو party_card_url مش مبعوت أصلاً ينزل في الجدول NULL
        await pool.query(
            `INSERT INTO voters (national_id, email, password, party_card_url) 
             VALUES ($1, $2, $3, $4)`,
            [national_id, email, hashedPassword, party_card_url || null]
        );

        res.status(201).json({ success: true, message: "تم إنشاء حسابك بنجاح" });

    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: "حدث خطأ في عملية التسجيل" });
        }
        console.error(err.message);
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر" });
    }
});
// --- 3. API تسجيل الدخول (Login) ---
app.post('/api/login', async (req, res) => {
    const { email, password, national_id_from_face } = req.body;

    try {
        let user;

        // الحالة الأولى: بصمة الوجه (من زميلك)
        if (national_id_from_face) {
            const result = await pool.query(
                `SELECT v.*, c.full_name, c.governorate_name, c.unit_name, c.address_details
                 FROM voters v 
                 JOIN civil_registry c ON v.national_id = c.national_id
                 WHERE v.national_id = $1`, [national_id_from_face]
            );
            user = result.rows[0];
            
            if (!user) {
                return res.status(401).json({ success: false, message: "حدث خطأ في عملية تسجيل الدخول" });
            }
        } 
        // الحالة الثانية: إيميل وباسورد
        else if (email && password) {
            const result = await pool.query(
                `SELECT v.*, c.full_name, c.governorate_name, c.unit_name, c.address_details
                 FROM voters v 
                 JOIN civil_registry c ON v.national_id = c.national_id
                 WHERE v.email = $1`, [email]
            );
            user = result.rows[0];

            if (!user) {
                return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });
            }
        } 
        else {
            return res.status(400).json({ success: false, message: "برجاء إدخال بيانات الدخول" });
        }

        // إرسال الرد بالبيانات كاملة شاملة الـ ID الجديد
        res.json({
            success: true,
            message: `أهلاً بك يا ${user.full_name}`,
            user_data: {
                voter_id: user.voter_id, // هنا هيرجع 1، 2، 3...
                full_name: user.full_name,
                governorate: user.governorate_name,
                unit: user.unit_name,
                has_voted: user.has_voted
            }
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر" });
    }
});
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: "حدث خطأ في الداتابيز" });
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Server is running on port 3000!'));