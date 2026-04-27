const pool = require('../config/db');

class Candidate {

    ////////////////////////////////////////////////////////////
    // ✅ 1. التحقق من السجل المدني
    ////////////////////////////////////////////////////////////
    static async verifyRegistry(nationalId, birthDate, expiryDate) {
        const query = `
            SELECT *
            FROM civil_registry 
            WHERE TRIM(national_id) = TRIM($1)
              AND birth_date = $2
              AND expiry_date = $3
            LIMIT 1
        `;
        const { rows } = await pool.query(query, [nationalId, birthDate, expiryDate]);
        return rows[0];
    }

    ////////////////////////////////////////////////////////////
    // ✅ 2. إنشاء مرشح
    ////////////////////////////////////////////////////////////
    static async create(data) {
        const query = `
            INSERT INTO candidates (
                national_id,
                birth_date,
                expiry_date,
                email,
                password,
                phone_number,
                occupation,
                candidate_type,
                short_bio,
                election_symbol_url,
                personal_photos_url,
                financial_disclosure_url,
                fitness_health_url,
                deposit_receipt_url
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,
                $10,$11,$12,$13,$14
            )
            RETURNING *
        `;

        const values = [
            data.national_id,
            data.birth_date,
            data.expiry_date,
            data.email,
            data.password,
            data.phone_number,
            data.occupation,
            data.candidate_type,
            data.short_bio,
            data.election_symbol_url,
            data.personal_photos_url,
            data.financial_disclosure_url,
            data.fitness_health_url,
            data.deposit_receipt_url
        ];

        const { rows } = await pool.query(query, values);
        return rows[0];
    }

    ////////////////////////////////////////////////////////////
    // ✅ 3. البحث بالرقم القومي
    ////////////////////////////////////////////////////////////
    static async findByNationalId(nationalId) {
        const query = `
            SELECT 
                c.*,
                cr.full_name,
                cr.governorate,
                cr.administrative_unit
            FROM candidates c
            JOIN civil_registry cr
              ON TRIM(c.national_id) = TRIM(cr.national_id)
            WHERE TRIM(c.national_id) = TRIM($1)
            LIMIT 1
        `;

        const { rows } = await pool.query(query, [nationalId]);
        return rows[0];
    }

    ////////////////////////////////////////////////////////////
    // ✅ 4. البحث بالبريد الإلكتروني
    ////////////////////////////////////////////////////////////
    static async findByEmail(email) {
        const query = `
            SELECT 
                c.*,
                cr.full_name,
                cr.governorate,
                cr.administrative_unit
            FROM candidates c
            JOIN civil_registry cr
              ON TRIM(c.national_id) = TRIM(cr.national_id)
            WHERE c.email = $1
            LIMIT 1
        `;

        const { rows } = await pool.query(query, [email]);
        return rows[0];
    }

    ////////////////////////////////////////////////////////////
    // ✅ 5. البروفايل الكامل (مع حساب العمر من birth_date)
    ////////////////////////////////////////////////////////////
    static async getFullProfile(candidateId) {
        const query = `
            SELECT 
                c.candidate_id,
                cr.full_name,
                cr.degree,
                cr.governorate AS government,
                DATE_PART('year', AGE(CURRENT_DATE, cr.birth_date))::INT AS age, -- ✅ حساب العمر هنا
                c.short_bio,
                c.personal_photos_url,
                c.election_symbol_url
            FROM candidates c
            JOIN civil_registry cr
              ON TRIM(c.national_id) = TRIM(cr.national_id)
            WHERE c.candidate_id = $1
            LIMIT 1
        `;

        const { rows } = await pool.query(query, [candidateId]);
        return rows[0];
    }

    ////////////////////////////////////////////////////////////
    // ✅ 6. إجمالي الأصوات
    ////////////////////////////////////////////////////////////
    static async getCandidateVotes(candidateId) {
        const query = `
            SELECT COUNT(*)::INT AS total_votes
            FROM votes
            WHERE candidate_id = $1
        `;

        const { rows } = await pool.query(query, [candidateId]);
        return rows[0]?.total_votes || 0;
    }
}

module.exports = Candidate;