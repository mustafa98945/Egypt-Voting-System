require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 

const app = express();
const port = process.env.PORT || 3000; 

app.use(cors()); 
app.use(express.json());

// --- الصفحة الرئيسية ---
app.get('/', (req, res) => {
    res.status(200).send('<h1>Voter API is Running Successfully 🇪🇬</h1>');
});

// --- API تسجيل الناخبين (النصي) ---
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, nationalId, dob, address, govId } = req.body;

        // 1. جلب المناطق المتاحة للمحافظة المختارة
        const unitsResult = await pool.query(
            'SELECT unit_name FROM administrative_units WHERE governorate_id = $1', 
            [govId]
        );

        // 2. البحث الذكي (مطابقة الكلمات من العنوان)
        const matched = unitsResult.rows.find(u => {
            const cleanUnitName = u.unit_name.replace(/مركز|قسم|حي|مدينة/g, '').trim();
            return address.includes(cleanUnitName);
        });

        // النتيجة النهائية: اسم المنطقة أو "غير محدد"
        const finalUnitName = matched ? matched.unit_name : "غير محدد";

        // 3. الحفظ في الداتابيز (تطابق مع العواميد اللي بعتها لي)
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
        console.error("Internal Error:", e.message);
        res.status(500).json({ error: e.message }); 
    }
});

// --- جلب المحافظات ---
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(port, () => console.log('Server is online on ' + port));