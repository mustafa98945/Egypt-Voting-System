require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 

const app = express();
app.use(cors()); 
app.use(express.json());

app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, nationalId, dob, address, govId } = req.body;

        // 1. جلب المناطق
        const unitsResult = await pool.query('SELECT unit_name FROM administrative_units WHERE governorate_id = $1', [govId]);

        // 2. البحث عن تطابق
        const matched = unitsResult.rows.find(u => {
            const clean = u.unit_name.replace(/مركز|قسم|حي|مدينة/g, '').trim();
            return address.includes(clean);
        });

        const finalUnit = matched ? matched.unit_name : "غير محدد";

        // 3. الحفظ في جدول voters
        const query = `
            INSERT INTO voters 
            (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        
        await pool.query(query, [fullName, email, password, nationalId, dob, address, govId, finalUnit]);

        res.json({ 
            success: true, 
            message: "User Registered Successfully", 
            savedAs: finalUnit 
        });

    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Ready!'));