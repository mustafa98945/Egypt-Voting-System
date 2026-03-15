const Candidate = require('../models/candidateModel');
const Voter = require('../models/voterModel'); // هنحتاجه للتحقق من السجل المدني
const bcrypt = require('bcrypt');

exports.registerCandidate = async (req, res) => {
    const { 
        national_id, birth_date, expiry_date, email, password, confirm_password,
        phone_numbers, short_bio, candidate_type, occupation, degree,
        // الروابط الـ 10 من الـ Figma
        national_id_card_url, education_url, military_service_url,
        financial_disclosure_url, personal_photos_url, birth_certificate_url,
        fitness_health_url, criminal_record_url, deposit_receipt_url, election_symbol_url
    } = req.body;

    // 1. تأكيد الباسورد
    if (password !== confirm_password) {
        return res.status(400).json({ success: false, message: "كلمات المرور غير متطابقة" });
    }

    try {
        // 2. التحقق من السجل المدني (باستخدام دالة الـ Verify اللي في Voter Model)
        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "بيانات الهوية غير مطابقة للسجل المدني" });
        }

        // 3. تشفير الباسورد
        const hashedPassword = await bcrypt.hash(password, 10);

        // 4. تجهيز مصفوفة التليفونات (أقصى حاجة 3)
        const finalPhones = Array.isArray(phone_numbers) ? phone_numbers.slice(0, 3) : [];

        // 5. إرسال البيانات للموديل (اللي هيحسب السن ويخزن)
        const newCandidate = await Candidate.create({
            national_id, email, password: hashedPassword, phone_numbers: finalPhones,
            short_bio, candidate_type, occupation, degree, birth_date, expiry_date,
            national_id_card_url, education_url, military_service_url,
            financial_disclosure_url, personal_photos_url, birth_certificate_url,
            fitness_health_url, criminal_record_url, deposit_receipt_url, election_symbol_url
        });

        res.status(201).json({ 
            success: true, 
            message: "تم تقديم طلب الترشح بنجاح، ورمزك الانتخابي قيد المراجعة",
            data: {
                candidate_id: newCandidate.candidate_id,
                age: newCandidate.calculated_age // السن اللي الموديل حسبه
            }
        });

    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: "هذا الرقم القومي أو الإيميل مسجل كمرشح بالفعل" });
        }
        console.error(err.message);
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر" });
    }
};