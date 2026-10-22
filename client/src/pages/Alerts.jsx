import { useState, useEffect } from 'react';
import { documentAPI } from '../api/services';
import { useAuth } from '../context/AuthContext';
import { format, differenceInDays, addMonths, addYears } from 'date-fns';
import {
  Bell, AlertTriangle, XCircle, Clock, CheckCircle, ExternalLink,
  RotateCw, X
} from 'lucide-react';
import toast from 'react-hot-toast';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

const RenewModal = ({ doc, onClose, onSaved }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [newExpiryDate, setNewExpiryDate] = useState(() => {
    const baseDate = doc?.expiryDate && new Date(doc.expiryDate) > new Date() ? new Date(doc.expiryDate) : new Date();
    return format(addYears(baseDate, 1), 'yyyy-MM-dd');
  });
  const [cost, setCost] = useState(doc.cost || 0);
  const [notes, setNotes] = useState('');
  const [renewalFile, setRenewalFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const numCost = Number(cost) || 0;
  const requiresApproval = !isAdmin && numCost >= 10000;

  const handleRenewSubmit = async (e) => {
    e.preventDefault();
    if (!newExpiryDate) {
      toast.error('Please specify a new expiry date');
      return;
    }
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('newExpiryDate', newExpiryDate);
      formData.append('cost', cost);
      formData.append('notes', notes);
      if (renewalFile) {
        formData.append('file', renewalFile);
      }

      const res = await documentAPI.renew(doc._id, formData);
      if (res.data?.requiresApproval) {
        toast.success('Renewal request submitted for Admin review (≥ ₹10,000 threshold)!');
      } else {
        toast.success(`"${doc.title}" renewed successfully!`);
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to renew document');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(52, 211, 153, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399' }}>
              <RotateCw size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 17 }}>
                {requiresApproval ? 'Submit Renewal Request' : 'Renew Contract / Document'}
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                {requiresApproval ? 'Two-step approval required for requests ≥ ₹10,000' : 'Extend validity and update renewal terms'}
              </p>
            </div>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleRenewSubmit}>
          <div className="modal-body">
            {requiresApproval && (
              <div style={{ padding: '12px 14px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fbbf24', fontSize: 13, fontWeight: 700 }}>
                  <AlertTriangle size={15} />
                  Two-Step Renewal Governance Active
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Costs at or above ₹10,000 / $500 require Compliance & Finance Officer sign-off. This request will be placed in the <strong>Renewal Approval Queue</strong> for review.
                </p>
              </div>
            )}

            <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{doc.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 16 }}>
                <span>Issuer: <strong>{doc.issuer}</strong></span>
                <span>Current Expiry: <strong>{format(new Date(doc.expiryDate), 'dd MMM yyyy')}</strong></span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>New Expiry / Renewal Date *</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Quick extensions</span>
              </label>
              <input
                type="date"
                className="form-input"
                required
                value={newExpiryDate}
                onChange={e => setNewExpiryDate(e.target.value)}
              />
              <div className="quick-date-chips" style={{ marginTop: 6 }}>
                <span className="quick-chip" onClick={() => setNewExpiryDate(format(addMonths(new Date(), 6), 'yyyy-MM-dd'))}>+6 Months</span>
                <span className="quick-chip" onClick={() => setNewExpiryDate(format(addYears(new Date(), 1), 'yyyy-MM-dd'))}>+1 Year from Today</span>
                <span className="quick-chip" onClick={() => setNewExpiryDate(format(addYears(new Date(), 2), 'yyyy-MM-dd'))}>+2 Years</span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Renewal Cost ({doc.currency || 'INR'})</span>
                {numCost >= 10000 && (
                  <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 600 }}>
                    ⚠️ Requires Admin Sign-Off (≥ ₹10,000)
                  </span>
                )}
              </label>
              <input
                type="number"
                className="form-input"
                value={cost}
                onChange={e => setCost(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Upload New Renewed Document / Invoice (Quote)</label>
              <input
                type="file"
                className="form-input"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={e => setRenewalFile(e.target.files?.[0] || null)}
              />
              {renewalFile && (
                <div style={{ fontSize: 12, color: '#34d399', marginTop: 4 }}>
                  ✓ Attached: {renewalFile.name}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Renewal Justification & Notes</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="e.g. Renewed terms, PO number, justification"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="loading-spinner" />
              ) : requiresApproval ? (
                'Submit Renewal Request'
              ) : (
                'Confirm Renewal'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const Alerts = () => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [renewDoc, setRenewDoc] = useState(null);

  const fetchAlerts = async () => {
    try {
      const [expiring, expired] = await Promise.all([
        documentAPI.getAll({ status: 'Expiring Soon', limit: 50 }),
        documentAPI.getAll({ status: 'Expired', limit: 20 }),
      ]);
      setDocs([...expiring.data.documents, ...expired.data.documents]);
    } catch {
      toast.error('Failed to load alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const getAlertLevel = (days, status) => {
    if (status === 'Expired' || days < 0) return { label: 'EXPIRED', color: '#f87171', bg: 'rgba(220,38,38,0.1)', icon: XCircle };
    if (days === 0) return { label: 'EXPIRING TODAY', color: '#f87171', bg: 'rgba(220,38,38,0.08)', icon: AlertTriangle };
    if (days <= 7) return { label: 'CRITICAL', color: '#f87171', bg: 'rgba(220,38,38,0.08)', icon: XCircle };
    if (days <= 14) return { label: 'URGENT', color: '#fbbf24', bg: 'rgba(217,119,6,0.08)', icon: AlertTriangle };
    return { label: 'UPCOMING', color: '#818cf8', bg: 'rgba(79,70,229,0.08)', icon: Clock };
  };

  if (loading) {
    return <div className="page-loader"><div className="loading-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} /></div>;
  }

  return (
    <div className="page-content">
      <div className="card" style={{ marginBottom: 24, background: 'linear-gradient(135deg, rgba(79,70,229,0.12), rgba(124,58,237,0.08))', border: '1px solid rgba(79,70,229,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, background: 'rgba(79,70,229,0.2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bell size={22} color="#818cf8" />
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Renewal Alerts & Expiry Monitoring</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2, margin: 0 }}>
              {docs.length} document{docs.length !== 1 ? 's' : ''} require attention. Automated reminders trigger at 30, 14, 7, 3, and 1 day thresholds.
            </p>
          </div>
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="empty-state" style={{ padding: 80 }}>
          <CheckCircle size={56} color="#4ade80" style={{ opacity: 1 }} />
          <h3 style={{ color: '#4ade80' }}>All clear!</h3>
          <p>No documents expiring soon. Great job staying on top of renewals!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {docs.map((doc) => {
            const expDate = doc.expiryDate ? new Date(doc.expiryDate) : null;
            const isValid = expDate && !isNaN(expDate.getTime());
            const days = isValid ? differenceInDays(expDate, new Date()) : 0;
            const isExpired = doc.status === 'Expired' || days < 0;
            const alert = getAlertLevel(days, doc.status);
            const Icon = alert.icon;
            const hasFile = !!doc.attachmentUrl;

            return (
              <div key={doc._id} style={{
                background: alert.bg,
                border: `1px solid ${alert.color}30`,
                borderRadius: 'var(--radius)',
                padding: '18px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 16,
                transition: 'var(--transition)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 280, flex: 1 }}>
                  <div style={{ width: 44, height: 44, background: `${alert.color}20`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={20} color={alert.color} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{doc.title}</span>
                      <span style={{ background: `${alert.color}25`, color: alert.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{alert.label}</span>
                      {hasFile && (
                        <a
                          href={`${API_BASE_URL}${doc.attachmentUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="file-action-btn"
                          style={{ fontSize: 11, padding: '2px 8px' }}
                        >
                          <ExternalLink size={10} /> View Attached File
                        </a>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {doc.type} · {doc.issuer} · {isExpired ? 'Expired' : 'Expires'}: <strong style={{ color: alert.color }}>{isValid ? format(expDate, 'dd MMMM yyyy') : 'No date'}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ background: 'rgba(52, 211, 153, 0.15)', borderColor: '#34d399', color: '#34d399' }}
                    onClick={() => setRenewDoc(doc)}
                  >
                    <RotateCw size={13} /> Renew Now
                  </button>

                  <div style={{ textAlign: 'right', minWidth: 92 }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: alert.color, lineHeight: 1 }}>
                      {Math.abs(days)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', marginTop: 4 }}>
                      {isExpired ? (days === 0 ? 'expired today' : 'days expired') : (days === 0 ? 'expires today' : 'days left')}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {renewDoc && (
        <RenewModal
          doc={renewDoc}
          onClose={() => setRenewDoc(null)}
          onSaved={fetchAlerts}
        />
      )}
    </div>
  );
};

export default Alerts;
