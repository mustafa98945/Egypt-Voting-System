const express = require('express');
const router = express.Router();
const voteController = require('../controllers/voteController');
const auth = require('../middleware/authMiddleware');

/**
 * @route   POST /api/vote/cast
 * @desc    تنفيذ عملية التصويت لمرشح معين
 * @access  Private (يتطلب توكن ناخب أو مرشح)
 */
router.post('/cast', auth, voteController.castVote);

/**
 * ملاحظة: 
 * الـ auth middleware سيقوم بفك التوكن وتجهيز req.user.id و req.user.role
 * الـ voteController سيستخدم هذه البيانات للتحقق من الصلاحية وتنفيذ التصويت في قاعدة البيانات
 */

module.exports = router;