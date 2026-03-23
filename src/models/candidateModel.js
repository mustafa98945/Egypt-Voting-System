const pool = require('../config/db');

class Candidate {
    // 1. إنشاء مرشح جديد
    static async create(data) {
        const query = `
            INSERT INTO candidates (
                national_id, email, password, phone_numbers, short_bio, 
                candidate_type, occupation, degree, birth_date, expiry_date,
                personal_photos_url, national_id_card_url, education_url, 
                military_service_url, financial_disclosure_url, birth_certificate_url, 
                fitness_health_url, criminal_record_url, deposit_receipt_url, 
                election_symbol_url, party_card_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
            RETURNING *;
        `;

        const values = [
            data.national_id, data.email, data.password, 
            Array.isArray(data.phone_numbers) ? data.phone_numbers : [data.phone_numbers],
            data.short_bio, data.candidate_type, data.occupation, data.degree,
            data.birth_date, data.expiry_date, data.personal_photos_url,
            data.national_id_card_url, data.education_url, data.military_service_url,
            data.financial_disclosure_url, data.birth_certificate_url, data.fitness_health_url,
            data.criminal_record_url, data.deposit_receipt_url, data.election_symbol_url,
            data.party_card_url
        ];

        const { rows } = await pool.query(query, values);
        return rows[0];
    }

    // 2. البحث بالرقم القومي (Face ID / Login)
    static async findByNationalId(nationalId) {
        const query = `
            SELECT c.*, cr.full_name, cr.governorate_name, cr.unit_name 
            FROM candidates c
            JOIN civil_registry cr ON c.national_id = cr.national_id
            WHERE c.national_id = $1
        `;
        const { rows } = await pool.query(query, [nationalId]);
        return rows[0];
    }

    // 3. البحث بالبريد الإلكتروني
    static async findByEmail(email) {
        const query = `
            SELECT c.*, cr.full_name, cr.governorate_name, cr.unit_name 
            FROM candidates c
            JOIN civil_registry cr ON c.national_id = cr.national_id
            WHERE c.email = $1
        `;
        const { rows } = await pool.query(query, [email]);
        return rows[0];
    }

    // 4. جلب البروفايل الكامل (مع معالجة احتمال الـ ID غير الرقمي)
    static async getFullProfile(candidateId) {
    try {
        const cleanId = parseInt(candidateId);
        if (isNaN(cleanId)) return null;

        const query = `
            SELECT 
                c.candidate_id, 
                c.short_bio, 
                c.degree, 
                c.candidate_type,
                c.election_symbol_url,
                c.personal_photos_url,
                cr.full_name, 
                cr.governorate_name, 
                cr.unit_name,
                -- حساب السن مع معالجة القيم الفارغة
                CASE 
                    WHEN cr.birth_date IS NOT NULL THEN EXTRACT(YEAR FROM AGE(cr.birth_date))::INT 
                    ELSE 0 
                END as age
            FROM candidates c
            LEFT JOIN civil_registry cr ON TRIM(c.national_id) = TRIM(cr.national_id)
            WHERE c.candidate_id = $1
        `;
        
        const { rows } = await pool.query(query, [cleanId]);
        
        if (rows.length === 0) return null;
        return rows[0];
    } catch (err) {
        console.error("DATABASE_ERROR_LOG:", err.message);
        throw err;
    }
}
}

module.exports = Candidate;