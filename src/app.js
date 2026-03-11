require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 

const app = express();
const port = process.env.PORT || 3000; 

app.use(cors()); 
app.use(express.json());

// --- 1. الصفحة الرئيسية لـ Render ---
app.get('/', (req, res) => {
    res.status(200).send(`
        <body style="font-family: sans-serif; text-align: center; background: #f1f5f9; padding: 50px;">
            <h1 style="color: #1e293b;">Voter API Console 🇪🇬</h1>
            <p style="color: #64748b;">النظام جاهز لتسجيل الناخبين واستنتاج المناطق نصياً</p>
        </body>
    `);
});

// --- 2. API تسجيل الناخبين ---
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, nationalId, dob, address, govId } = req.body;

        // جلب المناطق المتاحة للمحافظة (عشان نقارن بالعنوان)
        const unitsResult = await pool.query(
            'SELECT unit_name FROM administrative_units WHERE governorate_id = $1', 
            [govId]
        );

        // البحث الذكي عن اسم المنطقة داخل العنوان
        const matched = unitsResult.rows.find(u => {
            const cleanUnitName = u.unit_name.replace(/مركز|قسم|حي|مدينة/g, '').trim();
            return address.includes(cleanUnitName);
        });

        // النتيجة: يا الاسم يا "غير محدد"
        const finalUnitName = matched ? matched.unit_name : "غير محدد";

        // الحفظ في جدول voters (تطابق كامل مع عواميد الداتابيز عندك)
        const query = `
            INSERT INTO voters 
            (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        
        await pool.query(query, [
            fullName, 
            email, 
            password, 
            nationalId, 
            dob, 
            address, 
            govId, 
            finalUnitName
        ]);

        res.json({ 
            success: true, 
            message: "User Registered Successfully",
            savedUnitName: finalUnitName 
        });

    } catch (e) { 
        console.error("Registration Error:", e.message);
        res.status(500).json({ error: e.message }); 
    }
});

// --- 3. API جلب المحافظات ---
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 4. API تسجيل الدخول ---
app.post('/api/login', async (req, res) => {
    try {
        const { nationalId, password } = req.body;
        const result = await pool.query(
            'SELECT * FROM voters WHERE national_id = $1 AND password_hash = $2', 
            [nationalId, password]
        );
        res.json(result.rows.length > 0 ? { success: true, user: result.rows[0] } : { success: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(port, () => console.log('Server Live on Port ' + port));