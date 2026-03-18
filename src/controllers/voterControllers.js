const bcrypt = require('bcryptjs'); // تم توحيد المكتبة لـ bcryptjs
const sharp = require('sharp');
const jwt = require('jsonwebtoken');
const Voter = require('../models/voterModel');
const { uploadToSupabase } = require('../utils/supabaseHelper');

// --- دالة مساعدة لتحويل Base64 إلى Buffer ورفعه (Fast Processing) ---
const processBase64AndUpload = async (base64String, fileName, folder = 'voters') => {
    try {
        if (!base64String) return null;

        // إزالة الجزء التعريفي من الـ Base64 لو وجد
        const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');

        // معالجة الصورة باستخدام Sharp لضمان الجودة والحجم
        const optimized = await sharp(buffer)
            .jpeg({ quality: 75 })
            .toBuffer();
            
        return await uploadToSupabase(optimized, fileName, folder);
    } catch (error) {
        console.error(`خطأ في معالجة Base64 للملف ${fileName}:`, error);
        throw new Error("فشل في معالجة ورفع الصورة");
    }
};

// 1. التحقق المبدئي
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

// 2. تسجيل حساب الناخب (JSON Mode)
exports.registerVoter = async (req, res) => {
    try {
        const { 
            national_id, birth_date, expiry_date, email, 
            password, confirm_password,
            party_card_url // استلامه كـ Base64 String
        } = req.body;
        
        // التحقق من الهوية في السجل المدني
        const citizen = await Voter.verifyInRegistry(national_id, birth_date, expiry_date);
        if (!citizen) {
            return res.status(401).json({ success: false, message: "بيانات الهوية غير مطابقة للسجل المدني" });
        }

        // --- معالجة الكارنيه الحزبي لو موجود (Base64 to Supabase) ---
        let finalPartyCardUrl = null;
        if (party_card_url) {
            finalPartyCardUrl = await processBase64AndUpload(
                party_card_url, 
                `voter_card_${national_id}_${Date.now()}.jpg`
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        await Voter.create({ 
            national_id, 
            email, 
            password: hashedPassword, 
            party_card_url: finalPartyCardUrl 
        });
        
        res.status(201).json({ 
            success: true, 
            message: "تم إنشاء حسابك بنجاح باستخدام المعالجة السريعة" 
        });

    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ success: false, message: "هذا الحساب مسجل بالفعل" });
        }
        console.error("Voter Registration Error:", err.message);
        res.status(500).json({ success: false, message: "حدث خطأ في السيرفر أثناء التسجيل" });
    }
};

// 3. تسجيل الدخول (JWT)
exports.login = async (req, res) => {
    const { email, password, national_id_from_face } = req.body;
    
    try {
        let user;

        // 1. تحديد طريقة الدخول (وجه أو إيميل)
        if (national_id_from_face) {
            user = await Voter.findByIdentifier(national_id_from_face, true);
        } else if (email && password) {
            user = await Voter.findByIdentifier(email, false);
            if (user) {
                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) {
                    return res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة" });
                }
            }
        } else {
            return res.status(400).json({ success: false, message: "يرجى تقديم بيانات الدخول المطلوبة" });
        }

        // 2. التحقق من وجود المستخدم
        if (!user) {
            return res.status(404).json({ success: false, message: "بيانات الدخول غير صحيحة أو المستخدم غير مسجل" });
        }

        // 3. توليد التوكن (JWT) بالبيانات الموحدة
        const token = jwt.sign(
            { 
                id: user.voter_id, 
                role: 'voter', 
                national_id: user.national_id 
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // 4. إرسال الاستجابة متوافقة مع الـ Flutter App
        res.status(200).json({ 
            success: true, 
            token: token, 
            user_data: { 
                id: user.voter_id, 
                full_name: user.full_name, 
                national_id: user.national_id, 
                governorate: user.governorate_name || "غير محدد", 
                unit: user.unit_name || "غير محدد", 
                has_voted: user.has_voted || false 
            } 
        });

    } catch (err) {
        console.error("Voter Login Error Details:", err.message);
        res.status(500).json({ 
            success: false, 
            message: "حدث خطأ فني في السيرفر أثناء تسجيل الدخول" 
        });
    }
};