import { useState, useEffect } from 'react';
import { adminAPI } from '../api/services';
import { format, differenceInDays } from 'date-fns';
import {
  CheckCircle, XCircle, AlertCircle, FileText, ArrowRight,
  ExternalLink, Clock, ShieldCheck, Filter
} from 'lucide-react';
import toast from 'react-hot-toast';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

const Approvals = () => {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchQueue = async () => {
    try {
      setLoading(true);
      const { data } = await adminAPI.getApprovals();
      setQueue(data.queue || []);
    } catch {
      toast.error('Failed to load renewal approval queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const [approvingDoc, setApprovingDoc] = useState(null);

  const confirmApprove = async () => {
    if (!approvingDoc) return;
    setSubmitting(true);
    try {
      const { data } = await adminAPI.approveRenewal(approvingDoc._id);
      toast.success(data.message || 'Renewal approved successfully!');
      setApprovingDoc(null);
      fetchQueue();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve renewal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      toast.error('Please specify a rejection reason');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await adminAPI.rejectRenewal(rejectingId, rejectReason);
      toast.success(data.message || 'Renewal request rejected');
      setRejectingId(null);
      setRejectReason('');
      fetchQueue();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject renewal');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-loader">
        <div style={{ textAlign: 'center' }}>
          <div className="loading-spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading approval queue...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Header Banner */}
      <div className="dashboard-header" style={{ marginBottom: 20 }}>
        <div>
          <h2 className="dashboard-title">Renewal Governance & Approval Queue</h2>
          <p className="dashboard-subtitle">
            Two-step verification for contract extensions and renewal expenditure exceeding ₹10,000 threshold.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="chart-badge" style={{ background: 'var(--bg-hover)', fontSize: 12, padding: '4px 12px' }}>
            <Clock size={12} style={{ marginRight: 5 }} />
            {queue.length} Pending Sign-Off{queue.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--success-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: 'var(--success)' }}>
            <ShieldCheck size={26} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            Approval Queue is Clear!
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 420, margin: '0 auto' }}>
            No contract extensions are currently awaiting administrator authorization. All renewals are up to date.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {queue.map((doc) => {
            const reqData = doc.renewalRequest;
            const currentExpiry = doc.expiryDate ? new Date(doc.expiryDate) : null;
            const proposedExpiry = reqData?.newExpiryDate ? new Date(reqData.newExpiryDate) : null;
            const hasQuote = !!reqData?.quoteUrl;

            return (
              <div key={doc._id} className="card" style={{ padding: '20px 24px', borderLeft: '4px solid var(--warning)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 280 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{doc.title}</span>
                      <span className="badge badge-expiring" style={{ fontSize: 11 }}>Pending Approval</span>
                      <span className="badge" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                        {doc.department || 'General'}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                      {doc.type} · Issued by <strong>{doc.issuer}</strong> · Requested by <strong>{reqData?.requestedBy?.name || doc.user?.name || 'Team Member'}</strong> ({reqData?.requestedBy?.email || doc.user?.email})
                    </div>

                    {/* Comparison Box */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: 12,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '12px 16px',
                      marginBottom: 12
                    }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current Expiry</div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {currentExpiry ? format(currentExpiry, 'dd MMM yyyy') : 'N/A'}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Proposed Extension</div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--primary)', marginTop: 2 }}>
                          {proposedExpiry ? format(proposedExpiry, 'dd MMM yyyy') : 'N/A'}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Renewal Expenditure</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)', marginTop: 2 }}>
                          ₹{(reqData?.cost || doc.cost || 0).toLocaleString()} {doc.currency || 'INR'}
                        </div>
                      </div>
                    </div>

                    {/* Justification & Attachments */}
                    {reqData?.justification && (
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Justification: </strong>
                        {reqData.justification}
                      </div>
                    )}

                    {hasQuote && (
                      <div style={{ marginTop: 6 }}>
                        <a
                          href={`${API_BASE_URL}${reqData.quoteUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="file-action-btn"
                          style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        >
                          <ExternalLink size={12} /> View Attached Quote / Vendor Invoice
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Actions Column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 150 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setApprovingDoc(doc)}
                      disabled={submitting}
                      style={{ background: '#16a34a', borderColor: '#16a34a', color: '#fff' }}
                    >
                      <CheckCircle size={14} /> Authorize & Renew
                    </button>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setRejectingId(doc._id); setRejectReason(''); }}
                      disabled={submitting}
                      style={{ color: 'var(--danger)' }}
                    >
                      <XCircle size={14} /> Reject Request
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Authorize Confirmation Modal */}
      {approvingDoc && (
        <div className="modal-overlay" onClick={() => setApprovingDoc(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(22,163,74,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                  <CheckCircle size={18} />
                </div>
                <h2 style={{ fontSize: 16 }}>Authorize Contract Renewal</h2>
              </div>
              <button className="btn btn-secondary btn-icon" onClick={() => setApprovingDoc(null)}>
                <XCircle size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                You are approving two-step renewal governance for:
              </p>
              <div style={{ padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{approvingDoc.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Department: <strong>{approvingDoc.department || 'General'}</strong> · Issuer: <strong>{approvingDoc.issuer}</strong>
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12 }}>
                  <span>Extension: <strong style={{ color: 'var(--primary)' }}>{approvingDoc.renewalRequest?.newExpiryDate ? format(new Date(approvingDoc.renewalRequest.newExpiryDate), 'dd MMM yyyy') : 'N/A'}</strong></span>
                  <span>Cost: <strong style={{ color: 'var(--danger)' }}>₹{(approvingDoc.renewalRequest?.cost || approvingDoc.cost || 0).toLocaleString()}</strong></span>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Upon authorization, the contract expiry date will be extended and this sign-off will be permanently written to the Forensic Audit Trail.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setApprovingDoc(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#16a34a', borderColor: '#16a34a' }}
                disabled={submitting}
                onClick={confirmApprove}
              >
                {submitting ? 'Authorizing...' : 'Authorize & Extend Validity'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingId && (
        <div className="modal-overlay" onClick={() => setRejectingId(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 16 }}>Reject Renewal Request</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setRejectingId(null)}>
                <XCircle size={16} />
              </button>
            </div>
            <form onSubmit={handleRejectSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Please provide a reason for rejecting this renewal. The department owner will be notified to revise the terms or re-negotiate with the vendor.
                </p>
                <div className="form-group">
                  <label className="form-label">Rejection Reason *</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    required
                    placeholder="e.g. Budget exceeded for Q4, please negotiate 10% discount or reduce license seats"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setRejectingId(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger" disabled={submitting}>
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Approvals;
