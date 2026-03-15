const Candidate = require('../models/candidateModel');
const Voter = require('../models/voterModel'); 
const bcrypt = require('bcrypt');

// 1. تسجيل مرشح جديد (زي ما هو شغال تمام)
exports.registerCandidate = async (req, res) => {
    const { 
        national_id, birth_date, expiry_date, email, password, confirm_password,
        phone_numbers, short_bio, candidate_type, occupation, degree,
        national_id_card_url, education_url, military_service_url,
        financial_disclosure_url, personal_photos_url, birth_certificate_url,
        fitness_health_url, criminal_record_url, deposit_receipt_url, election_symbol_url
    } = req.body;

    if (password !== confirm_password) {
        return res.status(400).json({ success: false, message: "كلمات المرور غير متطابقة" });
    }

    try {
        const citizen = await Voter.verifyInRegistry(national_id, birth_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "بيانات الهوية غير مطابقة للسجل المدني" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const finalPhones = Array.isArray(phone_numbers) ? phone_numbers.slice(0, 3) : [];

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
                age: newCandidate.calculated_age
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

// 2. الـ Smart Login (البريد أو بصمة الوجه في دالة واحدة)
exports.loginCandidate = async (req, res) => {
    const { email, password, national_id } = req.body;

    try {
        let candidate;

        // الحالة أ: دخول ببصمة الوجه (National ID مبعوث)
        if (national_id) {
            candidate = await Candidate.findByNationalId(national_id);
            if (!candidate) {
                return res.status(404).json({ success: false, message: "لم يتم التعرف على الوجه، الرقم القومي غير مسجل" });
            }
            return res.status(200).json({ 
                success: true, 
                message: "تم التعرف على الوجه بنجاح (Smart Login)", 
                data: candidate 
            });
        }

        // الحالة ب: دخول بالبريد والباسورد (Email مبعوث)
        if (email && password) {
            candidate = await Candidate.findByEmail(email);
            if (!candidate) {
                return res.status(404).json({ success: false, message: "البريد الإلكتروني غير موجود" });
            }

            const isMatch = await bcrypt.compare(password, candidate.password);
            if (!isMatch) {
                return res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة" });
            }

            return res.status(200).json({ 
                success: true, 
                message: "تم تسجيل الدخول بالبريد بنجاح (Smart Login)", 
                data: candidate 
            });
        }

        // لو مبعتش حاجة خالص
        return res.status(400).json({ success: false, message: "يرجى إرسال بيانات الدخول (بريد وباسورد أو رقم قومي)" });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر" });
    }
};