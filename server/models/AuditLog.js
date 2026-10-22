const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'DOCUMENT_CREATED',
        'DOCUMENT_UPDATED',
        'DOCUMENT_ARCHIVED',
        'DOCUMENT_PERMANENTLY_DELETED',
        'RENEWAL_REQUESTED',
        'RENEWAL_APPROVED',
        'RENEWAL_REJECTED',
        'AI_SCAN_COMPLETED',
        'OWNER_REASSIGNED',
        'STATUS_CHANGED',
      ],
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
    },
    documentTitle: {
      type: String,
      default: '',
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    userName: {
      type: String,
      default: '',
    },
    userEmail: {
      type: String,
      default: '',
    },
    userRole: {
      type: String,
      default: 'user',
    },
    department: {
      type: String,
      default: 'General',
    },
    details: {
      type: String,
      default: '',
    },
    changes: {
      type: mongoose.Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ documentId: 1 });
auditLogSchema.index({ user: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ department: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
