const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: "دخول غير مصرح به، يرجى تسجيل الدخول أولاً"
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const userId = decoded.id || decoded.voter_id || decoded.candidate_id;
        const userRole = decoded.role;

        if (!userId || !userRole) {
            return res.status(403).json({
                success: false,
                message: "التوكن لا يحتوي على بيانات الهوية المطلوبة"
            });
        }

        req.user = {
            id: userId,
            role: userRole,
            national_id: decoded.national_id || null,
            administrative_unit: decoded.administrative_unit || null, // ← جديد للفلترة
            electoral_district: decoded.electoral_district || null    // ← محتفظ بيه للـ Flutter
        };

        next();
    } catch (err) {
        console.error("Auth Middleware Error:", err.message);
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى"
            });
        }
        return res.status(403).json({
            success: false, message: "جلسة الدخول غير صالحة"
        });
    }
};

module.exports = authMiddleware;