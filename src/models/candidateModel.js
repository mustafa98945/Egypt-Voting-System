const pool = require('../config/db');

class Candidate {
    // 1. تسجيل مرشح جديد (كودك شغال تمام)
    static async create(data) {
        const birthDate = new Date(data.birth_date);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }

        const queryText = `
            INSERT INTO candidates (
                national_id, email, password, phone_numbers, short_bio, 
                candidate_type, occupation, degree, birth_date, expiry_date,
                national_id_card_url, education_url, military_service_url, 
                financial_disclosure_url, personal_photos_url, birth_certificate_url, 
                fitness_health_url, criminal_record_url, deposit_receipt_url, 
                election_symbol_url
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
            ) RETURNING *`;

        const values = [
            data.national_id, data.email, data.password, data.phone_numbers, data.short_bio,
            data.candidate_type, data.occupation, data.degree, data.birth_date, data.expiry_date,
            data.national_id_card_url, data.education_url, data.military_service_url,
            data.financial_disclosure_url, data.personal_photos_url, data.birth_certificate_url,
            data.fitness_health_url, data.criminal_record_url, data.deposit_receipt_url, 
            data.election_symbol_url 
        ];

        const result = await pool.query(queryText, values);
        
        return {
            ...result.rows[0],
            calculated_age: age
        };
    }

    // 2. البحث بالإيميل مع JOIN لجلب الاسم والبيانات الشخصية
    static async findByEmail(email) {
        const result = await pool.query(
            `SELECT c.*, cr.full_name, cr.governorate_name, cr.unit_name 
             FROM candidates c
             JOIN civil_registry cr ON c.national_id = cr.national_id
             WHERE c.email = $1`, [email]
        );
        return result.rows[0];
    }

    // 3. البحث بالرقم القومي مع JOIN لجلب الاسم والبيانات الشخصية
    static async findByNationalId(national_id) {
        const result = await pool.query(
            `SELECT c.*, cr.full_name, cr.governorate_name, cr.unit_name 
             FROM candidates c
             JOIN civil_registry cr ON c.national_id = cr.national_id
             WHERE c.national_id = $1`, [national_id]
        );
        return result.rows[0];
    }
}

module.exports = Candidate;