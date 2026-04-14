const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const jwt = require('jsonwebtoken');
const Voter = require('../models/voterModel');
const { uploadToSupabase } = require('../utils/supabaseHelper');

// --- دالة معالجة الصور (بطاقة الحزب أو بصمة الوجه) ---
const processBase64AndUpload = async (base64String, fileName, folder = 'voters') => {
    try {
        if (!base64String) return null;
        // تنظيف الـ base64 string من الرأس (Header) إذا وجد
        const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        
        // تحسين جودة الصورة وتقليل حجمها (Compression) قبل الرفع
        const optimized = await sharp(buffer).jpeg({ quality: 75 }).toBuffer();
        return await uploadToSupabase(optimized, fileName, folder);
    } catch (error) {
        console.error(`خطأ في معالجة الصورة:`, error);
        throw new Error("فشل رفع الصورة");
    }
};

/**
 * 1. التحقق المبدئي (Auto-fill)
 * تُستخدم لسحب بيانات المواطن من السجل المدني بمجرد إدخال الرقم القومي والتواريخ
 * تطابق الشاشات: Screenshot (474) و Screenshot (476)
 */
exports.verifyBeforeRegister = async (req, res) => {
    try {
        const { national_id, birth_date, expiry_date } = req.body;
        
        // البحث عن المواطن في جدول السجل المدني (civil_registry)
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
                governorate: citizen.governorate_name, // الاسم النصي للمحافظة من الـ Join
                administrative_unit: citizen.administrative_unit, // الاسم النصي للقسم/المركز
                unit_id: citizen.unit_id // المعرف الرقمي لاستخدامه في الـ Register
            }
        });
    } catch (err) { 
        console.error("Verify Error:", err);
        res.status(500).json({ success: false, message: "خطأ في السيرفر أثناء التحقق" }); 
    }
};

/**
 * 2. تسجيل ناخب جديد (Register)
 * تطابق الشاشة: Screenshot (475)
 */
exports.registerVoter = async (req, res) => {
    try {
        const { national_id, birth_date, expiry_date, email, password, party_card_url } = req.body;
        
        // تأكيد الهوية مرة أخيرة قبل الإنشاء لضمان الأمان
        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        if (!citizen) return res.status(401).json({ success: false, message: "الهوية غير مطابقة للسجل المدني" });

        // معالجة ورفع صورة بطاقة الحزب (إن وجدت)
        let finalPartyCardUrl = null;
        if (party_card_url && party_card_url.startsWith('data:image')) {
            finalPartyCardUrl = await processBase64AndUpload(
                party_card_url, 
                `card_${national_id}_${Date.now()}.jpg`
            );
        }

        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // إنشاء السجل في جدول الناخبين (voters)
        await Voter.create({ 
            national_id, 
            email, 
            password: hashedPassword, 
            party_card_url: finalPartyCardUrl,
            unit_id: citizen.unit_id // الربط التلقائي بالدائرة الانتخابية
        });

        res.status(201).json({ success: true, message: "تم التسجيل بنجاح، يمكنك الآن تسجيل الدخول" });
    } catch (err) {
        console.error("Register Error:", err);
        // التعامل مع تكرار المفاتيح (رقم قومي أو بريد مسجل مسبقاً)
        if (err.code === '23505') return res.status(400).json({ success: false, message: "هذا الرقم القومي أو البريد مسجل بالفعل" });
        res.status(500).json({ success: false, message: "خطأ في عملية التسجيل" });
    }
};

/**
 * 3. تسجيل الدخول (Login)
 * يدعم الدخول التقليدي أو ببصمة الوجه
 */
exports.login = async (req, res) => {
    const { email, password, national_id_from_face } = req.body;
    try {
        let user;

        // التحقق من نوع الدخول
        if (national_id_from_face) {
            // دخول ببصمة الوجه (بيبعت الرقم القومي المستخرج من الـ AI)
            user = await Voter.findByIdentifier(national_id_from_face, true);
        } else {
            // دخول تقليدي بالإيميل والباسورد
            user = await Voter.findByIdentifier(email, false);
            if (user && !(await bcrypt.compare(password, user.password))) user = null;
        }

        if (!user) return res.status(401).json({ success: false, message: "بيانات الدخول خاطئة" });

        // توليد التوكن (JWT)
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
 * 4. جلب بيانات بطاقة الناخب (Digital ID)
 * تُستخدم لعرض "كارنيه" الناخب بعد تسجيل الدخول
 */
exports.getVoterCard = async (req, res) => {
    try {
        const userId = req.user.id; // المعرف المستخرج من الميدل وير
        const user = await Voter.findByIdentifier(userId, 'id'); 

        if (!user) {
            return res.status(404).json({ success: false, message: "الناخب غير موجود" });
        }

        res.status(200).json({
            success: true,
            data: {
                full_name: user.full_name,
                v_code: user.v_code, // الكود الانتخابي الفريد
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