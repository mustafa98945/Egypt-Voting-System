const express = require('express');
const router = express.Router();
const voterController = require('../controllers/voterController');

router.post('/verify', voterController.verifyBeforeRegister);
router.post('/register', voterController.registerVoter);
router.post('/login', voterController.login);

module.exports = router;