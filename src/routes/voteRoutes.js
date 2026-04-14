const express = require('express');
const router = express.Router();
const voteController = require('../controllers/voteController');
const auth = require('../middleware/authMiddleware');

/**
 * @route   POST /api/vote/cast
 * @desc    تنفيذ عملية التصويت (للناخبين والمرشحين)
 * @access  Private (Requires Token)
 */
// استخدام مسار مباشر ' / ' أو ' /cast ' حسب تنظيم الـ app.js عندك
if (voteController && voteController.castVote) {
    router.post('/cast', auth, voteController.castVote);
} else {
    console.error("⚠️ Error: castVote function is not defined in voteController.js");
}

/**
 * @route   GET /api/vote/status
 * @desc    التحقق من حالة التصويت للمستخدم الحالي (هل صوت قبل كدة؟)
 * @access  Private
 * ملاحظة: دي مهمة جداً عشان الـ Front-end يقفل زرار التصويت لو المستخدم صوت فعلاً
 */
if (voteController && voteController.checkUserVotingStatus) {
    router.get('/status', auth, voteController.checkUserVotingStatus);
} else {
    // لو لسه ما عملتش الدالة دي في الكنترولر، يفضل تجهزها
    console.warn("⚠️ Warning: checkUserVotingStatus is not defined yet.");
}

module.exports = router;