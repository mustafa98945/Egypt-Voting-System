const pool = require('../config/db');

class Voter {
    // إيجاد ناخب بالإيميل
    static async findByEmail(email) {
        const result = await pool.query(
            `SELECT v.*, c.full_name, c.governorate_name, c.unit_name 
             FROM voters v 
             JOIN civil_registry c ON v.national_id = c.national_id 
             WHERE v.email = $1`, [email]
        );
        return result.rows[0];
    }

    // إيجاد ناخب بالرقم القومي (لبصمة الوجه)
    static async findByNationalId(nationalId) {
        const result = await pool.query(
            `SELECT v.*, c.full_name, c.governorate_name, c.unit_name 
             FROM voters v 
             JOIN civil_registry c ON v.national_id = c.national_id 
             WHERE v.national_id = $1`, [nationalId]
        );
        return result.rows[0];
    }

    // إنشاء ناخب جديد
    static async create(data) {
        const { national_id, email, password, party_card_url } = data;
        return await pool.query(
            `INSERT INTO voters (national_id, email, password, party_card_url) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [national_id, email, password, party_card_url]
        );
    }
}

module.exports = Voter;