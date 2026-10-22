const User = require('../models/User');
const Document = require('../models/Document');
const AuditLog = require('../models/AuditLog');
const { logAudit } = require('../utils/auditLogger');
const mongoose = require('mongoose');

// @desc    Get system-wide administrator statistics with Compliance Health Score & Orphan Detection
// @route   GET /api/admin/stats
// @access  Private/Admin
const getAdminStats = async (req, res, next) => {
  try {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      inactiveUsersList,
      totalDocuments,
      activeDocuments,
      expiredDocuments,
      criticalDocuments,
      pendingApprovals,
      departmentStats,
      totalCostAgg,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.find({
        $or: [
          { isActive: false },
          { lastLogin: { $lt: sixtyDaysAgo } },
          { lastLogin: { $exists: false }, createdAt: { $lt: sixtyDaysAgo } },
        ],
      }).select('_id name email department lastLogin isActive'),
      Document.countDocuments({ isArchived: { $ne: true } }),
      Document.countDocuments({ status: 'Active', isArchived: { $ne: true } }),
      Document.countDocuments({ status: 'Expired', isArchived: { $ne: true } }),
      Document.countDocuments({
        expiryDate: { $gte: now, $lte: sevenDaysFromNow },
        status: { $in: ['Active', 'Expiring Soon'] },
        isArchived: { $ne: true },
      }),
      Document.countDocuments({ 'renewalRequest.status': 'Pending Approval' }),
      Document.aggregate([
        { $match: { isArchived: { $ne: true } } },
        {
          $group: {
            _id: '$department',
            count: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
            expired: { $sum: { $cond: [{ $eq: ['$status', 'Expired'] }, 1, 0] } },
            cost: { $sum: '$cost' },
          },
        },
        { $sort: { count: -1 } },
      ]),
      Document.aggregate([
        { $match: { isArchived: { $ne: true } } },
        { $group: { _id: null, total: { $sum: '$cost' } } },
      ]),
    ]);

    // Detect Orphan Documents (owner inactive >60 days, deactivated, or unassigned)
    const inactiveUserIds = inactiveUsersList.map(u => u._id);
    const orphanDocuments = await Document.find({
      $or: [
        { user: { $in: inactiveUserIds } },
        { user: { $exists: false } },
        { user: null },
      ],
      isArchived: { $ne: true },
    })
      .populate('user', 'name email department lastLogin isActive')
      .limit(20);

    // Calculate Company-Wide Compliance Health Score (0 - 100%)
    let complianceScore = 100;
    if (totalDocuments > 0) {
      const expiredPenalty = Math.min(50, (expiredDocuments / totalDocuments) * 60);
      const criticalPenalty = Math.min(25, (criticalDocuments / totalDocuments) * 35);
      const orphanPenalty = Math.min(15, (orphanDocuments.length / totalDocuments) * 25);
      const pendingPenalty = Math.min(10, pendingApprovals * 2);
      complianceScore = Math.max(0, Math.round(100 - expiredPenalty - criticalPenalty - orphanPenalty - pendingPenalty));
    }

    let complianceRating = { grade: 'A', status: 'Excellent', color: '#16a34a' };
    if (complianceScore < 60) {
      complianceRating = { grade: 'D', status: 'High Compliance Risk', color: '#dc2626' };
    } else if (complianceScore < 75) {
      complianceRating = { grade: 'C', status: 'Attention Needed', color: '#d97706' };
    } else if (complianceScore < 90) {
      complianceRating = { grade: 'B', status: 'Good Standing', color: '#2563eb' };
    }

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        totalDocuments,
        activeDocuments,
        expiredDocuments,
        criticalDocuments,
        pendingApprovals,
        totalRenewalCost: totalCostAgg[0]?.total || 0,
        complianceHealthScore: {
          score: complianceScore,
          ...complianceRating,
        },
        departmentBreakdown: departmentStats,
        orphanCount: orphanDocuments.length,
        orphans: orphanDocuments,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all audit logs with pagination & filtering
