const bcrypt = require('bcryptjs'); 
const sharp = require('sharp');
const jwt = require('jsonwebtoken');
const Voter = require('../models/voterModel');
const { uploadToSupabase } = require('../utils/supabaseHelper');

// --- دالة معالجة الصور (بصمة الوجه أو بطاقة الحزب) ---
const processBase64AndUpload = async (base64String, fileName, folder = 'voters') => {
    try {
        if (!base64String) return null;
        const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const optimized = await sharp(buffer).jpeg({ quality: 75 }).toBuffer();
        return await uploadToSupabase(optimized, fileName, folder);
    } catch (error) {
        console.error(`خطأ في معالجة الصورة:`, error);
        throw new Error("فشل رفع الصورة");
    }
};

/**
 * 1. التحقق المبدئي (Auto-fill)
 * تُستخدم لسحب بيانات المواطن من السجل المدني قبل التسجيل الرسمي
 */
exports.verifyBeforeRegister = async (req, res) => {
    try {
        const { national_id, birth_date, expiry_date } = req.body;
        
        // الموديل هنا بيرجع البيانات بناءً على الـ SQL اللي ظبطناه
        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        
        if (!citizen) {
            return res.status(401).json({ 
                success: false, 
                message: "البيانات غير مطابقة للسجل المدني أو البطاقة منتهية" 
            });
        }

        // إرسال البيانات للـ Frontend لملء الحقول تلقائياً
        res.json({ 
            success: true, 
            data: {
                full_name: citizen.full_name,
                address: citizen.address,
                governorate: citizen.governorate, // متطابق مع SQL
                administrative_unit: citizen.administrative_unit, // متطابق مع SQL
                unit_id: citizen.unit_id // مهم جداً للربط لاحقاً
            }
        });
    } catch (err) { 
        console.error("Verify Error:", err);
        res.status(500).json({ success: false, message: "خطأ في السيرفر أثناء التحقق" }); 
    }
};

/**
 * 2. تسجيل ناخب جديد (Register)
 */
exports.registerVoter = async (req, res) => {
    try {
        const { national_id, birth_date, expiry_date, email, password, party_card_url, unit_id } = req.body;
        
        // تأكيد الهوية للمرة الأخيرة
        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        if (!citizen) return res.status(401).json({ success: false, message: "الهوية غير مطابقة للسجل المدني" });

        // رفع بطاقة الحزب إن وجدت
        let finalPartyCardUrl = null;
        if (party_card_url && party_card_url.startsWith('data:image')) {
            finalPartyCardUrl = await processBase64AndUpload(party_card_url, `card_${national_id}_${Date.now()}.jpg`);
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // إنشاء الناخب في جدول الـ voters
        await Voter.create({ 
            national_id, 
            email, 
            password: hashedPassword, 
            party_card_url: finalPartyCardUrl,
            unit_id: unit_id || citizen.unit_id // استخدام الـ unit_id القادم من السجل المدني
        });

        res.status(201).json({ success: true, message: "تم التسجيل بنجاح، يمكنك الآن تسجيل الدخول" });
    } catch (err) {
        console.error("Register Error:", err);
        if (err.code === '23505') return res.status(400).json({ success: false, message: "هذا الرقم القومي أو البريد مسجل بالفعل" });
        res.status(500).json({ success: false, message: "خطأ في عملية التسجيل" });
    }
};

/**
 * 3. تسجيل الدخول (Login)
 */
exports.login = async (req, res) => {
    const { email, password, national_id_from_face } = req.body;
    try {
        let user;

        // الدخول ببصمة الوجه
        if (national_id_from_face) {
            user = await Voter.findByIdentifier(national_id_from_face, true);
        } 
        // الدخول التقليدي
        else {
            user = await Voter.findByIdentifier(email, false);
            if (user && !(await bcrypt.compare(password, user.password))) user = null;
        }

        if (!user) return res.status(401).json({ success: false, message: "بيانات الدخول خاطئة" });

        // إنشاء التوكن (JWT)
        const token = jwt.sign(
            { 
                id: user.voter_id, 
                role: 'voter', 
                national_id: user.national_id 
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({ 
            success: true, 
            token, 
            user_data: { 
                id: user.voter_id, 
                full_name: user.full_name, 
                national_id: user.national_id, 
                governorate: user.governorate_name, 
                unit: user.administrative_unit, 
                has_voted: user.has_voted 
            } 
        });
    } catch (err) { 
        console.error("Login Error:", err);
        res.status(500).json({ success: false, message: "حدث خطأ أثناء تسجيل الدخول" }); 
    }
};

/**
 * 4. جلب بيانات بطاقة الناخب
 */
exports.getVoterCard = async (req, res) => {
    try {
        const userId = req.user.id; 
        const user = await Voter.findByIdentifier(userId, true); // البحث باستخدام الـ ID الداخلي

        if (!user) {
            return res.status(404).json({ success: false, message: "الناخب غير موجود" });
        }

        res.status(200).json({
            success: true,
            data: {
                full_name: user.full_name,
                v_code: user.v_code, // تأكد إن العمود ده موجود في جدول الـ voters
                national_id: user.national_id,
                governorate: user.governorate_name,
                unit: user.administrative_unit
            }
        });
    } catch (err) {
        console.error("Error in getVoterCard:", err);
        res.status(500).json({ success: false, message: "خطأ في جلب بيانات البطاقة" });
    }
};