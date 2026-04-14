const pool = require('../config/db');

class Voter {
    /**
     * 1. التأكد من بيانات المواطن في السجل المدني (Auto-fill Support)
     * تعديل: التأكد من أسماء الأعمدة (administrative_unit بدلاً من unit_name)
     */
    static async verifyInRegistry(national_id, birth_date, expiry_date) {
        const queryText = `
            SELECT 
                cr.full_name, 
                cr.address, 
                cr.national_id,
                g.governorate_name, 
                au.administrative_unit, -- تعديل الاسم حسب جدولك
                au.id as unit_id         -- تعديل الاسم حسب جدولك
            FROM civil_registry cr
            LEFT JOIN governorates g ON cr.governorate = g.governorate_name -- الربط بالاسم حسب بيانات السجل
            LEFT JOIN administrative_units au ON cr.administrative_unit = au.administrative_unit -- الربط بالاسم
            WHERE cr.national_id = $1 AND cr.birth_date = $2 AND cr.expiry_date = $3
        `;
        const result = await pool.query(queryText, [national_id, birth_date, expiry_date]);
        return result.rows[0];
    }

    /**
     * 2. البحث عن ناخب مسجل (Login & Profile Support)
     */
    static async findByIdentifier(identifier, type) {
        let column;

        // تحديد العمود بناءً على نوع البحث
        if (type === 'face' || type === true) {
            column = 'v.national_id';
        } else if (type === 'id') {
            column = 'v.voter_id';
        } else {
            column = 'v.email';
        }

        const queryText = `
            SELECT 
                v.*, 
                cr.full_name, 
                g.governorate_name, 
                au.administrative_unit, -- تعديل الاسم
                v.v_code 
            FROM voters v 
            JOIN civil_registry cr ON v.national_id = cr.national_id 
            LEFT JOIN governorates g ON cr.governorate = g.governorate_name
            LEFT JOIN administrative_units au ON cr.administrative_unit = au.administrative_unit
            WHERE ${column} = $1
        `;

        const result = await pool.query(queryText, [identifier]);
        return result.rows[0];
    }

    /**
     * 3. إنشاء حساب ناخب جديد
     */
    static async create(data) {
        const { national_id, email, password, party_card_url, unit_id } = data;
        
        // ملاحظة: v_code يُفضل أن يكون DEFAULT في الداتابيز
        const queryText = `
            INSERT INTO voters (national_id, email, password, party_card_url, unit_id) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING voter_id, email, national_id
        `;
        const result = await pool.query(queryText, [national_id, email, password, party_card_url, unit_id]);
        return result.rows[0];
    }

    /**
     * 4. تحديث حالة التصويت
     */
    static async markAsVoted(voter_id) {
        const result = await pool.query(
            "UPDATE voters SET has_voted = TRUE WHERE voter_id = $1 RETURNING has_voted",
            [voter_id]
        );
        return result.rows[0];
    }

    /**
     * 5. التحقق من الوجود المسبق
     */
    static async exists(national_id, email) {
        const result = await pool.query(
            "SELECT voter_id FROM voters WHERE national_id = $1 OR email = $2",
            [national_id, email]
        );
        return result.rows.length > 0;
    }
}

module.exports = Voter;