const express = require('express');
const router = express.Router();
const voteController = require('../controllers/voteController');
const auth = require('../middleware/authMiddleware');

/**
 * @route   POST /api/vote/cast
 * @desc    تنفيذ عملية التصويت (للناخبين والمرشحين)
 * @access  Private
 */
router.post('/cast', auth, voteController.castVote);

/**
 * @route   GET /api/vote/status
 * @desc    التحقق مما إذا كان المستخدم الحالي قد صوت بالفعل أم لا
 * @access  Private
 * ملاحظة: دي مهمة جداً للـ Front-end عشان يظهر "تم التصويت" بدل زرار التصويت
 */
// لو عندك دالة في الكنترولر للتحقق ممكن تضيفها هنا، لو مش عندك فالـ /cast بتهندل ده
// router.get('/status', auth, voteController.checkUserVotingStatus);

/**
 * ملاحظة تقنية:
 * 1. الـ auth middleware بيضمن إن req.user جاهز.
 * 2. تم فصل منطق التصويت في Controller مستقل لضمان سهولة الصيانة.
 */

module.exports = router;