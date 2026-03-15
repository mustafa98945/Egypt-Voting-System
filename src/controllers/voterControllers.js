const Voter = require('../models/voterModel');
const bcrypt = require('bcrypt');

// التحقق قبل التسجيل
exports.verifyBeforeRegister = async (req, res) => {
    const { national_id, birth_date, expiry_date } = req.body;
    try {
        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        
        if (!citizen) {
            return res.status(401).json({ success: false, message: "حدث خطأ في البيانات المدخلة، يرجى المراجعة" });
        }
        res.json({ success: true, data: citizen });
    } catch (err) {
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر" });
    }
};

// تسجيل الحساب للناخب
exports.registerVoter = async (req, res) => {
    const { national_id, birth_date, expiry_date, email, password, confirm_password, party_card_url } = req.body;
    
    if (password !== confirm_password) return res.status(400).json({ success: false, message: "الباسورد غير متطابق" });

    try {
        // التحقق من السجل المدني عن طريق الموديل
        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        if (!citizen) return res.status(401).json({ success: false, message: "بيانات غير صحيحة" });

        const hashedPassword = await bcrypt.hash(password, 10);
        
        await Voter.create({ national_id, email, password: hashedPassword, party_card_url: party_card_url || null });
        
        res.status(201).json({ success: true, message: "تم إنشاء حسابك بنجاح" });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ success: false, message: "هذا الحساب مسجل بالفعل" });
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر" });
    }
};

// تسجيل الدخول
exports.login = async (req, res) => {
    const { email, password, national_id_from_face } = req.body;
    try {
        let user;

        if (national_id_from_face) {
            // البحث بالرقم القومي (بصمة وجه)
            user = await Voter.findByIdentifier(national_id_from_face, true);
        } else {
            // البحث بالإيميل
            user = await Voter.findByIdentifier(email, false);
            if (user) {
                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) user = null;
            }
        }

        if (!user) return res.status(401).json({ success: false, message: "بيانات الدخول غير صحيحة" });

        res.json({ 
            success: true, 
            user_data: { 
                voter_id: user.voter_id, 
                full_name: user.full_name, 
                governorate: user.governorate_name, 
                unit: user.unit_name, 
                has_voted: user.has_voted 
            } 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر" });
    }
};