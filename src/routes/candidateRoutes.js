const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');

// 1. تسجيل مرشح جديد
router.post('/register', candidateController.registerCandidate);

// 2. الـ Smart Login (عنوان واحد للدخول بالبريد أو ببصمة الوجه)
router.post('/login', candidateController.loginCandidate);

module.exports = router;