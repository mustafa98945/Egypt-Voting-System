require('dotenv').config(); // لازم يكون أول سطر
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 

const app = express();
const port = process.env.PORT || 3000; 

// Middlewares
app.use(cors()); 
app.use(express.json());

// --- الـ API Endpoints ---

// 1. Get All Governorates (تحميل المحافظات)
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. تحليل العنوان واقتراح الوحدة (بدون حفظ في الداتا)
// ده اللي زميلك بتاع الفلاتر هيناديه أول ما المستخدم يصور البطاقة أو يكتب العنوان
app.post('/api/analyze-address', async (req, res) => {
    try {
        const { governorateId, userAddress } = req.body;
        
        // بنجيب كل الوحدات اللي تابعة للمحافظة المختارة
        const result = await pool.query(
            'SELECT administrative_id, unit_name FROM administrative_units WHERE governorate_id = $1',
            [governorateId]
        );

        let units = result.rows;
        
        // منطق الفلترة: بنشيل كلمة "مركز" أو "قسم" عشان لو المستخدم كتب الاسم بس
        let matchedUnit = units.find(unit => {
            const cleanUnitName = unit.unit_name.replace('مركز ', '').replace('قسم ', '').trim();
            return userAddress.includes(cleanUnitName);
        });

        if (matchedUnit) {
            // بنرد عليه باللي لقيناه ونستنى موافقة المستخدم في الفلاتر
            res.json({ 
                success: true, 
                found: true,
                unitId: matchedUnit.administrative_id, 
                unitName: matchedUnit.unit_name,
                message: `هل تقصد أنك تابع لـ (${matchedUnit.unit_name}) بناءً على عنوانك؟` 
            });
        } else {
            res.json({ 
                success: true, 
                found: false, 
                message: "لم نستطع تحديد الوحدة تلقائياً، يرجى اختيارها يدوياً من القائمة." 
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Voter Registration (التسجيل النهائي بعد ضغطة OK)
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, nationalId, dob, address, govId, adminUnitId } = req.body;
        
        const query = `
            INSERT INTO voters (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;
        
        const values = [fullName, email, password, nationalId, dob, address, govId, adminUnitId];
        const result = await pool.query(query, values);

        res.json({ success: true, message: "تم تسجيل الناخب بنجاح في قاعدة البيانات", voterId: result.rows[0].voter_id });
    } catch (error) {
        if (error.code === '23505') {
            res.status(400).json({ success: false, message: "الرقم القومي أو البريد الإلكتروني مسجل مسبقاً" });
        } else {
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

// 4. Voter Login
app.post('/api/login', async (req, res) => {
    try {
        const { nationalId, password } = req.body;
        const result = await pool.query(
            'SELECT * FROM voters WHERE national_id = $1 AND password_hash = $2',
            [nationalId, password]
        );

        if (result.rows.length > 0) {
            res.json({ success: true, message: "تم تسجيل الدخول بنجاح", user: result.rows[0] });
        } else {
            res.status(401).json({ success: false, message: "الرقم القومي أو كلمة المرور غير صحيحة" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});