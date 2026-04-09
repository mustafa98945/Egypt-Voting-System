const pool = require('../config/db');

class Candidate {
    // 1. الـ Triple Check (الرقم القومي، الميلاد، الانتهاء) - بيرجع بيانات المواطن كاملة
    static async verifyRegistry(nationalId, birthDate, expiryDate) {
        const query = `
            SELECT * FROM civil_registry 
            WHERE TRIM(national_id) = TRIM($1) 
            AND birth_date = $2 
            AND expiry_date = $3
        `;
        const { rows } = await pool.query(query, [nationalId, birthDate, expiryDate]);
        return rows[0]; 
    }

    // 2. إنشاء مرشح (بيشمل الحقول الـ 16 + البيانات المسحوبة من السجل)
    static async create(data) {
        const query = `
            INSERT INTO candidates (
                username, governorate, address, administrative_unit, degree, age, gender,
                military_service_url, education_url, birth_certificate_url, criminal_record_url,
                email, password, national_id, birth_date, expiry_date, 
                phone_number, occupation, candidate_type, short_bio,
                national_id_front_url, national_id_back_url, election_symbol_url, 
                financial_disclosure_url, personal_photos_url, fitness_health_url, 
                deposit_receipt_url
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                $21, $22, $23, $24, $25, $26, $27
            ) RETURNING *;
        `;

        const values = [
            // البيانات المسحوبة من السجل المدني (citizen)
            data.username, data.governorate, data.address, data.administrative_unit, 
            data.degree, data.age, data.gender, data.military_service_url, 
            data.education_url, data.birth_certificate_url, data.criminal_record_url,
            
            // البيانات المدخلة من المرشح
            data.email, data.password, data.national_id, data.birth_date, data.expiry_date,
            data.phone_number, data.occupation, data.candidate_type, data.short_bio,
            
            // الملفات المرفوعة حديثاً
            data.national_id_front_url, data.national_id_back_url, data.election_symbol_url,
            data.financial_disclosure_url, data.personal_photos_url, data.fitness_health_url,
            data.deposit_receipt_url
        ];

        const { rows } = await pool.query(query, values);
        return rows[0];
    }

    // 3. البحث بالرقم القومي (للدخول)
    static async findByNationalId(nationalId) {
        const query = `SELECT * FROM candidates WHERE TRIM(national_id) = TRIM($1)`;
        const { rows } = await pool.query(query, [nationalId]);
        return rows[0];
    }

    // 4. البحث بالبريد (للدخول)
    static async findByEmail(email) {
        const query = `SELECT * FROM candidates WHERE email = $1`;
        const { rows } = await pool.query(query, [email]);
        return rows[0];
    }

    // 5. جلب البروفايل الكامل (مع دمج اسم الشخص من السجل المدني للعرض)
    static async getFullProfile(candidateId) {
        const query = `
            SELECT 
                c.*, 
                cr.full_name 
            FROM candidates c
            LEFT JOIN civil_registry cr ON TRIM(c.national_id) = TRIM(cr.national_id)
            WHERE c.candidate_id = $1
        `;
        const { rows } = await pool.query(query, [candidateId]);
        return rows[0];
    }

    // 6. عداد الأصوات
    static async getCandidateVotes(candidateId) {
        const query = `SELECT COUNT(*)::INT as total_votes FROM votes WHERE candidate_id = $1`;
        const { rows } = await pool.query(query, [candidateId]);
        return rows[0]?.total_votes || 0;
    }
}

module.exports = Candidate;