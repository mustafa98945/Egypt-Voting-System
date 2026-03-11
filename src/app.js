require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 

const app = express();
const port = process.env.PORT || 3000; 

app.use(cors()); 
app.use(express.json());

// --- الصفحة الرئيسية (API Dashboard) ---
app.get('/', (req, res) => {
    res.status(200).send(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>Egypt Voting API</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa; color: #333; margin: 0; padding: 20px; text-align: center; }
                .container { max-width: 800px; margin: auto; background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
                h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
                .endpoint { background: #eef2f7; margin: 10px 0; padding: 15px; border-radius: 8px; text-align: left; direction: ltr; }
                code { background: #2c3e50; color: #fff; padding: 3px 8px; border-radius: 4px; }
                .method { font-weight: bold; color: #27ae60; }
                .status { color: #3498db; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Egypt Voting System API 🇪🇬</h1>
                <p class="status">الحالة الآن: السيرفر متصل ويعمل بنجاح 🟢</p>
                
                <div class="endpoint">
                    <span class="method">GET</span> <code>/api/governorates</code>
                    <p style="color: #666; margin: 5px 0;">لتحميل قائمة المحافظات المسجلة.</p>
                </div>

                <div class="endpoint">
                    <span class="method">POST</span> <code>/api/analyze-address</code>
                    <p style="color: #666; margin: 5px 0;">لتحليل عنوان الناخب واقتراح الوحدة الإدارية.</p>
                </div>

                <div class="endpoint">
                    <span class="method">POST</span> <code>/api/register</code>
                    <p style="color: #666; margin: 5px 0;">لتسجيل بيانات الناخب النهائية في قاعدة البيانات.</p>
                </div>
            </div>
        </body>
        </html>
    `);
});

// 1. Get All Governorates
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_name ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Smart Address Suggestion
app.post('/api/analyze-address', async (req, res) => {
    try {
        const { governorateId, userAddress } = req.body;
        const result = await pool.query(
            'SELECT administrative_id, unit_name FROM administrative_units WHERE governorate_id = $1',
            [governorateId]
        );
        let units = result.rows;
        let matchedUnit = units.find(unit => 
            userAddress.includes(unit.unit_name.replace('مركز ', '').replace('قسم ', '').trim())
        );

        if (matchedUnit) {
            res.json({ success: true, found: true, unitId: matchedUnit.administrative_id, unitName: matchedUnit.unit_name });
        } else {
            res.json({ success: true, found: false, message: "حدد الوحدة يدوياً" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Voter Registration
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, nationalId, dob, address, govId, adminUnitId } = req.body;
        const query = `INSERT INTO voters (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;
        const result = await pool.query(query, [fullName, email, password, nationalId, dob, address, govId, adminUnitId]);
        res.json({ success: true, message: "تم التسجيل بنجاح" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});