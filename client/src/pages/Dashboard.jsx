import { useState, useEffect } from 'react';
import { documentAPI, adminAPI } from '../api/services';
import { useAuth } from '../context/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  FileText, Shield, AlertTriangle, XCircle, Plus, TrendingUp,
  ShieldCheck, ArrowRight, Filter, AlertOctagon, UserCheck, RefreshCw,
  Clock, CheckCircle, ChevronRight, Users, Activity
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const TYPE_PALETTE = {
  Contract: '#2563eb',       // Blue
  License: '#0ea5e9',        // Sky
  Insurance: '#6366f1',      // Indigo
  Permit: '#8b5cf6',         // Violet
  Warranty: '#14b8a6',       // Teal
  Certification: '#f59e0b',  // Amber
  Other: '#64748b',          // Slate
};

const FALLBACK_PALETTE = ['#2563eb', '#0ea5e9', '#6366f1', '#14b8a6', '#8b5cf6', '#f59e0b', '#64748b'];

const CustomBarTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: '#0f172a',
        color: '#ffffff',
        padding: '7px 12px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ opacity: 0.7, fontSize: 11, marginBottom: 2 }}>{label}</div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          {payload[0].value} {payload[0].value === 1 ? 'document' : 'documents'} added
        </div>
      </div>
    );
  }
  return null;
};

