const pool = require('../config/db');

class Voter {
    // 1. التأكد من وجود الشخص في السجل المدني (دي اللي كانت ناقصة وموقفة السيرفر)
    static async verifyInRegistry(national_id, birth_date) {
        const result = await pool.query(
            "SELECT * FROM civil_registry WHERE national_id = $1 AND birth_date = $2",
            [national_id, birth_date]
        );
        return result.rows[0];
    }

    // 2. إيجاد ناخب بالإيميل
    static async findByEmail(email) {
        const result = await pool.query(
            `SELECT v.*, c.full_name, c.governorate_name, c.unit_name 
             FROM voters v 
             JOIN civil_registry c ON v.national_id = c.national_id 
             WHERE v.email = $1`, [email]
        );
        return result.rows[0];
    }

    // 3. إيجاد ناخب بالرقم القومي
    static async findByNationalId(nationalId) {
        const result = await pool.query(
            `SELECT v.*, c.full_name, c.governorate_name, c.unit_name 
             FROM voters v 
             JOIN civil_registry c ON v.national_id = c.national_id 
             WHERE v.national_id = $1`, [nationalId]
        );
        return result.rows[0];
    }

    // 4. إنشاء ناخب جديد
    static async create(data) {
        const { national_id, email, password, party_card_url } = data;
        const result = await pool.query(
            `INSERT INTO voters (national_id, email, password, party_card_url) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [national_id, email, password, party_card_url]
        );
        return result.rows[0];
    }
}

module.exports = Voter;