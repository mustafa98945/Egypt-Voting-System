const pool = require('../config/db');

class Voter {
    // 1. التأكد من بيانات المواطن في السجل المدني (الخطوة الصفرية)
    static async verifyInRegistry(national_id, birth_date, expiry_date) {
        const result = await pool.query(
            "SELECT * FROM civil_registry WHERE national_id = $1 AND birth_date = $2 AND expiry_date = $3",
            [national_id, birth_date, expiry_date]
        );
        return result.rows[0];
    }

    // 2. البحث عن ناخب مسجل (يدعم الدخول بالإيميل أو الرقم القومي/الوجه)
    static async findByIdentifier(identifier, isFaceLogin) {
        let queryText;
        if (isFaceLogin) {
            // بحث بالرقم القومي (بصمة الوجه) - بنجيب بيانات السجل المدني معاه
            queryText = `
                SELECT v.*, cr.full_name, cr.governorate_name, cr.unit_name 
                FROM voters v 
                JOIN civil_registry cr ON v.national_id = cr.national_id 
                WHERE v.national_id = $1`;
        } else {
            // بحث بالإيميل (الدخول التقليدي)
            queryText = `
                SELECT v.*, cr.full_name, cr.governorate_name, cr.unit_name 
                FROM voters v 
                JOIN civil_registry cr ON v.national_id = cr.national_id 
                WHERE v.email = $1`;
        }

        const result = await pool.query(queryText, [identifier]);
        return result.rows[0];
    }

    // 3. إنشاء حساب ناخب جديد (بيستلم الروابط الجاهزة من الـ Controller)
    static async create(data) {
        const { national_id, email, password, party_card_url } = data;
        
        // استخدام RETURNING * عشان نرجع بيانات الناخب بعد الكريات فوراً لو محتاجينها
        const result = await pool.query(
            `INSERT INTO voters (national_id, email, password, party_card_url) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [national_id, email, password, party_card_url]
        );
        return result.rows[0];
    }

    // 4. تحديث حالة التصويت (مهم جداً لجزء الـ Voting بكرة)
    static async markAsVoted(voter_id) {
        const result = await pool.query(
            "UPDATE voters SET has_voted = TRUE WHERE voter_id = $1 RETURNING has_voted",
            [voter_id]
        );
        return result.rows[0];
    }

    // 5. دالة إضافية (للتأكد من وجود البريد أو الرقم القومي قبل التسجيل)
    static async exists(national_id, email) {
        const result = await pool.query(
            "SELECT voter_id FROM voters WHERE national_id = $1 OR email = $2",
            [national_id, email]
        );
        return result.rows.length > 0;
    }
}

module.exports = Voter;