// @route   GET /api/admin/audit-logs
// @access  Private/Admin
const getAuditLogs = async (req, res, next) => {
  try {
    const { action, department, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (action) query.action = action;
    if (department) query.department = department;
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { documentTitle: regex },
        { userName: regex },
        { userEmail: regex },
        { details: regex },
      ];
    }

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (safePage - 1) * safeLimit;

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .sort('-createdAt')
      .skip(skip)
      .limit(safeLimit);

    res.status(200).json({
      success: true,
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit) || 1,
      logs,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Renewal Approval Queue (Pending Requests)
// @route   GET /api/admin/approvals
// @access  Private/Admin
const getRenewalApprovalQueue = async (req, res, next) => {
  try {
    const pendingDocuments = await Document.find({
      'renewalRequest.status': 'Pending Approval',
    })
      .populate('user', 'name email department')
      .populate('renewalRequest.requestedBy', 'name email department')
      .sort('-renewalRequest.requestedAt');

    res.status(200).json({
      success: true,
      total: pendingDocuments.length,
      queue: pendingDocuments,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve a Renewal Request
// @route   PUT /api/admin/approvals/:id/approve
// @access  Private/Admin
const approveRenewalRequest = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const document = await Document.findById(req.params.id).populate('user', 'name email department');
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    if (document.renewalRequest?.status !== 'Pending Approval') {
      return res.status(400).json({ success: false, message: 'Document has no pending renewal request' });
    }

    const oldExpiry = document.expiryDate;
    const oldCost = document.cost;
    const newExpiry = document.renewalRequest.newExpiryDate;
    const newCost = document.renewalRequest.cost;

    document.expiryDate = newExpiry;
    document.cost = newCost;
    document.renewalDate = new Date();
    document.status = 'Renewed';
    document.reminderSent = false;
    document.renewalRequest.status = 'Approved';
    document.renewalRequest.reviewedBy = req.user._id;
    document.renewalRequest.reviewedAt = new Date();

    await document.save();

    await logAudit({
      action: 'RENEWAL_APPROVED',
      documentId: document._id,
      documentTitle: document.title,
      user: req.user,
      department: document.department,
      details: `Admin ${req.user.name} approved renewal to ${new Date(newExpiry).toLocaleDateString()} (Cost: ₹${newCost})`,
      changes: {
        expiryDate: { from: oldExpiry, to: newExpiry },
        cost: { from: oldCost, to: newCost },
      },
      ipAddress: req.ip || '',
    });

    res.status(200).json({
      success: true,
      message: `Renewal approved for "${document.title}". Validity extended to ${new Date(newExpiry).toLocaleDateString()}.`,
      document,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reject a Renewal Request
// @route   PUT /api/admin/approvals/:id/reject
// @access  Private/Admin
const rejectRenewalRequest = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    if (document.renewalRequest?.status !== 'Pending Approval') {
      return res.status(400).json({ success: false, message: 'Document has no pending renewal request' });
    }

    const reason = req.body.reason || 'Rejected by compliance administrator';
    document.renewalRequest.status = 'Rejected';
    document.renewalRequest.rejectionReason = reason;
    document.renewalRequest.reviewedBy = req.user._id;
    document.renewalRequest.reviewedAt = new Date();

    // Re-evaluate document status according to current date
    const now = new Date();
    if (new Date(document.expiryDate) < now) {
      document.status = 'Expired';
    } else {
      document.status = 'Active';
    }

    await document.save();

    await logAudit({
      action: 'RENEWAL_REJECTED',
      documentId: document._id,
      documentTitle: document.title,
      user: req.user,
      department: document.department,
      details: `Admin ${req.user.name} rejected renewal request. Reason: ${reason}`,
      ipAddress: req.ip || '',
    });

    res.status(200).json({
      success: true,
      message: `Renewal request rejected for "${document.title}".`,
      document,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reassign Document Owner (Orphan resolution or employee handover)
// @route   PUT /api/admin/documents/:id/reassign
// @access  Private/Admin
const reassignDocumentOwner = async (req, res, next) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId || !mongoose.isValidObjectId(targetUserId)) {
      return res.status(400).json({ success: false, message: 'Valid target user ID is required' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Target user not found' });
    }

    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    const previousOwnerId = document.user;
    document.user = targetUser._id;
    document.assignedTo = targetUser._id;
    if (targetUser.department && targetUser.department !== 'General') {
      document.department = targetUser.department;
    }

    await document.save();

    await logAudit({
      action: 'OWNER_REASSIGNED',
      documentId: document._id,
      documentTitle: document.title,
      user: req.user,
      department: document.department,
      details: `Document reassigned to ${targetUser.name} (${targetUser.email})`,
      changes: {
        previousOwner: previousOwnerId,
        newOwner: targetUser._id,
      },
      ipAddress: req.ip || '',
    });

    res.status(200).json({
      success: true,
      message: `Document "${document.title}" successfully reassigned to ${targetUser.name}.`,
      document,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    List all system users
// @route   GET /api/admin/users
// @access  Private/Admin
const getAdminUsers = async (req, res, next) => {
  try {
    const users = await User.find().select('-password').sort('-createdAt');
    res.status(200).json({
      success: true,
      total: users.length,
      users,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdminStats,
  getAdminUsers,
  getAuditLogs,
  getRenewalApprovalQueue,
  approveRenewalRequest,
  rejectRenewalRequest,
  reassignDocumentOwner,
};
