const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const Document = require('../models/Document');
const { parseUploadedDocument } = require('../utils/documentParser');
const { scanDocument } = require('../utils/aiScanner');
const { logAudit } = require('../utils/auditLogger');

// Helper to escape regex special characters
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// @desc    Get all documents (Scoped by role & department)
// @route   GET /api/documents
// @access  Private
const getDocuments = async (req, res, next) => {
  try {
    const {
      type,
      status,
      search,
      department,
      scope,
      archived,
      sort = '-createdAt',
      page = 1,
      limit = 10,
    } = req.query;

    const query = {};

    // 1. Scoping by Role & Department
    if (req.user.role === 'admin') {
      if (scope === 'my') {
        query.user = req.user.id;
      } else if (department && department !== 'All') {
        query.department = department;
      }
    } else {
      // Regular User: Scoped to their department or personal ownership
      const userDept = req.user.department || 'General';
      query.$or = [
        { user: req.user.id },
        { assignedTo: req.user.id },
        { department: userDept },
      ];
    }

    // 2. Archival filter
    if (archived === 'true') {
      query.isArchived = true;
    } else {
      query.isArchived = { $ne: true };
    }

    // 3. Other filters
    if (type && typeof type === 'string' && type !== 'All') query.type = type;
    if (status && typeof status === 'string' && status !== 'All') query.status = status;

    if (search && typeof search === 'string' && search.trim()) {
      const safeSearch = escapeRegex(search.trim());
      const searchConditions = [
        { title: { $regex: safeSearch, $options: 'i' } },
        { issuer: { $regex: safeSearch, $options: 'i' } },
        { tags: { $in: [new RegExp(safeSearch, 'i')] } },
      ];

      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchConditions }];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
    }

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (safePage - 1) * safeLimit;

    const total = await Document.countDocuments(query);
    const documents = await Document.find(query)
      .populate('user', 'name email department')
      .populate('assignedTo', 'name email department')
      .populate('renewalRequest.requestedBy', 'name email department')
      .sort(sort)
      .skip(skip)
      .limit(safeLimit);

    res.status(200).json({
      success: true,
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit) || 1,
      documents,
      userDepartment: req.user.department || 'General',
      isAdmin: req.user.role === 'admin',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single document
// @route   GET /api/documents/:id
// @access  Private
const getDocument = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    let query = { _id: req.params.id };
    if (req.user.role !== 'admin') {
      const userDept = req.user.department || 'General';
      query.$or = [
        { user: req.user.id },
        { assignedTo: req.user.id },
        { department: userDept },
      ];
    }

    const document = await Document.findOne(query)
      .populate('user', 'name email department')
      .populate('assignedTo', 'name email department')
      .populate('renewalRequest.requestedBy', 'name email department')
      .populate('renewalRequest.reviewedBy', 'name email department');

    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found or access denied' });
    }

    res.status(200).json({ success: true, document });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a document
