const pool = require('../config/db');

class Voter {

    // 1) التحقق من السجل المدني (national_id + birth_date + expiry_date)
    static async verifyInRegistry(nationalId, birthDate, expiryDate) {
        const query = `
            SELECT 
                TRIM(national_id)                         AS national_id,
                full_name,
                NULLIF(TRIM(username), '')                AS username,
                address,
                governorate,
                administrative_unit,
                NULLIF(TRIM(electoral_district), '')      AS electoral_district
            FROM civil_registry
            WHERE TRIM(national_id) = TRIM($1)
              AND birth_date = $2::date
              AND expiry_date = $3::date
            LIMIT 1
        `;
        const { rows } = await pool.query(query, [nationalId, birthDate, expiryDate]);
        return rows[0];
    }

    // 2) التحقق من التكرار (email أو national_id) داخل voters
    static async checkDuplicate(email, nationalId) {
        const query = `
            SELECT 
                CASE WHEN email = $1 THEN 'email' END as email_exists,
                CASE WHEN TRIM(national_id) = TRIM($2) THEN 'national_id' END as id_exists
            FROM voters
            WHERE email = $1 OR TRIM(national_id) = TRIM($2)
            LIMIT 1
        `;
        const { rows } = await pool.query(query, [email, nationalId]);
        return rows[0];
    }

    // 3) إنشاء ناخب جديد
    static async create(voterData) {
        const { national_id, email, password, party_card_url } = voterData;

        const query = `
            INSERT INTO voters (national_id, email, password, party_card_url)
            VALUES ($1, $2, $3, $4)
            RETURNING voter_id, national_id, email, has_voted, created_at, party_card_url
        `;
        const values = [national_id, email, password, party_card_url || null];
        const { rows } = await pool.query(query, values);
        return rows[0];
    }

    // 4) البحث بالرقم القومي + جلب بيانات السجل المدني (مهم للـ Login بالوجه)
    static async findByNationalId(nationalId) {
        const query = `
            SELECT 
                v.voter_id,
                TRIM(v.national_id)                        AS national_id,
                v.email,
                v.password,
                v.has_voted,
                v.created_at,
                v.party_card_url,

                cr.full_name,
                NULLIF(TRIM(cr.username), '')              AS username,
                cr.address,
                cr.governorate,
                cr.administrative_unit,
                NULLIF(TRIM(cr.electoral_district), '')    AS electoral_district
            FROM voters v
            JOIN civil_registry cr 
              ON TRIM(v.national_id) = TRIM(cr.national_id)
            WHERE TRIM(v.national_id) = TRIM($1)
            LIMIT 1
        `;
        const { rows } = await pool.query(query, [nationalId]);
        return rows[0];
    }

    // 5) البحث بالبريد الإلكتروني + جلب بيانات السجل المدني (مهم للـ Login بالباسورد)
    static async findByEmail(email) {
        const query = `
            SELECT 
                v.voter_id,
                TRIM(v.national_id)                        AS national_id,
                v.email,
                v.password,
                v.has_voted,
                v.created_at,
                v.party_card_url,

                cr.full_name,
                NULLIF(TRIM(cr.username), '')              AS username,
                cr.address,
                cr.governorate,
                cr.administrative_unit,
                NULLIF(TRIM(cr.electoral_district), '')    AS electoral_district
            FROM voters v
            JOIN civil_registry cr 
              ON TRIM(v.national_id) = TRIM(cr.national_id)
            WHERE v.email = $1
            LIMIT 1
        `;
        const { rows } = await pool.query(query, [email]);
        return rows[0];
    }

    // 6) البحث بالـ voter_id (للـ profile / voter-card)
    static async findByIdentifier(voterId) {
        const query = `
            SELECT 
                v.voter_id,
                TRIM(v.national_id)                        AS national_id,
                v.email,
                v.has_voted,
                v.created_at,
                v.party_card_url,

                cr.full_name,
                NULLIF(TRIM(cr.username), '')              AS username,
                cr.address,
                cr.governorate,
                cr.administrative_unit,
                NULLIF(TRIM(cr.electoral_district), '')    AS electoral_district
            FROM voters v
            JOIN civil_registry cr 
              ON TRIM(v.national_id) = TRIM(cr.national_id)
            WHERE v.voter_id = $1
            LIMIT 1
        `;
        const { rows } = await pool.query(query, [voterId]);
        return rows[0];
    }

    // 7) تحديث حالة التصويت
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