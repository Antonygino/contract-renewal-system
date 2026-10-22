const express = require('express');
const router = express.Router();
const {
  getAdminStats,
  getAdminUsers,
  getAuditLogs,
  getRenewalApprovalQueue,
  approveRenewalRequest,
  rejectRenewalRequest,
  reassignDocumentOwner,
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// All admin routes require both authentication and admin role
router.use(protect);
router.use(adminOnly);

router.get('/stats', getAdminStats);
router.get('/users', getAdminUsers);
router.get('/audit-logs', getAuditLogs);
router.get('/approvals', getRenewalApprovalQueue);
router.route('/approvals/:id/approve').put(approveRenewalRequest).patch(approveRenewalRequest);
router.route('/approvals/:id/reject').put(rejectRenewalRequest).patch(rejectRenewalRequest);
router.route('/documents/:id/reassign').put(reassignDocumentOwner).patch(reassignDocumentOwner);

module.exports = router;
