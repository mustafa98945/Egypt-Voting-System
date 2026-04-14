const pool = require('../config/db');

class Voter {
    // 1. الـ Triple Check - التحقق من وجود المواطن في السجل المدني (Auto-fill)
   static async verifyInRegistry(nationalId, birthDate, expiryDate) {
    // query بسيطة جداً بتجيب البيانات من جدول السجل المدني بس
    const query = `
        SELECT 
            full_name, 
            address, 
            national_id,
            administrative_unit -- هنسحب الاسم النصي مباشرة
        FROM civil_registry
        WHERE TRIM(national_id) = TRIM($1) 
          AND birth_date = $2 
          AND expiry_date = $3
    `;
    const { rows } = await pool.query(query, [nationalId, birthDate, expiryDate]);
    return rows[0];
}

    // 2. إنشاء ناخب جديد (نفس تكنيك الـ Candidate)
   static async create(voterData) {
    // إحنا هنا بناخد بس الخانات اللي موجودة فعلياً في جدول voters بتاعك (حسب صورة 27)
    const { national_id, email, password, face_token, party_card_url } = voterData;
    
    const query = `
        INSERT INTO voters (national_id, email, password, face_signature, party_card_url)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
    `;
    
    // لاحظ إننا بعتنا face_token في خانة face_signature اللي موجودة في جدولك
    const values = [national_id, email, password, face_token, party_card_url];
    const { rows } = await pool.query(query, values);
    return rows[0];
}
    // 3. البحث بالرقم القومي (لعملية الـ Login أو بصمة الوجه)
    static async findByNationalId(nationalId) {
        const query = `
            SELECT v.*, cr.full_name 
            FROM voters v
            JOIN civil_registry cr ON v.national_id = cr.national_id
            WHERE TRIM(v.national_id) = TRIM($1)
        `;
        const { rows } = await pool.query(query, [nationalId]);
        return rows[0];
    }

    // 4. البحث بالبريد الإلكتروني (لعملية الـ Login التقليدي)
    static async findByEmail(email) {
        const query = `
            SELECT v.*, cr.full_name 
            FROM voters v
            JOIN civil_registry cr ON v.national_id = cr.national_id
            WHERE v.email = $1
        `;
        const { rows } = await pool.query(query, [email]);
        return rows[0];
    }

    // 5. جلب بيانات الكارت الرقمي (Digital ID)
    static async getFullProfile(voterId) {
        const query = `
            SELECT 
                v.*, 
                cr.full_name, 
                g.governorate_name, 
                au.administrative_unit,
                v.v_code 
            FROM voters v 
            JOIN civil_registry cr ON v.national_id = cr.national_id 
            LEFT JOIN governorates g ON cr.governorate = g.governorate_name
            LEFT JOIN administrative_units au ON v.unit_id = au.id
            WHERE v.voter_id = $1
        `;
        const { rows } = await pool.query(query, [voterId]);
        return rows[0];
    }

    // 6. تحديث حالة التصويت (منع التكرار)
    static async markAsVoted(voterId) {
        const query = `UPDATE voters SET has_voted = TRUE WHERE voter_id = $1 RETURNING has_voted`;
        const { rows } = await pool.query(query, [voterId]);
        return rows[0];
    }
}

module.exports = Voter;