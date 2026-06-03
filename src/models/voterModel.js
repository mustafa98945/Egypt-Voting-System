const { pool } = require('../config/db');

class Voter {

    ////////////////////////////////////////////////////////////
    // ✅ 1. التحقق من السجل المدني + حساب العمر من DB
    ////////////////////////////////////////////////////////////
    static async verifyInRegistry(nationalId, birthDate, expiryDate) {
        const query = `
            SELECT 
                TRIM(national_id) AS national_id,
                full_name,
                address,
                governorate,
                administrative_unit,
                birth_date,
                DATE_PART('year', AGE(CURRENT_DATE, birth_date))::INT AS age
            FROM civil_registry
            WHERE TRIM(national_id) = TRIM($1)
              AND birth_date = $2::date
              AND expiry_date = $3::date
            LIMIT 1
        `;

        const { rows } = await pool.query(query, [
            nationalId,
            birthDate,
            expiryDate
        ]);

        return rows[0];
    }

    ////////////////////////////////////////////////////////////
    // ✅ 2. التحقق من التكرار
    ////////////////////////////////////////////////////////////
    static async checkDuplicate(email, nationalId) {
        const query = `
            SELECT 1
            FROM voters
            WHERE email = $1
               OR TRIM(national_id) = TRIM($2)
            LIMIT 1
        `;

        const { rows } = await pool.query(query, [email, nationalId]);
        return rows[0];
    }

    ////////////////////////////////////////////////////////////
    // ✅ 3. إنشاء ناخب
    ////////////////////////////////////////////////////////////
    static async create(voterData) {
        const { national_id, email, password, party_card_url } = voterData;

        const query = `
            INSERT INTO voters (national_id, email, password, party_card_url)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;

        const { rows } = await pool.query(query, [
            national_id,
            email,
            password,
            party_card_url || null
        ]);

        return rows[0];
    }

    ////////////////////////////////////////////////////////////
    // ✅ 4. البحث بالبريد الإلكتروني
    ////////////////////////////////////////////////////////////
    static async findByEmail(email) {
        const query = `
            SELECT 
                v.voter_id,
                v.national_id,
                v.email,
                v.password,
                v.party_card_url,
                cr.full_name,
                cr.address,
                cr.governorate,
                cr.administrative_unit,
                cr.birth_date,
                DATE_PART('year', AGE(CURRENT_DATE, cr.birth_date))::INT AS age
            FROM voters v
            JOIN civil_registry cr
              ON TRIM(v.national_id) = TRIM(cr.national_id)
            WHERE v.email = $1
            LIMIT 1
        `;

        const { rows } = await pool.query(query, [email]);
        return rows[0];
    }

    ////////////////////////////////////////////////////////////
    // ✅ 5. البحث بالرقم القومي
    ////////////////////////////////////////////////////////////
    static async findByNationalId(nationalId) {
        const query = `
            SELECT 
                v.voter_id,
                v.national_id,
                v.email,
                v.password,
                v.party_card_url,
                cr.full_name,
                cr.address,
                cr.governorate,
                cr.administrative_unit,
                cr.birth_date,
                DATE_PART('year', AGE(CURRENT_DATE, cr.birth_date))::INT AS age
            FROM voters v
            JOIN civil_registry cr
              ON TRIM(v.national_id) = TRIM(cr.national_id)
            WHERE TRIM(v.national_id) = TRIM($1)
            LIMIT 1
        `;

        const { rows } = await pool.query(query, [nationalId]);
        return rows[0];
    }

    ////////////////////////////////////////////////////////////
    // ✅ 6. Profile Data
    ////////////////////////////////////////////////////////////
    static async findProfileById(voterId) {
        const query = `
            SELECT 
                v.voter_id,
                v.email,
                v.party_card_url,
                cr.full_name,
                cr.address,
                cr.birth_date,
                cr.governorate,
                cr.administrative_unit,
                DATE_PART('year', AGE(CURRENT_DATE, cr.birth_date))::INT AS age
            FROM voters v
            JOIN civil_registry cr
              ON TRIM(v.national_id) = TRIM(cr.national_id)
            WHERE v.voter_id = $1
            LIMIT 1
        `;

        const { rows } = await pool.query(query, [voterId]);
        return rows[0];
    }

    ////////////////////////////////////////////////////////////
    // ✅ 7. تحديث حالة التصويت
    ////////////////////////////////////////////////////////////
    static async markAsVoted(voterId) {
        const query = `
            UPDATE voters
            SET has_voted = TRUE
            WHERE voter_id = $1
            RETURNING has_voted
        `;

        const { rows } = await pool.query(query, [voterId]);
        return rows[0];
    }
}

module.exports = Voter;