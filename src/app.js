const express = require('express');
const cors = require('cors'); 
const { sql, config } = require('./config/db');

const app = express();

// التعديل هنا: السيرفر بياخد البورت من البيئة المحيطة (Render) أو 3000 كاحتياطي
const port = process.env.PORT || 3000; 

app.use(cors()); 
app.use(express.json());

// 1. Get All Governorates
app.get('/api/governorates', async (req, res) => {
    try {
        let pool = await sql.connect(config);
        let result = await pool.request().query('SELECT * FROM Governorates');
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Smart Administrative Unit Suggestion
app.post('/api/suggest-unit', async (req, res) => {
    try {
        const { governorateId, userAddress } = req.body;
        if (!governorateId || !userAddress) {
            return res.status(400).json({ success: false, error: "Governorate ID and Address are required" });
        }
        
        let pool = await sql.connect(config);
        let result = await pool.request()
            .input('govId', sql.BigInt, governorateId)
            .query('SELECT Administrative_ID, [Unit Name] FROM [Administrative Unit] WHERE Governorate_ID = @govId');

        let units = result.recordset;
        let matchedUnit = null;

        for (let unit of units) {
            let cleanUnitName = unit['Unit Name'].replace('مركز ', '').replace('قسم ', '').trim();
            if (userAddress.includes(cleanUnitName)) {
                matchedUnit = unit;
                break; 
            }
        }

        if (matchedUnit) {
            res.json({ 
                success: true, 
                unitId: matchedUnit.Administrative_ID, 
                unitName: matchedUnit['Unit Name'] 
            });
        } else {
            res.json({ 
                success: false, 
                errorCode: "UNIT_NOT_FOUND",
                message: "Could not determine administrative unit automatically. Please select manually." 
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Voter Registration
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, nationalId, dob, address, govId, adminUnitId } = req.body;
        let pool = await sql.connect(config);
        await pool.request()
            .input('name', sql.NVarChar, fullName)
            .input('email', sql.NVarChar, email)
            .input('pass', sql.NVarChar, password)
            .input('nId', sql.BigInt, nationalId)
            .input('dob', sql.Date, dob)
            .input('address', sql.NVarChar, address)
            .input('govId', sql.BigInt, govId)
            .input('adminId', sql.BigInt, adminUnitId)
            .query(`INSERT INTO Voter (Name, Email, Password, National_ID, Date_Of_Birth, Address, Governorate_ID, Administrative_ID) 
                    VALUES (@name, @email, @pass, @nId, @dob, @address, @govId, @adminId)`);

        res.json({ success: true, message: "Voter registered successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Voter Login
app.post('/api/login', async (req, res) => {
    try {
        const { nationalId, password } = req.body;
        let pool = await sql.connect(config);
        let result = await pool.request()
            .input('nId', sql.BigInt, nationalId)
            .input('pass', sql.NVarChar, password)
            .query('SELECT * FROM Voter WHERE National_ID = @nId AND Password = @pass');

        if (result.recordset.length > 0) {
            res.json({ success: true, message: "Login successful", user: result.recordset[0] });
        } else {
            res.status(401).json({ success: false, message: "Invalid National ID or Password" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 5. Get Candidates for a specific Unit
app.get('/api/candidates/:adminId', async (req, res) => {
    try {
        const { adminId } = req.params;
        let pool = await sql.connect(config);
        let result = await pool.request()
            .input('adminId', sql.BigInt, adminId)
            .query('SELECT * FROM Candidate WHERE Administrative_ID = @adminId');
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// تشغيل السيرفر
app.listen(port, () => {
    console.log(`Server is running successfully on port ${port}`);
});