const express = require('express');
const router = express.Router();
const voterController = require('../controllers/voterController'); 
const voteController = require('../controllers/voteController'); 
const auth = require('../middleware/authMiddleware');

/**
 * 1. التحقق المبدئي (Auto-fill)
 * POST /api/voters/verify
 * تطابق شاشة Screenshot (474) - بتسحب البيانات بالرقم القومي
 */
router.post('/verify', voterController.verifyBeforeRegister);

/**
 * 2. تسجيل حساب ناخب جديد
 * POST /api/voters/register
 * تطابق شاشة Screenshot (475) - بترفع صورة البطاقة وتخزن الحساب
 */
router.post('/register', voterController.registerVoter);

/**
 * 3. تسجيل الدخول
 * POST /api/voters/login
 * تدعم الدخول التقليدي وبصمة الوجه
 */
router.post('/login', voterController.login);

/**
 * 4. جلب بيانات بطاقة الناخب (Voter Card)
 * GET /api/voters/voter-card
 * محمية بـ auth - بتعرض الكود الانتخابي v_code كما في Screenshot (476)
 */
router.get('/voter-card', auth, voterController.getVoterCard);

/**
 * 5. عملية التصويت (Cast Vote)
 * POST /api/voters/cast-vote
 * محمية بـ auth لضمان أن الناخب المسجل فقط هو من يصوت
 */
if (voteController && voteController.castVote) {
    router.post('/cast-vote', auth, voteController.castVote);
} else {
    console.warn("⚠️ تنبيه: دالة castVote غير معرفة في voteController. تأكد من برمجتها لاحقاً.");
}

/**
 * 6. التحقق من حالة التصويت
 * GET /api/voters/vote-status
 * بتعرف الموبايل هل يظهر زر "صوّت الآن" أم رسالة "لقد قمت بالتصويت"
 */
if (voteController && voteController.checkUserVotingStatus) {
    router.get('/vote-status', auth, voteController.checkUserVotingStatus);
}

module.exports = router;