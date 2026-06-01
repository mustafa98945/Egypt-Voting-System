const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];

        // ✅ التحقق من وجود التوكن
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: "يرجى تسجيل الدخول أولاً"
            });
        }

        const token = authHeader.split(' ')[1];

        // ✅ فك التوكن
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded.id || !decoded.role) {
            return res.status(403).json({
                success: false,
                message: "بيانات التوكن غير صالحة"
            });
        }

        // ✅ تمرير البيانات كاملة للـ Controllers
        req.user = {
            id: decoded.id,
            role: decoded.role,
            national_id: decoded.national_id || null,
            administrative_unit: decoded.administrative_unit || null,
            governorate: decoded.governorate || null   // ✅ تمت الإضافة هنا
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
            success: false,
            message: "جلسة الدخول غير صالحة"
        });
    }
};

module.exports = authMiddleware;