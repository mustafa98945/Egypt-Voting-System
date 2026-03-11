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

        // Fetch units for matching
        const units = await pool.query('SELECT unit_name FROM administrative_units WHERE governorate_id = $1', [govId]);
        
        const matched = units.rows.find(u => {
            const clean = u.unit_name.replace(/مركز|قسم|حي|مدينة/g, '').trim();
            return address.includes(clean);
        });

        const finalUnitName = matched ? matched.unit_name : "Not Determined";

        // Insertion using the correct column name
        const query = `
            INSERT INTO voters 
            (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        
        await pool.query(query, [fullName, email, password, nationalId, dob, address, govId, finalUnitName]);
        
        res.json({ success: true, message: "Registered Successfully", savedUnit: finalUnitName });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Server Ready'));