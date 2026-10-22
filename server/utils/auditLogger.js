const AuditLog = require('../models/AuditLog');

/**
 * Log an audit action safely without disrupting main request execution
 */
const logAudit = async ({
  action,
  documentId = null,
  documentTitle = '',
  user,
  department = '',
  details = '',
  changes = null,
  ipAddress = '',
}) => {
  try {
    if (!user || !user._id) return;

    await AuditLog.create({
      action,
      documentId,
      documentTitle,
      user: user._id,
      userName: user.name || 'Unknown',
      userEmail: user.email || '',
      userRole: user.role || 'user',
      department: department || user.department || 'General',
      details,
      changes,
      ipAddress,
    });
  } catch (error) {
    console.error('⚠️ Audit log error (non-fatal):', error.message);
  }
};

module.exports = { logAudit };
