require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const pool = require('./config/db'); 

const app = express();
app.use(cors()); 
app.use(express.json());

// 1. تجربة السيرفر (Home)
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Egypt Voting System API</title>
                <style>
                    body { 
                        background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); 
                        color: white; 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        display: flex; 
                        justify-content: center; 
                        align-items: center; 
                        height: 100vh; 
                        margin: 0; 
                        text-align: center;
                    }
                    .container { 
                        background: rgba(255, 255, 255, 0.1); 
                        padding: 30px; 
                        border-radius: 15px; 
                        box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
                        backdrop-filter: blur(4px);
                        border: 1px solid rgba(255, 255, 255, 0.18);
                    }
                    h1 { margin-bottom: 10px; font-size: 2.5rem; }
                    p { font-size: 1.2rem; opacity: 0.9; }
                    .status { 
                        display: inline-block; 
                        margin-top: 20px; 
                        padding: 10px 20px; 
                        background: #27ae60; 
                        border-radius: 50px; 
                        font-weight: bold; 
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🇪🇬 Egypt Voting System</h1>
                    <p>The Backend API is running smoothly</p>
                    <div class="status">● System Online</div>
                </div>
            </body>
        </html>
    `);
});

// 2. كود التسجيل (اللي نجح معاك في Postman)
// POST: /api/register
app.post('/api/register', async (req, res) => {
    try {
        // سحب البيانات مع وضع قيم افتراضية لو حاجة مش موجودة عشان ميديناش Error
        const { 
            fullName, email, password, nationalId, 
            dob = null, address = '', govName, 
            face_encoding = null 
        } = req.body;

        // 1. التأكد من البيانات الأساسية اللي مينفعش تسجل من غيرها
        if (!fullName || !email || !password || !govName) {
            return res.status(400).json({ 
                success: false, 
                message: "بيانات ناقصة: تأكد من إرسال الاسم والإيميل والباسورد والمحافظة" 
            });
        }

        // 2. فحص بصمة الوش (لو مبعوتة)
        if (face_encoding) {
            const faceCheck = await pool.query('SELECT voter_id FROM voters WHERE face_signature = $1', [face_encoding]);
            if (faceCheck.rows.length > 0) {
                return res.status(400).json({ success: false, message: "هذا الوجه مسجل بالفعل بحساب آخر" });
            }
        }

        // 3. جلب ID المحافظة
        const govResult = await pool.query('SELECT governorate_id FROM governorates WHERE governorate_name = $1', [govName]);
        if (govResult.rows.length === 0) {
            return res.status(400).json({ success: false, message: "المحافظة التي اخترتها غير موجودة" });
        }
        const govId = govResult.rows[0].governorate_id;

        // 4. الحفظ النهائي (استخدام VALUES آمنة)
        const query = `
            INSERT INTO voters 
            (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, face_signature) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        
        await pool.query(query, [fullName, email, password, nationalId, dob, address, govId, face_encoding]);

        res.json({ success: true, message: "تم تسجيل الحساب وبصمة الوجه الوهمية بنجاح!" });

    } catch (e) {
        console.error("Registration Error:", e.message);
        res.status(500).json({ error: "خطأ في السيرفر: " + e.message });
    }
});

// 3. كود تسجيل الدخول (الـ Login)
// POST: /api/login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const query = `
            SELECT 
                v.voter_id, v.full_name, v.email, v.national_id, 
                g.governorate_name AS govname, v.administrative_unit, v.has_voted
            FROM voters v
            JOIN governorates g ON v.governorate_id = g.governorate_id
            WHERE v.email = $1 AND v.password_hash = $2
        `;
        
        const result = await pool.query(query, [email, password]);

        if (result.rows.length > 0) {
            res.json({ 
                success: true, 
                user: result.rows[0] // هيرجع الاسم، المحافظة، وحالة التصويت
            });
        } else {
            res.status(401).json({ success: false, message: "الإيميل أو كلمة السر خطأ" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// 4. كود جلب المحافظات (عشان الـ Dropdown في الفرونت)
app.get('/api/governorates', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM governorates ORDER BY governorate_id ASC');
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(process.env.PORT || 3000, () => console.log('Server is running!'));