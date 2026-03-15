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
app.post('/api/verify-civil-id', async (req, res) => {
    const { national_id, birth_date, expiry_date } = req.body;

    if (!national_id || !birth_date || !expiry_date) {
        return res.status(400).json({ success: false, message: "حدث خطأ في البيانات المدخلة" });
    }

    try {
        const citizenQuery = await pool.query(
            `SELECT full_name, governorate_name, unit_name, address_details 
             FROM civil_registry 
             WHERE national_id = $1 AND birth_date = $2 AND expiry_date = $3`,
            [national_id, birth_date, expiry_date]
        );

        if (citizenQuery.rows.length === 0) {
            return res.status(401).json({ success: false, message: "حدث خطأ في البيانات المدخلة، يرجى المراجعة" });
        }

        res.json({ 
            success: true, 
            message: "تم التحقق من الهوية بنجاح",
            data: citizenQuery.rows[0] 
        });

    } catch (err) {
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر" });
    }
});

// --- 2. API تسجيل الحساب النهائي ---
app.post('/api/register', async (req, res) => {
    const { 
        national_id, birth_date, expiry_date, 
        email, password, confirm_password 
    } = req.body;

    if (password !== confirm_password) {
        return res.status(400).json({ success: false, message: "حدث خطأ في البيانات المدخلة" });
    }

    try {
        const citizen = await pool.query(
            `SELECT full_name FROM civil_registry 
             WHERE national_id = $1 AND birth_date = $2 AND expiry_date = $3`,
            [national_id, birth_date, expiry_date]
        );

        if (citizen.rows.length === 0) {
            return res.status(401).json({ success: false, message: "حدث خطأ في البيانات المدخلة، يرجى المراجعة" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            `INSERT INTO voters (national_id, email, password) VALUES ($1, $2, $3)`,
            [national_id, email, hashedPassword]
        );

        res.status(201).json({ success: true, message: "تم التحقق من هويتك وإنشاء حسابك بنجاح" });

    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: "حدث خطأ في عملية التسجيل" });
        }
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
                national_id: user.national_id,
                email: user.email,
                governorate: user.governorate_name,
                unit: user.unit_name,
                address: user.address_details,
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