// @route   POST /api/documents
// @access  Private
const createDocument = async (req, res, next) => {
  try {
    const docData = {
      ...req.body,
      user: req.user.id,
      department: req.body.department || req.user.department || 'General',
      assignedTo: req.body.assignedTo || req.user.id,
    };

    // Validation
    const { title, type, issuer, issueDate, expiryDate } = docData;
    const missing = [];
    if (!title || !String(title).trim()) missing.push('title');
    if (!type || !String(type).trim()) missing.push('type');
    if (!issuer || !String(issuer).trim()) missing.push('issuer');
    if (!issueDate) missing.push('issueDate');
    if (!expiryDate) missing.push('expiryDate');

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required field(s): ${missing.join(', ')}`,
      });
    }

    if (isNaN(new Date(issueDate).getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid issue date' });
    }
    if (isNaN(new Date(expiryDate).getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid expiry date' });
    }

    if (typeof docData.tags === 'string') {
      try {
        const parsed = JSON.parse(docData.tags);
        docData.tags = Array.isArray(parsed) ? parsed : docData.tags.split(',').map(t => t.trim()).filter(Boolean);
      } catch {
        docData.tags = docData.tags.split(',').map(t => t.trim()).filter(Boolean);
      }
    }

    if (docData.cost !== undefined && docData.cost !== '') docData.cost = Number(docData.cost) || 0;
    if (docData.reminderDays !== undefined && docData.reminderDays !== '') docData.reminderDays = Number(docData.reminderDays) || 30;

    if (req.file) {
      docData.attachmentUrl = `/uploads/${req.file.filename}`;
      docData.fileName = req.file.originalname;
      docData.fileSize = req.file.size;
      docData.fileType = req.file.mimetype;
    }

    const document = await Document.create(docData);

    // Audit Log
    await logAudit({
      action: 'DOCUMENT_CREATED',
      documentId: document._id,
      documentTitle: document.title,
      user: req.user,
      department: document.department,
      details: `Created ${document.type} for "${document.issuer}" expiring on ${new Date(document.expiryDate).toLocaleDateString()}`,
      ipAddress: req.ip || '',
    });

    res.status(201).json({ success: true, message: 'Document created successfully', document });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a document
// @route   PUT /api/documents/:id
// @access  Private
const updateDocument = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    let query = { _id: req.params.id };
    if (req.user.role !== 'admin') {
      query.$or = [{ user: req.user.id }, { assignedTo: req.user.id }];
    }

    let document = await Document.findOne(query);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found or unauthorized' });
    }

    const updateData = { ...req.body };

    if (updateData.issueDate && isNaN(new Date(updateData.issueDate).getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid issue date' });
    }
    if (updateData.expiryDate && isNaN(new Date(updateData.expiryDate).getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid expiry date' });
    }

    if (typeof updateData.tags === 'string') {
      try {
        const parsed = JSON.parse(updateData.tags);
        updateData.tags = Array.isArray(parsed) ? parsed : updateData.tags.split(',').map(t => t.trim()).filter(Boolean);
      } catch {
        updateData.tags = updateData.tags.split(',').map(t => t.trim()).filter(Boolean);
      }
    }

    if (updateData.cost !== undefined && updateData.cost !== '') updateData.cost = Number(updateData.cost) || 0;
    if (updateData.reminderDays !== undefined && updateData.reminderDays !== '') updateData.reminderDays = Number(updateData.reminderDays) || 30;

    if (req.file) {
      updateData.attachmentUrl = `/uploads/${req.file.filename}`;
      updateData.fileName = req.file.originalname;
      updateData.fileSize = req.file.size;
      updateData.fileType = req.file.mimetype;
    }

    const oldValues = {
      title: document.title,
      expiryDate: document.expiryDate,
      cost: document.cost,
      status: document.status,
    };

    Object.assign(document, updateData);
    await document.save();

    // Audit Log
    await logAudit({
      action: 'DOCUMENT_UPDATED',
      documentId: document._id,
      documentTitle: document.title,
      user: req.user,
      department: document.department,
      details: `Document details updated by ${req.user.name}`,
      changes: { oldValues, updatedFields: Object.keys(updateData) },
      ipAddress: req.ip || '',
    });

    res.status(200).json({ success: true, message: 'Document updated successfully', document });
  } catch (error) {
    next(error);
  }
};

// @desc    Renew or submit a renewal request (Two-Step Governance Workflow)
// @route   POST /api/documents/:id/renew
// @access  Private
const renewDocument = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    let query = { _id: req.params.id };
    if (req.user.role !== 'admin') {
      query.$or = [{ user: req.user.id }, { assignedTo: req.user.id }, { department: req.user.department || 'General' }];
    }

    let document = await Document.findOne(query);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found or unauthorized' });
    }

    const { newExpiryDate, cost, notes } = req.body;
    if (!newExpiryDate || isNaN(new Date(newExpiryDate).getTime())) {
      return res.status(400).json({ success: false, message: 'Valid new expiry date is required for renewal' });
    }

    const renewalCost = cost !== undefined && cost !== '' ? Number(cost) : document.cost || 0;
    const APPROVAL_THRESHOLD = 10000; // Auto-approval limit: ₹10,000

    const attachmentUrl = req.file ? `/uploads/${req.file.filename}` : document.attachmentUrl;
    const fileName = req.file ? req.file.originalname : document.fileName;
    const fileSize = req.file ? req.file.size : document.fileSize;
    const fileType = req.file ? req.file.mimetype : document.fileType;

    // Check Governance Rule:
    // If user is Admin OR renewal cost is below ₹10,000 threshold -> Auto-Approve immediately
    const isAutoApproved = req.user.role === 'admin' || renewalCost < APPROVAL_THRESHOLD;

    if (isAutoApproved) {
      const oldExpiry = document.expiryDate;
      document.renewalDate = new Date();
      document.expiryDate = new Date(newExpiryDate);
      document.cost = renewalCost;

      const renewalNote = `[Renewed on ${new Date().toLocaleDateString()}] ${notes || ''}`.trim();
      document.notes = document.notes ? `${document.notes}\n${renewalNote}` : renewalNote;
      document.reminderSent = false;
      document.status = 'Renewed';

      document.renewalRequest = {
        status: 'Approved',
        newExpiryDate: new Date(newExpiryDate),
        cost: renewalCost,
        justification: notes || 'Direct renewal',
        quoteUrl: attachmentUrl,
        requestedBy: req.user.id,
        requestedAt: new Date(),
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
      };

      if (req.file) {
        document.attachmentUrl = attachmentUrl;
        document.fileName = fileName;
        document.fileSize = fileSize;
        document.fileType = fileType;
      }

      await document.save();

      await logAudit({
        action: 'RENEWAL_APPROVED',
        documentId: document._id,
        documentTitle: document.title,
        user: req.user,
        department: document.department,
        details: req.user.role === 'admin'
          ? `Direct renewal confirmed by Admin ${req.user.name}`
          : `Auto-approved renewal under ₹${APPROVAL_THRESHOLD} threshold`,
        changes: { expiryDate: { from: oldExpiry, to: document.expiryDate }, cost: renewalCost },
        ipAddress: req.ip || '',
      });

      return res.status(200).json({
        success: true,
        message: `"${document.title}" renewed successfully! Valid until ${new Date(newExpiryDate).toLocaleDateString()}.`,
        document,
        requiresApproval: false,
      });
    }

    // Otherwise: Requires Two-Step Approval Workflow (Cost >= ₹10,000)
    document.renewalRequest = {
      status: 'Pending Approval',
      newExpiryDate: new Date(newExpiryDate),
      cost: renewalCost,
      justification: notes || '',
      quoteUrl: attachmentUrl,
      requestedBy: req.user.id,
      requestedAt: new Date(),
    };
    document.status = 'Pending Approval';

    await document.save();

    await logAudit({
      action: 'RENEWAL_REQUESTED',
      documentId: document._id,
      documentTitle: document.title,
      user: req.user,
      department: document.department,
      details: `Renewal request submitted by ${req.user.name} for ₹${renewalCost}. Awaiting Admin sign-off.`,
      ipAddress: req.ip || '',
    });

    return res.status(200).json({
      success: true,
      message: `Renewal request submitted for administrator review (Cost ₹${renewalCost.toLocaleString()} exceeds threshold).`,
      document,
      requiresApproval: true,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Archive / Unarchive a document (Regular users can archive; only admin can delete)
// @route   PATCH /api/documents/:id/archive
// @access  Private
const archiveDocument = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    let query = { _id: req.params.id };
    if (req.user.role !== 'admin') {
      query.$or = [{ user: req.user.id }, { assignedTo: req.user.id }, { department: req.user.department || 'General' }];
    }

    const document = await Document.findOne(query);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found or unauthorized' });
    }

    document.isArchived = !document.isArchived;
    await document.save();

    await logAudit({
      action: 'DOCUMENT_ARCHIVED',
      documentId: document._id,
      documentTitle: document.title,
      user: req.user,
      department: document.department,
      details: document.isArchived ? 'Document moved to archive' : 'Document unarchived',
      ipAddress: req.ip || '',
    });

    res.status(200).json({
      success: true,
      message: document.isArchived ? 'Document archived' : 'Document restored from archive',
      document,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Permanently delete a document (Admin Only)
// @route   DELETE /api/documents/:id
// @access  Private/Admin Only
const deleteDocument = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    // Role check: Only admin can permanently delete documents
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Compliance Restriction: Regular members cannot permanently delete records. Please archive or mark as Cancelled instead.',
      });
    }

    const document = await Document.findByIdAndDelete(req.params.id);
    if (!document) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }

    // Log permanent purge in Immutable Audit Trail
    await logAudit({
      action: 'DOCUMENT_PERMANENTLY_DELETED',
      documentId: document._id,
      documentTitle: document.title,
      user: req.user,
      department: document.department,
      details: `Administrator ${req.user.name} permanently purged record from the database.`,
      ipAddress: req.ip || '',
    });

    res.status(200).json({ success: true, message: 'Document permanently deleted by administrator' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get dashboard stats (Scoped for user vs Global for admin)
// @route   GET /api/documents/stats
// @access  Private
const getDashboardStats = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const { department, scope } = req.query;

    const userId = req.user._id || req.user.id;
    const userObjId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null;

    let matchQuery = { isArchived: { $ne: true } };

    if (isAdmin) {
      if (scope === 'my') {
        if (userObjId) matchQuery.user = userObjId;
      } else if (department && department !== 'All') {
        matchQuery.department = department;
      }
    } else {
      const userDept = req.user.department || 'General';
      const userMatch = userObjId ? [{ user: userObjId }, { assignedTo: userObjId }] : [];
      matchQuery.$or = [
        ...userMatch,
        { department: userDept },
      ];
    }

    const [total, active, expiringSoon, expired, pendingApproval, byType] = await Promise.all([
      Document.countDocuments(matchQuery),
      Document.countDocuments({ ...matchQuery, status: 'Active' }),
      Document.countDocuments({ ...matchQuery, status: 'Expiring Soon' }),
      Document.countDocuments({ ...matchQuery, status: 'Expired' }),
      Document.countDocuments({ ...matchQuery, status: 'Pending Approval' }),
      Document.aggregate([
        { $match: matchQuery },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    // Upcoming renewals in next 30 days
    const upcoming = await Document.find({
      ...matchQuery,
      expiryDate: {
        $gte: new Date(),
        $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
      .populate('user', 'name email department')
      .sort('expiryDate')
      .limit(6);

    // Monthly renewal trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const trend = await Document.aggregate([
      {
        $match: {
          ...matchQuery,
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    res.status(200).json({
      success: true,
      stats: { total, active, expiringSoon, expired, pendingApproval },
      byType,
      upcoming,
      trend,
      userDepartment: req.user.department || 'General',
      isAdmin,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Parse an uploaded PDF and return auto-extracted metadata (does NOT save to DB)
// @route   POST /api/documents/parse
// @access  Private
const parseDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded. Please upload a PDF file.' });
    }

    const filePath = req.file.path;
    const result = await parseUploadedDocument(filePath);

    try { fs.unlinkSync(filePath); } catch (_) {}

    if (!result.success) {
      return res.status(422).json({ success: false, message: result.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Document parsed successfully',
      parsed: result.parsed,
    });
  } catch (error) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
    next(error);
  }
};

// @desc    AI-scan an uploaded document and return auto-extracted metadata
// @route   POST /api/documents/ai-scan
// @access  Private
const aiScanDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded. Please upload a file.' });
    }

    const filePath = req.file.path;
    const result = await scanDocument(filePath);

    try { fs.unlinkSync(filePath); } catch (_) {}

    if (!result.success) {
      return res.status(422).json({
        success: false,
        provider: result.provider,
        warnings: result.warnings,
        message: result.message || 'AI scanning failed. Please fill in the form manually.',
      });
    }

    // Log AI scan completion
    await logAudit({
      action: 'AI_SCAN_COMPLETED',
      user: req.user,
      details: `AI document scanner extracted metadata using ${result.provider}`,
      ipAddress: req.ip || '',
    });

    return res.status(200).json({
      success: true,
      provider: result.provider,
      warnings: result.warnings,
      parsed: result.parsed,
    });
  } catch (error) {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
    next(error);
  }
};

module.exports = {
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
};
