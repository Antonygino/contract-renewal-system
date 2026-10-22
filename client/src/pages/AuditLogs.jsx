import { useState, useEffect } from 'react';
import { adminAPI } from '../api/services';
import { format } from 'date-fns';
import {
  FileText, Shield, AlertTriangle, CheckCircle, XCircle, Search,
  RefreshCw, Filter, ShieldAlert, ArrowRight, UserCheck, Eye
} from 'lucide-react';
import toast from 'react-hot-toast';

const ACTION_CONFIG = {
  DOCUMENT_CREATED: { label: 'Created', color: '#16a34a', bg: '#f0fdf4' },
  DOCUMENT_UPDATED: { label: 'Updated', color: '#2563eb', bg: '#eff6ff' },
  DOCUMENT_ARCHIVED: { label: 'Archived', color: '#d97706', bg: '#fffbeb' },
  DOCUMENT_PERMANENTLY_DELETED: { label: 'Permanently Deleted', color: '#dc2626', bg: '#fef2f2' },
  RENEWAL_REQUESTED: { label: 'Renewal Requested', color: '#d97706', bg: '#fffbeb' },
  RENEWAL_APPROVED: { label: 'Renewal Approved', color: '#16a34a', bg: '#f0fdf4' },
  RENEWAL_REJECTED: { label: 'Renewal Rejected', color: '#dc2626', bg: '#fef2f2' },
  AI_SCAN_COMPLETED: { label: 'AI Scan Processed', color: '#8b5cf6', bg: '#f5f3ff' },
  OWNER_REASSIGNED: { label: 'Owner Reassigned', color: '#0ea5e9', bg: '#f0f9ff' },
};

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 15,
        search: search || undefined,
        action: actionFilter || undefined,
        department: departmentFilter || undefined,
      };
      const { data } = await adminAPI.getAuditLogs(params);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch {
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, actionFilter, departmentFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  return (
    <div className="page-content">
      {/* Header Banner */}
      <div className="dashboard-header" style={{ marginBottom: 20 }}>
        <div>
          <h2 className="dashboard-title">Immutable Audit Trail & Compliance Log</h2>
          <p className="dashboard-subtitle">
            Forensic version history and timestamped access records for ISO, SOC2, and legal compliance.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={fetchLogs}>
            <RefreshCw size={13} /> Refresh Trail
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: 36, height: 38 }}
              placeholder="Search by contract title, user name, or action details..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div style={{ minWidth: 160 }}>
            <select
              className="form-select"
              style={{ height: 38 }}
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setPage(1); }}
            >
              <option value="">All Actions ({total})</option>
              <option value="DOCUMENT_CREATED">Created</option>
              <option value="DOCUMENT_UPDATED">Updated</option>
              <option value="RENEWAL_REQUESTED">Renewal Requested</option>
              <option value="RENEWAL_APPROVED">Renewal Approved</option>
              <option value="RENEWAL_REJECTED">Renewal Rejected</option>
              <option value="DOCUMENT_ARCHIVED">Archived</option>
              <option value="DOCUMENT_PERMANENTLY_DELETED">Permanently Deleted</option>
              <option value="OWNER_REASSIGNED">Owner Reassigned</option>
              <option value="AI_SCAN_COMPLETED">AI Scan</option>
            </select>
          </div>

          <div style={{ minWidth: 150 }}>
            <select
              className="form-select"
              style={{ height: 38 }}
              value={departmentFilter}
              onChange={e => { setDepartmentFilter(e.target.value); setPage(1); }}
            >
              <option value="">All Departments</option>
              <option value="Engineering">Engineering</option>
              <option value="Marketing">Marketing</option>
              <option value="Legal">Legal</option>
              <option value="HR">HR</option>
              <option value="Finance">Finance</option>
              <option value="Operations">Operations</option>
              <option value="General">General</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary btn-sm" style={{ height: 38 }}>
            Filter
          </button>
        </form>
      </div>

      {/* Table Container */}
      <div className="table-container">
        {loading ? (
          <div className="page-loader">
            <div className="loading-spinner" />
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state" style={{ padding: 60 }}>
            <Shield size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <h3>No audit records found</h3>
            <p>No actions matching the selected filter criteria were recorded.</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action Type</th>
                <th>Target Document</th>
                <th>Executed By</th>
                <th>Department</th>
                <th>Details</th>
                <th style={{ textAlign: 'right' }}>Forensics</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const actionConf = ACTION_CONFIG[log.action] || { label: log.action, color: '#64748b', bg: '#f1f5f9' };
                const logDate = log.createdAt ? new Date(log.createdAt) : new Date();

                return (
                  <tr key={log._id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-muted)' }}>
                      <div>{format(logDate, 'dd MMM yyyy')}</div>
                      <div style={{ fontSize: 11, opacity: 0.8 }}>{format(logDate, 'HH:mm:ss')}</div>
                    </td>

                    <td>
                      <span
                        className="badge"
                        style={{ background: actionConf.bg, color: actionConf.color, border: `1px solid ${actionConf.color}30` }}
                      >
                        {actionConf.label}
                      </span>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                        {log.documentTitle || 'System Entity'}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{log.userName}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        <span className="badge" style={{ padding: '1px 6px', fontSize: 10, textTransform: 'capitalize' }}>
                          {log.userRole}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {log.department || 'General'}
                      </span>
                    </td>

                    <td style={{ maxWidth: 280, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {log.details || 'No additional details logged'}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '3px 8px', fontSize: 11 }}
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye size={12} /> View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="pagination">
            <button
              className="page-btn"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              ‹
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 8px' }}>
              Page {page} of {pages}
            </span>
            <button
              className="page-btn"
              disabled={page >= pages}
              onClick={() => setPage(p => Math.min(pages, p + 1))}
            >
              ›
            </button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Shield size={18} color="var(--primary)" />
                <h2 style={{ fontSize: 16 }}>Audit Trail Forensic Record</h2>
              </div>
              <button className="btn btn-secondary btn-icon" onClick={() => setSelectedLog(null)}>
                <XCircle size={16} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <div className="form-label" style={{ fontSize: 11 }}>Action Type</div>
                  <div style={{ fontWeight: 600 }}>{selectedLog.action}</div>
                </div>
                <div>
                  <div className="form-label" style={{ fontSize: 11 }}>Timestamp</div>
                  <div>{format(new Date(selectedLog.createdAt), 'dd MMMM yyyy, HH:mm:ss')}</div>
                </div>
                <div>
                  <div className="form-label" style={{ fontSize: 11 }}>Executed By</div>
                  <div>{selectedLog.userName} ({selectedLog.userEmail || 'No email'})</div>
                </div>
                <div>
                  <div className="form-label" style={{ fontSize: 11 }}>Role & Department</div>
                  <div>{selectedLog.userRole?.toUpperCase()} · {selectedLog.department}</div>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div className="form-label" style={{ fontSize: 11 }}>Target Document</div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedLog.documentTitle || 'N/A'}</div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div className="form-label" style={{ fontSize: 11 }}>Action Details</div>
                <div style={{ background: 'var(--bg)', padding: '10px 14px', borderRadius: 8, fontSize: 13, border: '1px solid var(--border)' }}>
                  {selectedLog.details}
                </div>
              </div>

              {selectedLog.changes && (
                <div>
                  <div className="form-label" style={{ fontSize: 11 }}>Recorded State Changes (Diff)</div>
                  <pre style={{
                    background: '#0f172a',
                    color: '#e2e8f0',
                    padding: '12px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    overflowX: 'auto',
                    maxHeight: 180,
                  }}>
                    {JSON.stringify(selectedLog.changes, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedLog(null)}>
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogs;