const Dashboard = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [adminStats, setAdminStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filter states for Command Center
  const [selectedDept, setSelectedDept] = useState('All');
  const [viewScope, setViewScope] = useState('all'); // 'all' vs 'my'

  // Reassignment Modal state
  const [reassignDoc, setReassignDoc] = useState(null);
  const [userList, setUserList] = useState([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [reassigning, setReassigning] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const params = {};
      if (isAdmin) {
        if (viewScope === 'my') {
          params.scope = 'my';
        } else if (selectedDept !== 'All') {
          params.department = selectedDept;
        }
      }

      const docStatsPromise = documentAPI.getStats(params);
      const adminStatsPromise = isAdmin
        ? adminAPI.getStats().catch(err => {
            console.warn('Admin stats could not be loaded:', err?.response?.data?.message || err?.message);
            return { data: null };
          })
        : Promise.resolve({ data: null });

      const [docRes, admRes] = await Promise.all([docStatsPromise, adminStatsPromise]);
      if (docRes?.data) {
        setStats(docRes.data);
      }
      if (admRes?.data?.stats) {
        setAdminStats(admRes.data.stats);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      toast.error(err?.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [selectedDept, viewScope, isAdmin]);

  const openReassignModal = async (doc) => {
    setReassignDoc(doc);
    try {
      const { data } = await adminAPI.getUsers();
      setUserList(data.users || []);
      if (data.users?.length > 0) {
        setTargetUserId(data.users[0]._id);
      }
    } catch {
      toast.error('Failed to load user directory');
    }
  };

  const handleReassignSubmit = async (e) => {
    e.preventDefault();
    if (!targetUserId) {
      toast.error('Please select an active team member');
      return;
    }
    setReassigning(true);
    try {
      const { data } = await adminAPI.reassignDocument(reassignDoc._id, targetUserId);
      toast.success(data.message || 'Document reassigned successfully');
      setReassignDoc(null);
      fetchDashboardData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reassign document');
    } finally {
      setReassigning(false);
    }
  };

  const getStatusBadge = (status) => {
    const map = {
      Active: 'badge-active',
      Expired: 'badge-expired',
      'Expiring Soon': 'badge-expiring',
      Renewed: 'badge-renewed',
      Cancelled: 'badge-cancelled',
      'Pending Approval': 'badge-expiring',
    };
    return `badge ${map[status] || 'badge-cancelled'}`;
  };

  const getDaysColor = (days) => {
    if (days <= 7) return 'var(--danger)';
    if (days <= 14) return 'var(--warning)';
    return 'var(--accent)';
  };

  // Trailing 6 months bar chart data
  const trendData = (() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const monthName = d.toLocaleString('default', { month: 'short' });
      const found = stats?.trend?.find(t => t._id.year === year && t._id.month === month);
      months.push({
        name: monthName,
        count: found ? found.count : 0,
      });
    }
    return months;
  })();

  const pieData = stats?.byType?.map((t, idx) => ({
    name: t._id || 'Unspecified',
    value: t.count,
    color: TYPE_PALETTE[t._id] || FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length],
  })) || [];

  const totalPieCount = pieData.reduce((acc, curr) => acc + curr.value, 0);

  if (loading && !stats) {
    return (
      <div className="page-loader">
        <div style={{ textAlign: 'center' }}>
          <div className="loading-spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const health = adminStats?.complianceHealthScore || { score: 100, grade: 'A', status: 'Excellent', color: '#16a34a' };

  return (
    <div className="page-content">

      {/* Header Banner */}
      <div className="dashboard-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 className="dashboard-title">
              {isAdmin ? 'Organization Command Center' : `${user?.department || 'Department'} Workspace`}
            </h2>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 20,
                background: isAdmin ? 'rgba(79, 70, 229, 0.12)' : 'rgba(22, 163, 74, 0.1)',
                color: isAdmin ? '#4f46e5' : '#16a34a',
                letterSpacing: '0.03em',
              }}
            >
              {isAdmin ? 'ADMIN CONTROL' : `DEPARTMENT: ${user?.department || 'GENERAL'}`}
            </span>
          </div>
          <p className="dashboard-subtitle">
            {isAdmin
              ? 'Global compliance oversight, department renewal budgets, and audit risk monitoring.'
              : `Managing active agreements, licenses, and renewal deadlines for the ${user?.department || 'assigned'} team.`}
          </p>
        </div>

        <div className="dashboard-actions">
          {isAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Scope Switcher */}
              <select
                className="form-select"
                style={{ height: 34, fontSize: 12.5, width: 'auto', padding: '0 28px 0 10px' }}
                value={viewScope}
                onChange={e => setViewScope(e.target.value)}
              >
                <option value="all">Company-Wide View</option>
                <option value="my">My Documents Only</option>
              </select>

              {/* Department Filter */}
              {viewScope === 'all' && (
                <select
                  className="form-select"
                  style={{ height: 34, fontSize: 12.5, width: 'auto', padding: '0 28px 0 10px' }}
                  value={selectedDept}
                  onChange={e => setSelectedDept(e.target.value)}
                >
                  <option value="All">All Departments</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Legal">Legal</option>
                  <option value="HR">HR</option>
                  <option value="Finance">Finance</option>
                  <option value="Operations">Operations</option>
                </select>
              )}
            </div>
          )}

          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/documents')}>
            <FileText size={13} /> Inventory
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/documents?action=new')}>
            <Plus size={13} /> Add Document
          </button>
        </div>
      </div>

      {/* Admin Command Center Widgets (Health Score & Pending Approvals) */}
      {isAdmin && adminStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
          {/* Compliance Health Score Card */}
          <div className="card" style={{ padding: '20px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Compliance Health Score
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 34, fontWeight: 800, color: health.color, lineHeight: 1 }}>
                  {health.score}%
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: health.color }}>
                  Grade {health.grade} · {health.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                Based on expired contracts, upcoming exposure, and active ownership.
              </div>
            </div>

            <div style={{
              width: 58, height: 58, borderRadius: '50%', border: `3px solid ${health.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <Activity size={24} color={health.color} />
            </div>
          </div>

          {/* Pending Governance Approvals Alert Card */}
          <div
            className="card"
            style={{
              padding: '20px 22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              cursor: 'pointer',
              borderLeft: adminStats.pendingApprovals > 0 ? '4px solid var(--warning)' : undefined
            }}
            onClick={() => navigate('/approvals')}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Two-Step Governance Queue
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: adminStats.pendingApprovals > 0 ? 'var(--warning)' : 'var(--text-primary)', lineHeight: 1 }}>
                  {adminStats.pendingApprovals}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Pending Sign-Off{adminStats.pendingApprovals !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                {adminStats.pendingApprovals > 0
                  ? 'Expenditure >₹10,000 awaiting your authorization.'
                  : 'All renewal requests reviewed and authorized.'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontSize: 13, fontWeight: 600 }}>
              Queue <ArrowRight size={14} />
            </div>
          </div>
        </div>
      )}

      {/* Orphan Documents Alert Widget (Admin Only) */}
      {isAdmin && adminStats?.orphanCount > 0 && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.06)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', flexShrink: 0 }}>
              <AlertOctagon size={20} />
            </div>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                {adminStats.orphanCount} Orphan Contract{adminStats.orphanCount !== 1 ? 's' : ''} Detected
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                Owner is unassigned, deactivated, or inactive for &gt;60 days. Risk of missed renewals.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {adminStats.orphans?.[0] && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => openReassignModal(adminStats.orphans[0])}
                style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              >
                <UserCheck size={13} /> Reassign "{adminStats.orphans[0].title.slice(0, 20)}..."
              </button>
            )}
          </div>
        </div>
      )}

      {/* KPI Stat Cards */}
      <div className="stats-grid">
        <div className="stat-card" onClick={() => navigate('/documents')}>
          <div className="stat-card-header">
            <span className="stat-card-label">Total Documents</span>
            <span className="stat-card-icon icon-blue">
              <FileText size={16} />
            </span>
          </div>
          <div>
            <div className="stat-card-value">{stats?.stats?.total ?? 0}</div>
            <div className="stat-card-meta">
              <span className="status-dot dot-blue" />
              {isAdmin && viewScope === 'all' ? 'All company departments' : `${user?.department || 'Personal'} workspace`}
            </div>
          </div>
        </div>

        <div className="stat-card" onClick={() => navigate('/documents?status=Active')}>
          <div className="stat-card-header">
            <span className="stat-card-label">Active Documents</span>
            <span className="stat-card-icon icon-green">
              <Shield size={16} />
            </span>
          </div>
          <div>
            <div className="stat-card-value">{stats?.stats?.active ?? 0}</div>
            <div className="stat-card-meta">
              <span className="status-dot dot-green" />
              In good standing & compliant
            </div>
          </div>
        </div>

        <div className="stat-card" onClick={() => navigate('/alerts')}>
          <div className="stat-card-header">
            <span className="stat-card-label">Expiring Soon</span>
            <span className="stat-card-icon icon-amber">
              <AlertTriangle size={16} />
            </span>
          </div>
          <div>
            <div className="stat-card-value">{stats?.stats?.expiringSoon ?? 0}</div>
            <div className="stat-card-meta">
              <span className="status-dot dot-amber" />
              Due within next 30 days
            </div>
          </div>
        </div>

        <div className="stat-card" onClick={() => navigate('/alerts')}>
          <div className="stat-card-header">
            <span className="stat-card-label">Expired</span>
            <span className="stat-card-icon icon-red">
              <XCircle size={16} />
            </span>
          </div>
          <div>
            <div className="stat-card-value">{stats?.stats?.expired ?? 0}</div>
            <div className="stat-card-meta">
              <span className="status-dot dot-red" />
              Action needed immediately
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Left: Monthly Trend */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <div className="chart-card-title">
                <TrendingUp size={15} color="var(--accent)" />
                Documents Added
              </div>
              <div className="chart-card-subtitle">Monthly creation trend over the last 6 months</div>
            </div>
            <span className="chart-badge">Trailing 6M</span>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={trendData} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomBarTooltip />} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Right: Category Distribution */}
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <div className="chart-card-title">
                <FileText size={15} color="var(--accent)" />
                Documents by Category
              </div>
              <div className="chart-card-subtitle">Distribution across contract & license types</div>
            </div>
            <span className="chart-badge">{pieData.length} Types</span>
          </div>

          {pieData.length > 0 ? (
            <div className="pie-chart-wrapper">
              <div className="pie-chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={54}
                      outerRadius={76}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: '#0f172a',
                        border: 'none',
                        borderRadius: 6,
                        color: '#ffffff',
                        fontSize: 12,
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                      }}
                      itemStyle={{ color: '#ffffff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pie-chart-center">
                  <div className="pie-chart-center-val">{totalPieCount}</div>
                  <div className="pie-chart-center-lbl">Total</div>
                </div>
              </div>

              <div className="pie-legend-grid">
                {pieData.map((item) => {
                  const pct = totalPieCount > 0 ? Math.round((item.value / totalPieCount) * 100) : 0;
                  return (
                    <div key={item.name} className="pie-legend-row">
                      <div className="pie-legend-left">
                        <span className="pie-legend-dot" style={{ background: item.color }} />
                        <span className="pie-legend-label" title={item.name}>{item.name}</span>
                      </div>
                      <div className="pie-legend-right">
                        <span className="pie-legend-count">{item.value}</span>
                        <span className="pie-legend-pct">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 40 }}>
              <p>No documents categorized yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Renewals */}
      <div className="card">
        <div className="section-header" style={{ marginBottom: 18 }}>
          <div>
            <h3 className="section-title">Upcoming Renewals</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
              Contracts, permits, and licenses requiring renewal in the next 30 days
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/documents')}>
              View All Documents
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/documents?action=new')}>
              <Plus size={13} /> Add Document
            </button>
          </div>
        </div>

        {stats?.upcoming?.length > 0 ? (
          <div className="upcoming-list">
            {stats.upcoming.map((doc) => {
              const expDate = doc.expiryDate ? new Date(doc.expiryDate) : null;
              const isValid = expDate && !isNaN(expDate.getTime());
              const days = isValid ? differenceInDays(expDate, new Date()) : 0;
              const color = getDaysColor(days);
              return (
                <div key={doc._id} className="upcoming-item">
                  <div className="upcoming-days">
                    <div className="days-num" style={{ color }}>{Math.abs(days)}</div>
                    <div className="days-label">{days < 0 ? 'days expired' : days === 0 ? 'due today' : 'days left'}</div>
                  </div>
                  <div className="upcoming-info">
                    <div className="title">{doc.title}</div>
                    <div className="meta">
                      {doc.type} · {doc.issuer} {doc.department && `· ${doc.department}`}
                    </div>
                  </div>
                  <div>
                    <span className={getStatusBadge(doc.status)}>{doc.status}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {isValid ? format(expDate, 'dd MMM yyyy') : 'No date'}
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => navigate('/documents')}
                    style={{ padding: '4px 10px', fontSize: 12 }}
                  >
                    View <ArrowRight size={12} style={{ marginLeft: 3 }} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-renewal-state">
            <div className="empty-renewal-icon">
              <ShieldCheck size={22} />
            </div>
            <h4 className="empty-renewal-title">All documents are up to date</h4>
            <p className="empty-renewal-desc">
              No contracts, licenses, or warranties are due for renewal in the next 30 days. You will receive automated alerts when thresholds are reached.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate('/documents')}>
                Browse Inventory
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/documents?action=new')}>
                <Plus size={13} /> New Document
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reassign Orphan Document Modal */}
      {reassignDoc && (
        <div className="modal-overlay" onClick={() => setReassignDoc(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <UserCheck size={18} color="var(--primary)" />
                <h2 style={{ fontSize: 16 }}>Reassign Orphan Contract</h2>
              </div>
              <button className="btn btn-secondary btn-icon" onClick={() => setReassignDoc(null)}>
                <XCircle size={16} />
              </button>
            </div>
            <form onSubmit={handleReassignSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
                  Reassign <strong>"{reassignDoc.title}"</strong> to an active team member to ensure continuous renewal ownership.
                </p>

                <div className="form-group">
                  <label className="form-label">Select Successor / New Owner *</label>
                  <select
                    className="form-select"
                    required
                    value={targetUserId}
                    onChange={e => setTargetUserId(e.target.value)}
                  >
                    {userList.map(u => (
                      <option key={u._id} value={u._id}>
                        {u.name} ({u.email}) — {u.department || 'General'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setReassignDoc(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={reassigning}>
                  {reassigning ? 'Reassigning...' : 'Confirm Reassignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
