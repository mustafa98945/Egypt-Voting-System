require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 

const app = express();
app.use(cors()); 
app.use(express.json());

// 1. تجربة السيرفر (Home)
app.get('/', (req, res) => res.send('Voter System API is LIVE 🇪🇬'));

// 2. كود التسجيل (اللي نجح معاك في Postman)
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, nationalId, dob, address, govId } = req.body;
        const units = await pool.query('SELECT unit_name FROM administrative_units WHERE governorate_id = $1', [govId]);
        const matched = units.rows.find(u => address.includes(u.unit_name.replace(/مركز|قسم|حي|مدينة/g, '').trim()));
        const finalUnit = matched ? matched.unit_name : "Not Determined";

        const query = `
            INSERT INTO voters 
            (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        await pool.query(query, [fullName, email, password, nationalId, dob, address, govId, finalUnit]);
        res.json({ success: true, message: "Registered Successfully", savedUnit: finalUnit });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. كود تسجيل الدخول (الـ Login)
app.post('/api/login', async (req, res) => {
    try {
        const { nationalId, password } = req.body;
        
        // البحث عن المستخدم بالرقم القومي والباسورد
        const query = `
            SELECT voter_id, full_name, email, national_id, governorate_id, administrative_unit, has_voted 
            FROM voters 
            WHERE national_id = $1 AND password_hash = $2
        `;
        const result = await pool.query(query, [nationalId, password]);

        if (result.rows.length > 0) {
            res.json({ 
                success: true, 
                message: "Login Successful", 
                user: result.rows[0] 
            });
        } else {
            res.status(401).json({ success: false, message: "Invalid National ID or Password" });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. كود جلب المحافظات (عشان الـ Dropdown في الفرونت)
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_id ASC');
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(process.env.PORT || 3000, () => console.log('Server is running!'));