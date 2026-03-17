const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');
const auth = require('../middleware/authMiddleware');

// تسجيل مرشح
router.post('/register', candidateController.registerCandidate);

// تسجيل دخول (تأكد من الاسم في Postman)
router.post('/loginCandidate', candidateController.loginCandidate);

// القائمة (محمية)
router.get('/list', auth, candidateController.listCandidates);

module.exports = router;