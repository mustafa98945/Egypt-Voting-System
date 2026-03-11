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
    res.status(200).send(`
        <body style="font-family: sans-serif; text-align: center; background: #f1f5f9; padding: 50px;">
            <h1 style="color: #1e293b;">Voter API Console 🇪🇬</h1>
            <p style="color: #64748b;">نظام الانتخابات - وضع تخزين الأسماء (Text Mode)</p>
            <div style="margin-top: 20px;">
                <a href="/view-logic/reg" style="background:#0f172a; color:white; padding:10px 20px; text-decoration:none; border-radius:8px;">عرض الكود</a>
            </div>
        </body>
    `);
});

// --- عرض منطق الكود ---
app.get('/view-logic/reg', (req, res) => {
    const code = `app.post('/api/register', async (req, res) => {
  const { address, govId } = req.body;
  const units = await pool.query('SELECT unit_name FROM administrative_units WHERE governorate_id = $1', [govId]);
  const matched = units.rows.find(u => address.includes(u.unit_name.replace(/مركز|قسم|حي|مدينة/g, '').trim()));
  const finalUnit = matched ? matched.unit_name : "غير محدد";
  // INSERT INTO voters ... (administrative_unit) VALUES (finalUnit)
});`;
    res.send(`<body style="background:#0f172a; color:#38bdf8; padding:30px;"><pre>${code}</pre></body>`);
});

// --- API تسجيل الناخبين (التخزين النصي) ---
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, nationalId, dob, address, govId } = req.body;

        // 1. جلب المناطق المتاحة للمحافظة
        const unitsResult = await pool.query('SELECT unit_name FROM administrative_units WHERE governorate_id = $1', [govId]);

        // 2. البحث عن تطابق داخل العنوان
        const matched = unitsResult.rows.find(u => {
            const cleanUnitName = u.unit_name.replace(/مركز|قسم|حي|مدينة/g, '').trim();
            return address.includes(cleanUnitName);
        });

        // 3. تحديد الاسم النهائي
        const finalUnitName = matched ? matched.unit_name : "غير محدد";

        // 4. الحفظ في الداتابيز (تأكد من اسم العمود administrative_unit)
        const query = `
    INSERT INTO voters 
    (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
`;له
        
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
        res.status(500).json({ error: e.message }); 
    }
});

// --- API تسجيل الدخول ---
app.post('/api/login', async (req, res) => {
    try {
        const { nationalId, password } = req.body;
        const result = await pool.query('SELECT * FROM voters WHERE national_id = $1 AND password_hash = $2', [nationalId, password]);
        res.json(result.rows.length > 0 ? { success: true, user: result.rows[0] } : { success: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- جلب المحافظات ---
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(port, () => console.log('Server Ready on ' + port));