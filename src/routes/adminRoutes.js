const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminMiddleware = require('../middleware/adminMiddleware');

// بدون توكن
router.post('/login', adminController.login);

// محتاجة توكن Admin
router.post('/logout', adminMiddleware, adminController.logout);
router.post('/add', adminMiddleware, adminController.addAdmin);
router.get('/all', adminMiddleware, adminController.getAllAdmins);
router.delete('/delete/:id', adminMiddleware, adminController.deleteAdmin);

module.exports = router;