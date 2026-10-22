const express = require('express');
const router = express.Router();
const {
  getDocuments,
  getDocument,
  createDocument,
  updateDocument,
  renewDocument,
  archiveDocument,
  deleteDocument,
  getDashboardStats,
  parseDocument,
  aiScanDocument,
} = require('../controllers/documentController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.use(protect); // All document routes require auth

// Parse a PDF with basic regex and return extracted metadata (does NOT save to DB)
router.post('/parse', upload.single('file'), parseDocument);

// AI-powered scan with multi-provider fallback (OpenAI → Gemini → Claude → Regex)
router.post('/ai-scan', upload.single('file'), aiScanDocument);

router.get('/stats', getDashboardStats);
router.route('/').get(getDocuments).post(upload.single('file'), createDocument);
router.route('/:id').get(getDocument).put(upload.single('file'), updateDocument).delete(deleteDocument);
router.post('/:id/renew', upload.single('file'), renewDocument);
router.patch('/:id/archive', archiveDocument);

module.exports = router;
