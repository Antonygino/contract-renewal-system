const express = require('express');
const router = express.Router();
const { exportPDF, exportExcel } = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/pdf', exportPDF);
router.get('/excel', exportExcel);

module.exports = router;
