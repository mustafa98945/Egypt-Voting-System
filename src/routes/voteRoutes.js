const express = require('express');
const router = express.Router();
const voteController = require('../controllers/voteController');
const auth = require('../middleware/authMiddleware');

/**
 * @route   POST /api/vote/cast
 * @desc    تنفيذ عملية التصويت (للناخبين والمرشحين)
 * @access  Private (Requires Token)
 */
// التأكد من أن voteController.castVote موجودة فعلاً قبل تمريرها
if (voteController && voteController.castVote) {
    router.post('/cast', auth, voteController.castVote);
} else {
    console.error("⚠️ Error: castVote function is not defined in voteController.js");
}

/**
 * @route   GET /api/vote/status
 * @desc    التحقق من حالة التصويت للمستخدم الحالي
 * @access  Private
 */
// يفضل تفعل الـ Route ده عشان الـ Front-end يعرف حالة المستخدم أول ما يفتح الصفحة
if (voteController && voteController.checkUserVotingStatus) {
    router.get('/status', auth, voteController.checkUserVotingStatus);
}

module.exports = router;