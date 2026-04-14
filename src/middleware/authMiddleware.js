const jwt = require('jsonwebtoken');

/**
 * ميدل وير للتحقق من التوكن (JWT)
 * يضمن أن المستخدم (ناخب أو مرشح) مسجل دخول ومعاد توحيد بياناته في req.user
 */
const authMiddleware = (req, res, next) => {
    try {
        // 1. الحصول على الـ Token من الهيدر (Authorization: Bearer <TOKEN>)
        const authHeader = req.headers['authorization'];
        
        // تأمين إضافي: التأكد من أن الهيدر موجود ويبدأ بكلمة Bearer فعلياً
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false, 
                message: "دخول غير مصرح به، يرجى تسجيل الدخول أولاً" 
            });
        }

        const token = authHeader.split(' ')[1];

        // 2. التحقق من صلاحية التوكن باستخدام المفتاح السري
        // jwt.verify بيفك التوكن، ولو فيه مشكلة هيدخلنا في الـ catch فوراً
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        /**
         * 3. توحيد بيانات المستخدم (Normalization)
         * بنجمع الـ ID سواء كان اسمه (id) أو (voter_id) أو (candidate_id)
         * عشان الـ Controller يتعامل مع متغير واحد اسمه id
         */
        const userId = decoded.id || decoded.voter_id || decoded.candidate_id;
        const userRole = decoded.role;

        // 4. التأكد من أن البيانات الأساسية موجودة فعلياً داخل التوكن بعد الفك
        if (!userId || !userRole) {
            console.error("Auth Failure: Missing userId or userRole in Token", decoded);
            return res.status(403).json({
                success: false,
                message: "التوكن لا يحتوي على بيانات الهوية المطلوبة"
            });
        }

        // 5. تخزين البيانات الموحدة في كائن req.user لاستخدامها في الـ Controllers
        req.user = {
            id: userId,
            role: userRole,
            national_id: decoded.national_id || null
        };

        // 6. الانتقال للخطوة التالية (الـ Controller)
        next();

    } catch (err) {
        console.error("Auth Middleware Error:", err.message);
        
        // حالة التوكن المنتهي (Expired)
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                message: "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى" 
            });
        }

        // أي خطأ آخر (توكن تالف، مفتاح سري خطأ، إلخ)
        return res.status(403).json({ 
            success: false, 
            message: "جلسة الدخول غير صالحة" 
        });
    }
};

module.exports = authMiddleware;