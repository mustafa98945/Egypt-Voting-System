const pool = require('../config/db');

class Candidate {
    // 1. دالة إنشاء مرشح جديد (كما هي مع إضافة RETURNING)
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
            data.national_id, data.email, data.password, data.phone_numbers,
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

    // 2. دالة البحث بالرقم القومي مع جلب بيانات السجل المدني (مهمة للـ Login والـ Face ID)
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

    // 3. دالة البحث بالإيميل (للدخول التقليدي)
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

    // 4. دالة جلب البروفايل الكامل (لأجل صفحة التفاصيل في Figma)
    static async getFullProfile(candidateId) {
        const query = `
            SELECT 
                c.candidate_id, 
                cr.full_name, 
                c.short_bio, 
                c.degree, 
                cr.governorate_name, 
                cr.unit_name,
                c.candidate_type,
                c.election_symbol_url,
                c.personal_photos_url,
                EXTRACT(YEAR FROM AGE(cr.birth_date)) as age
            FROM candidates c
            JOIN civil_registry cr ON c.national_id = cr.national_id
            WHERE c.candidate_id = $1
        `;
        const { rows } = await pool.query(query, [candidateId]);
        return rows[0];
    }
}

module.exports = Candidate;