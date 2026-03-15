const express = require('express');
const router = express.Router();
// ✅ ضيف حرف الـ s عشان يطابق اسم الملف في الفولدر عندك
const voterController = require('../controllers/voterControllers'); 

router.post('/verify', voterController.verifyBeforeRegister);
router.post('/register', voterController.registerVoter);
router.post('/login', voterController.login);

module.exports = router;