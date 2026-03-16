const pool = require('../config/db');

class Voter {
    // 1. التأكد من بيانات المواطن في السجل المدني قبل السماح له بإنشاء حساب
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
            // بحث بالرقم القومي (بصمة الوجه) - بنعمل Join عشان نجيب الاسم والمحافظة
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

    // 3. إنشاء حساب ناخب جديد وحفظ بياناته ورابط الكارنيه/البطاقة
    static async create(data) {
        const { national_id, email, password, party_card_url } = data;
        const result = await pool.query(
            `INSERT INTO voters (national_id, email, password, party_card_url) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [national_id, email, password, party_card_url]
        );
        return result.rows[0];
    }

    // 4. دالة إضافية: تحديث حالة التصويت (هتحتاجها لما نبدأ جزء الـ Voting)
    static async markAsVoted(voter_id) {
        await pool.query(
            "UPDATE voters SET has_voted = TRUE WHERE voter_id = $1",
            [voter_id]
        );
    }
}

module.exports = Voter;