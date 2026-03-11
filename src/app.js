app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, nationalId, dob, address, govId } = req.body;

        // سطر "كشف المستور": هيطبع لك في الـ Render Logs أسامي العواميد اللي السيرفر شايفها
        const checkCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'voters'");
        console.log("Columns in Database:", checkCols.rows.map(r => r.column_name));

        const unitsResult = await pool.query('SELECT unit_name FROM administrative_units WHERE governorate_id = $1', [govId]);
        const matched = unitsResult.rows.find(u => address.includes(u.unit_name.replace(/مركز|قسم|حي|مدينة/g, '').trim()));
        const finalUnit = matched ? matched.unit_name : "غير محدد";

        const query = `
            INSERT INTO voters 
            (full_name, email, password_hash, national_id, date_of_birth, address, governorate_id, administrative_unit) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
        
        await pool.query(query, [fullName, email, password, nationalId, dob, address, govId, finalUnit]);
        res.json({ success: true, savedAs: finalUnit });

    } catch (e) { 
        console.error("FULL ERROR:", e.message); // هيطبع التفاصيل في Render Logs
        res.status(500).json({ error: e.message }); 
    }
});