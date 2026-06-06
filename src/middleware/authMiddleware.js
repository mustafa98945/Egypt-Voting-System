const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];

        // ✅ Check if token exists
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: "Please log in first"
            });
        }

        const token = authHeader.split(' ')[1];

        // ✅ Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded.id || !decoded.role) {
            return res.status(403).json({
                success: false,
                message: "Invalid token data"
            });
        }

        // ✅ Pass full user data to Controllers
        req.user = {
            id: decoded.id,
            role: decoded.role,
            national_id: decoded.national_id || null,
            administrative_unit: decoded.administrative_unit || null,
            governorate: decoded.governorate || null
        };

        next();

    } catch (err) {
        console.error("Auth Middleware Error:", err.message);

        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: "Session has expired, please log in again"
            });
        }

        return res.status(403).json({
            success: false,
            message: "Invalid login session"
        });
    }
};

module.exports = authMiddleware;