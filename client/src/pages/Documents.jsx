import { useState, useEffect, useCallback, useRef } from 'react';
import { documentAPI } from '../api/services';
import { useAuth } from '../context/AuthContext';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { format, addDays, addMonths, addYears } from 'date-fns';
import {
  Plus, Search, Edit2, Trash2, Eye, X, FileText,
  UploadCloud, FileCheck, ExternalLink, RotateCw,
  Clock, Sparkles, CheckCircle2, Loader2, Brain, Archive, AlertTriangle
} from 'lucide-react';

const DOC_TYPES = ['Contract', 'License', 'Certification', 'Warranty', 'Insurance', 'Permit', 'Other'];
const STATUSES = ['Active', 'Expired', 'Expiring Soon', 'Renewed', 'Cancelled', 'Pending Approval'];
const DEPARTMENTS = ['Engineering', 'Marketing', 'Legal', 'HR', 'Finance', 'Operations', 'General'];

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

// AI provider brand info
const AI_PROVIDERS = {
  'OpenAI':       { color: '#10a37f', bg: 'rgba(16,163,127,0.12)', label: 'GPT-4o' },
  'Gemini':       { color: '#4285f4', bg: 'rgba(66,133,244,0.12)', label: 'Gemini 3.5 Flash' },
  'Grok':         { color: '#ffffff', bg: 'rgba(255,255,255,0.12)', label: 'xAI Grok' },
  'Claude':       { color: '#d97706', bg: 'rgba(217,119,6,0.12)',  label: 'Claude 3 Haiku' },
  'Groq':         { color: '#f97316', bg: 'rgba(249,115,22,0.12)',  label: 'Groq LLaMA 3.3' },
  'DeepSeek':     { color: '#0ea5e9', bg: 'rgba(14,165,233,0.12)', label: 'DeepSeek V3' },
  'Mistral':      { color: '#ec4899', bg: 'rgba(236,72,153,0.12)', label: 'Mistral AI' },
  'Regex (local)':{ color: '#818cf8', bg: 'rgba(129,140,248,0.12)', label: 'Local Regex Parser' },
};

const statusBadge = (status) => {
  const map = {
    Active: 'badge-active',
    Expired: 'badge-expired',
    'Expiring Soon': 'badge-expiring',
    Renewed: 'badge-renewed',
    Cancelled: 'badge-cancelled',
    'Pending Approval': 'badge-pending',
  };
  return `badge ${map[status] || 'badge-cancelled'}`;
};

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// ==========================================
// DOCUMENT MODAL — Smart Auto-Parse + Manual
// ==========================================
const DocumentModal = ({ doc, onClose, onSaved }) => {
  const isEdit = !!doc?._id;
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedFields, setParsedFields] = useState(null); // which fields were auto-filled
  const [aiProvider, setAiProvider]   = useState(null);   // which AI provider was used
  const [scanWarnings, setScanWarnings] = useState([]);   // providers that were skipped

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: doc ? {
      title: doc.title || '',
      type: doc.type || 'Contract',
      issuer: doc.issuer || '',
      issueDate: doc.issueDate ? format(new Date(doc.issueDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      expiryDate: doc.expiryDate ? format(new Date(doc.expiryDate), 'yyyy-MM-dd') : '',
      cost: doc.cost || 0,
      currency: doc.currency || 'INR',
      department: doc.department || 'General',
      reminderDays: doc.reminderDays || 30,
      tags: Array.isArray(doc.tags) ? doc.tags.join(', ') : (doc.tags || ''),
      description: doc.description || '',
      notes: doc.notes || '',
    } : {
      type: 'Contract',
      issueDate: format(new Date(), 'yyyy-MM-dd'),
      expiryDate: format(addYears(new Date(), 1), 'yyyy-MM-dd'),
      reminderDays: 30,
      cost: 0,
      currency: 'INR',
      department: 'General',
      tags: '',
      description: '',
      notes: '',
    },
  });

  const watchedExpiryDate = watch('expiryDate');
  const watchedIssueDate  = watch('issueDate');

  // Live renewal status preview
  const getLiveStatus = () => {
    if (!watchedExpiryDate) return null;
    const now    = new Date();
    const expiry = new Date(watchedExpiryDate);
    if (isNaN(expiry.getTime())) return null;
    const daysLeft = Math.ceil((expiry - now) / 86400000);
    if (daysLeft < 0)  return { label: `Expired ${Math.abs(daysLeft)} days ago`, color: '#f87171' };
    if (daysLeft <= 3) return { label: `Critical: ${daysLeft} days left`, color: '#f87171', days: daysLeft };
    if (daysLeft <= 7) return { label: `Urgent: ${daysLeft} days left`, color: '#fb923c', days: daysLeft };
    if (daysLeft <= 30) return { label: `Expiring Soon: ${daysLeft} days left`, color: '#fbbf24', days: daysLeft };
    return { label: `Active: ${daysLeft} days remaining`, color: '#34d399', days: daysLeft };
  };
  const liveStatus = getLiveStatus();

  const setQuickExpiry = (adder) => {
    const base = watchedIssueDate ? new Date(watchedIssueDate) : new Date();
    setValue('expiryDate', format(adder(base), 'yyyy-MM-dd'));
  };

  // ── AI scan on file selection ────────────────────────────
  const processFile = async (file) => {
    if (!file) return;
    setSelectedFile(file);
    setAiProvider(null);
    setScanWarnings([]);

    setIsParsing(true);
    toast.loading('🤖 AI scanning document…', { id: 'parsing' });

    try {
      const { data } = await documentAPI.aiScanFile(file);
      const p = data.parsed;
      setAiProvider(data.provider || 'Unknown');
      setScanWarnings(data.warnings || []);

      const setVal = (k, v) => setValue(k, v, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
      const filled = [];
      if (p.title)  { setVal('title', p.title);   filled.push('title'); }
      if (p.type) {
        const matched = DOC_TYPES.find(t => t.toLowerCase() === p.type.toLowerCase()) || 'Other';
        setVal('type', matched); filled.push('type');
      }
      if (p.issuer)     { setVal('issuer',     p.issuer);     filled.push('issuer'); }
      if (p.issueDate)  { setVal('issueDate',  p.issueDate);  filled.push('issueDate'); }
      if (p.expiryDate) { setVal('expiryDate', p.expiryDate); filled.push('expiryDate'); }
      if (p.cost != null && p.cost > 0) { setVal('cost', p.cost); filled.push('cost'); }
      if (p.currency) {
        const curList = ['INR', 'USD', 'EUR', 'GBP'];
        const matchedCur = curList.find(c => c.toLowerCase() === p.currency.toLowerCase()) || 'INR';
        setVal('currency', matchedCur);
      }
      if (p.reminderDays) { setVal('reminderDays', String(p.reminderDays)); }
      if (p.tags?.length) { setVal('tags', Array.isArray(p.tags) ? p.tags.join(', ') : p.tags); filled.push('tags'); }
      if (p.notes)       { setVal('notes',       p.notes);       filled.push('notes'); }
      if (p.description) { setVal('description', p.description); }

      setParsedFields(filled);
      const providerLabel = AI_PROVIDERS[data.provider]?.label || data.provider || 'AI';
      toast.success(`✨ ${filled.length} fields extracted via ${providerLabel}!`, { id: 'parsing', duration: 4000 });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'AI scan failed. Please fill manually.', { id: 'parsing' });
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const onSubmit = async (data) => {
    try {
      const fd = new FormData();
      fd.append('title',        data.title);
      fd.append('type',         data.type);
      fd.append('issuer',       data.issuer);
      fd.append('issueDate',    data.issueDate);
      fd.append('expiryDate',   data.expiryDate);
      fd.append('cost',         data.cost || 0);
      fd.append('currency',     data.currency || 'INR');
      fd.append('reminderDays', data.reminderDays || 30);
      fd.append('tags',         data.tags || '');
      fd.append('description',  data.description || '');
      fd.append('department',   data.department || 'General');
      fd.append('notes',        data.notes || '');
      if (selectedFile) fd.append('file', selectedFile);

      if (isEdit) {
        await documentAPI.update(doc._id, fd);
        toast.success('Document updated!');
      } else {
        await documentAPI.create(fd);
        toast.success('Document saved & renewal tracking started!');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save document');
    }
  };

  const isAutoFilled = (field) => parsedFields?.includes(field);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8' }}>
              {isEdit ? <Edit2 size={18} /> : <UploadCloud size={20} />}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 17 }}>
                {isEdit ? 'Edit Document' : 'Upload Document — Auto-Track Renewal'}
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                {isEdit
                  ? 'Update document details and renewal date'
                  : 'Upload a PDF — we\'ll auto-extract dates, issuer, cost & more'}
              </p>
            </div>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="modal-body">

            {/* ── SMART UPLOAD ZONE ────────────────────────── */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Brain size={14} color="#818cf8" />
                  Upload Document — AI extracts fields instantly
                </span>
                {doc?.attachmentUrl && !selectedFile && (
                  <a href={`${API_BASE_URL}${doc.attachmentUrl}`} target="_blank" rel="noreferrer" className="file-action-btn" style={{ fontSize: 11 }}>
                    <ExternalLink size={11} /> View Current File
                  </a>
                )}
              </label>

              {!selectedFile ? (
                <div
                  className={`file-dropzone ${isDragging ? 'dragging' : ''}`}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={handleFileChange} onClick={e => e.stopPropagation()} style={{ display: 'none' }} />
                  <div className="file-dropzone-icon"><UploadCloud size={24} /></div>
                  <h4>Click or Drag & Drop your Document here</h4>
                  <p style={{ color: '#818cf8', fontWeight: 600 }}>AI scans PDF, DOCX, TXT, PNG, JPG → extracts dates, cost & issuer</p>
                  <p style={{ marginTop: 4 }}>Fallback chain: <strong>Gemini → OpenAI → Grok → Claude → Local regex</strong></p>
                </div>
              ) : isParsing ? (
                /* ── AI Scanning skeleton ── */
                <div style={{ padding: '20px 24px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 10 }}>
                    <Brain size={24} color="#818cf8" style={{ animation: 'spin 2s linear infinite' }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#818cf8' }}>AI scanning document — trying providers…</span>
                  </div>
                  {/* Provider chain indicator */}
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                    {['Gemini', 'OpenAI', 'Grok', 'Claude', 'Local'].map((p, i) => (
                      <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(129,140,248,0.2)', color: '#818cf8', fontSize: 11, fontWeight: 700, border: '1px solid rgba(129,140,248,0.3)' }}>
                          {p}
                        </span>
                        {i < 4 && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>→</span>}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {['Title', 'Issuer', 'Issue Date', 'Expiry Date', 'Cost', 'Tags'].map(f => (
                      <span key={f} style={{ padding: '3px 10px', borderRadius: 6, background: 'rgba(129,140,248,0.15)', color: '#818cf8', fontSize: 12, fontWeight: 600 }}>
                        ◌ {f}
                      </span>
                    ))}
                  </div>
                  <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>Reading {selectedFile.name}…</p>
                </div>
              ) : (
                <div className="file-selected-box">
                  <div className="file-selected-info">
                    <FileCheck size={26} color="#34d399" />
                    <div>
                      <div className="filename">{selectedFile.name}</div>
                      <div className="filesize">
                        {formatFileSize(selectedFile.size)}
                        {parsedFields?.length > 0 && (
                          <span style={{ marginLeft: 8, color: '#34d399', fontWeight: 700 }}>
                            ✨ {parsedFields.length} fields extracted
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelectedFile(null); setParsedFields(null); setAiProvider(null); setScanWarnings([]); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                    Change File
                  </button>
                </div>
              )}
            </div>

            {/* ── AI-parsed banner ────────────────────────── */}
            {parsedFields?.length > 0 && !isParsing && (() => {
              const providerInfo = AI_PROVIDERS[aiProvider] || { color: '#818cf8', bg: 'rgba(129,140,248,0.12)', label: aiProvider || 'AI' };
              return (
                <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg, rgba(52,211,153,0.08), rgba(99,102,241,0.06))', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Sparkles size={18} color="#34d399" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#34d399', display: 'flex', alignItems: 'center', gap: 8 }}>
                        Auto-extracted from your document
                        {aiProvider && (
                          <span style={{ padding: '2px 8px', borderRadius: 12, background: providerInfo.bg, color: providerInfo.color, fontSize: 11, fontWeight: 700, border: `1px solid ${providerInfo.color}40` }}>
                            🤖 {providerInfo.label}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        Fields highlighted in green were detected automatically. Review and adjust as needed.
                      </div>
                    </div>
                  </div>
                  {/* Show skipped providers if any */}
                  {scanWarnings.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span>Fallback chain:</span>
                      {scanWarnings.map((w, i) => (
                        <span key={i} style={{ padding: '1px 6px', borderRadius: 8, background: 'rgba(248,113,113,0.1)', color: '#f87171', fontSize: 10 }}>
                          ✗ {w.split(':')[0]}
                        </span>
                      ))}
                      <span style={{ padding: '1px 6px', borderRadius: 8, background: providerInfo.bg, color: providerInfo.color, fontSize: 10 }}>
                        ✓ {providerInfo.label}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Live Renewal Preview ─────────────────────── */}
            {liveStatus && !isParsing && (
              <div className="renewal-tracker-preview" style={{ marginBottom: 14 }}>
                <div className="preview-left">
                  <Clock size={22} color={liveStatus.color} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: liveStatus.color }}>{liveStatus.label}</div>
                    <div className="preview-label">Renewal alerts trigger at 30, 14, 7, 3 & 1 days</div>
                  </div>
                </div>
                {liveStatus.days != null && (
                  <div style={{ fontSize: 26, fontWeight: 800, color: liveStatus.color }}>{liveStatus.days}d</div>
                )}
              </div>
            )}

            {/* ── FORM FIELDS ──────────────────────────────── */}
            {!isParsing && (
              <>
                {/* Title */}
                <div className="form-group">
                  <label className="form-label" style={{ color: isAutoFilled('title') ? '#34d399' : undefined }}>
                    {isAutoFilled('title') && <CheckCircle2 size={12} style={{ marginRight: 4 }} />}
                    Document / Contract Title *
                  </label>
                  <input
                    className="form-input"
                    style={{ borderColor: isAutoFilled('title') ? 'rgba(52,211,153,0.4)' : undefined }}
                    placeholder="e.g. AWS Cloud Hosting 2026, Office Lease Agreement"
                    {...register('title', { required: 'Title is required' })}
                  />
                  {errors.title && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.title.message}</p>}
                </div>

                {/* Type, Issuer & Department */}
                <div className="form-grid-3">
                  <div className="form-group">
                    <label className="form-label" style={{ color: isAutoFilled('type') ? '#34d399' : undefined }}>
                      {isAutoFilled('type') && <CheckCircle2 size={12} style={{ marginRight: 4 }} />}
                      Category / Type *
                    </label>
                    <select className="form-select" style={{ borderColor: isAutoFilled('type') ? 'rgba(52,211,153,0.4)' : undefined }} {...register('type', { required: true })}>
                      {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ color: isAutoFilled('issuer') ? '#34d399' : undefined }}>
                      {isAutoFilled('issuer') && <CheckCircle2 size={12} style={{ marginRight: 4 }} />}
                      Issuer / Vendor *
                    </label>
                    <input
                      className="form-input"
                      style={{ borderColor: isAutoFilled('issuer') ? 'rgba(52,211,153,0.4)' : undefined }}
                      placeholder="e.g. AWS, Adobe"
                      {...register('issuer', { required: 'Issuer is required' })}
                    />
                    {errors.issuer && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{errors.issuer.message}</p>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Owning Dept *
                    </label>
                    <select className="form-select" {...register('department', { required: true })}>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                {/* Dates */}
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label" style={{ color: isAutoFilled('issueDate') ? '#34d399' : undefined }}>
                      {isAutoFilled('issueDate') && <CheckCircle2 size={12} style={{ marginRight: 4 }} />}
                      Issue Date *
                    </label>
                    <input type="date" className="form-input" style={{ borderColor: isAutoFilled('issueDate') ? 'rgba(52,211,153,0.4)' : undefined }} {...register('issueDate', { required: 'Required' })} />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ color: isAutoFilled('expiryDate') ? '#34d399' : undefined, display: 'flex', justifyContent: 'space-between' }}>
                      <span>
                        {isAutoFilled('expiryDate') && <CheckCircle2 size={12} style={{ marginRight: 4 }} />}
                        Expiry / Renewal Date *
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>Quick shortcuts →</span>
                    </label>
                    <input type="date" className="form-input" style={{ borderColor: isAutoFilled('expiryDate') ? 'rgba(52,211,153,0.4)' : undefined }} {...register('expiryDate', { required: 'Required' })} />
                    <div className="quick-date-chips">
                      <span className="quick-chip" onClick={() => setQuickExpiry(d => addDays(d, 30))}>+30 Days</span>
                      <span className="quick-chip" onClick={() => setQuickExpiry(d => addMonths(d, 3))}>+3 Mo</span>
                      <span className="quick-chip" onClick={() => setQuickExpiry(d => addMonths(d, 6))}>+6 Mo</span>
                      <span className="quick-chip" onClick={() => setQuickExpiry(d => addYears(d, 1))}>+1 Year</span>
                      <span className="quick-chip" onClick={() => setQuickExpiry(d => addYears(d, 2))}>+2 Years</span>
                      <span className="quick-chip" onClick={() => setQuickExpiry(d => addYears(d, 3))}>+3 Years</span>
                    </div>
                  </div>
                </div>

                {/* Cost + Reminder */}
                <div className="form-grid-3">
                  <div className="form-group">
                    <label className="form-label" style={{ color: isAutoFilled('cost') ? '#34d399' : undefined }}>
                      {isAutoFilled('cost') && <CheckCircle2 size={12} style={{ marginRight: 4 }} />}
                      Amount / Cost
                    </label>
                    <input type="number" className="form-input" style={{ borderColor: isAutoFilled('cost') ? 'rgba(52,211,153,0.4)' : undefined }} placeholder="0" {...register('cost')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Currency</label>
                    <select className="form-select" {...register('currency')}>
                      {['INR', 'USD', 'EUR', 'GBP'].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Reminder Lead Time</label>
                    <select className="form-select" {...register('reminderDays')}>
                      <option value="7">7 days before</option>
                      <option value="15">15 days before</option>
                      <option value="30">30 days before</option>
                      <option value="60">60 days before</option>
                      <option value="90">90 days before</option>
                    </select>
                  </div>
                </div>

                {/* Tags */}
                <div className="form-group">
                  <label className="form-label" style={{ color: isAutoFilled('tags') ? '#34d399' : undefined }}>
                    {isAutoFilled('tags') && <CheckCircle2 size={12} style={{ marginRight: 4 }} />}
                    Tags (comma separated)
                  </label>
                  <input className="form-input" style={{ borderColor: isAutoFilled('tags') ? 'rgba(52,211,153,0.4)' : undefined }} placeholder="e.g. Finance, Legal, IT, HR" {...register('tags')} />
                </div>

                {/* Notes */}
                <div className="form-group">
                  <label className="form-label" style={{ color: isAutoFilled('notes') ? '#34d399' : undefined }}>
                    {isAutoFilled('notes') && <CheckCircle2 size={12} style={{ marginRight: 4 }} />}
                    Notes & Reference IDs
                  </label>
                  <textarea className="form-textarea" rows={2} placeholder="e.g. Transaction ID, applicant name, policy number" {...register('notes')} />
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea" rows={2} placeholder="Brief description of this document's purpose..." {...register('description')} />
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting || isParsing}>
              {isSubmitting ? <span className="loading-spinner" />
                : isParsing ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Parsing…</>
                : isEdit ? 'Update Document'
                : 'Save & Start Tracking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};




// ==========================================
// 2. QUICK RENEWAL MODAL
// ==========================================
const RenewModal = ({ doc, onClose, onSaved }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [newExpiryDate, setNewExpiryDate] = useState(
    format(addYears(new Date(doc.expiryDate > new Date() ? doc.expiryDate : new Date()), 1), 'yyyy-MM-dd')
  );
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
        toast.success('Renewal request submitted for Admin sign-off (≥ ₹10,000 threshold)!');
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
                <span className="quick-chip" onClick={() => setNewExpiryDate(format(addYears(new Date(doc.expiryDate), 1), 'yyyy-MM-dd'))}>+1 Year from Expiry</span>
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
                  ✓ Attached: {renewalFile.name} ({formatFileSize(renewalFile.size)})
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Renewal Justification & Notes</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="e.g. Renewing GitHub Enterprise for 15 seats at $3,500. Approved by Tech Lead."
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

// ==========================================
// 3. DOCUMENT DETAIL VIEW MODAL
// ==========================================
const DocumentDetailModal = ({ doc, onClose, onEdit, onRenew }) => {
  const daysLeft = doc.daysUntilExpiry ?? Math.ceil((new Date(doc.expiryDate) - new Date()) / 86400000);
  const dayColor = daysLeft <= 3 ? '#f87171' : daysLeft <= 7 ? '#fb923c' : daysLeft <= 30 ? '#fbbf24' : '#34d399';
  const hasFile = !!doc.attachmentUrl;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 660 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={20} color="#818cf8" />
            <h2 style={{ margin: 0, fontSize: 18 }}>Document Details</h2>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body">
          {/* Header Info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{doc.title}</h3>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                Issued by: <strong style={{ color: 'var(--text-primary)' }}>{doc.issuer}</strong> • Type: <strong style={{ color: 'var(--text-primary)' }}>{doc.type}</strong>
              </div>
            </div>
            <span className={statusBadge(doc.status)} style={{ fontSize: 13, padding: '4px 12px' }}>{doc.status}</span>
          </div>

          {/* Pending Approval Banner */}
          {doc.status === 'Pending Approval' && (
            <div style={{ padding: '12px 16px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fbbf24', fontSize: 13, fontWeight: 700 }}>
                <Clock size={16} />
                Renewal Pending Admin Sign-Off
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                A renewal request for <strong>{doc.currency || 'INR'} {doc.renewalRequest?.cost?.toLocaleString()}</strong> to extend until <strong>{doc.renewalRequest?.newExpiryDate ? format(new Date(doc.renewalRequest.newExpiryDate), 'dd MMM yyyy') : 'new date'}</strong> is currently in the Renewal Approval Queue.
              </div>
            </div>
          )}

          {/* Renewal Countdown Banner */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20
          }}>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Expiry & Renewal Tracking</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: dayColor, marginTop: 2 }}>
                {daysLeft > 0 ? `Valid for ${daysLeft} more days` : `Expired ${Math.abs(daysLeft)} days ago`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Expires on: <strong>{format(new Date(doc.expiryDate), 'PPP')}</strong>
              </div>
            </div>

            <button className="btn btn-primary btn-sm" onClick={() => { onClose(); onRenew(doc); }}>
              <RotateCw size={13} /> Quick Renew
            </button>
          </div>

          {/* Metadata Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
            <div style={{ padding: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Owning Department</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2, color: '#818cf8' }}>{doc.department || 'General'}</div>
            </div>
            <div style={{ padding: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Assigned Owner</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{doc.assignedTo?.name || 'Unassigned / Orphan'}</div>
            </div>
            <div style={{ padding: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Issue Date</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{format(new Date(doc.issueDate), 'dd MMM yyyy')}</div>
            </div>
            <div style={{ padding: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cost & Currency</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{doc.cost > 0 ? `${doc.currency} ${doc.cost.toLocaleString()}` : 'Free / Not specified'}</div>
            </div>
            <div style={{ padding: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Reminder Lead Time</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{doc.reminderDays || 30} days in advance</div>
            </div>
            <div style={{ padding: 10, background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last Renewal Date</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                {doc.renewalDate ? format(new Date(doc.renewalDate), 'dd MMM yyyy') : 'Never renewed'}
              </div>
            </div>
          </div>

          {/* Physical Document Attachment Box */}
          <div style={{
            background: hasFile ? 'rgba(99, 102, 241, 0.08)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${hasFile ? 'rgba(99, 102, 241, 0.3)' : 'var(--border)'}`,
            borderRadius: 8,
            padding: 14,
            marginBottom: 16
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: hasFile ? '#818cf8' : 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileCheck size={16} /> Attached Document File
            </div>

            {hasFile ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {doc.fileName || 'Uploaded_Document_Attachment'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {doc.fileSize ? formatFileSize(doc.fileSize) : ''} {doc.fileType ? `• ${doc.fileType}` : ''}
                  </div>
                </div>

                <a
                  href={`${API_BASE_URL}${doc.attachmentUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary btn-sm"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={13} /> Open / Download File
                </a>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                No physical file attached yet. You can attach a PDF, DOCX, or scan by clicking "Edit Document".
              </div>
            )}
          </div>

          {/* Tags */}
          {doc.tags?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Tags</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {doc.tags.map(tag => (
                  <span key={tag} style={{ background: 'rgba(79,70,229,0.15)', color: '#818cf8', padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description & Notes */}
          {doc.description && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Description</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{doc.description}</p>
            </div>
          )}

          {doc.notes && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Internal & Renewal Notes</div>
              <pre style={{ fontSize: 12, background: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0 }}>
                {doc.notes}
              </pre>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={() => { onClose(); onEdit(doc); }}>
            <Edit2 size={13} /> Edit Document
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 4. MAIN DOCUMENTS PAGE COMPONENT
// ==========================================
const Documents = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [docs, setDocs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [scope, setScope] = useState('all'); // 'all' or 'mine'
  const [showArchived, setShowArchived] = useState(false);

  // Modals state
  const [modal, setModal] = useState(null); // null | 'add' | doc object
  const [renewModalDoc, setRenewModalDoc] = useState(null); // null | doc object
  const [detailModalDoc, setDetailModalDoc] = useState(null); // null | doc object
  const [archiveDocConfirm, setArchiveDocConfirm] = useState(null);
  const [deleteDocConfirm, setDeleteDocConfirm] = useState(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        search,
        type: filterType,
        status: filterStatus,
        scope,
        archived: showArchived ? 'true' : 'false',
      };
      if (isAdmin && filterDept) {
        params.department = filterDept;
      }
      const { data } = await documentAPI.getAll(params);
      setDocs(data.documents);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterType, filterStatus, filterDept, scope, showArchived, isAdmin]);

  useEffect(() => {
    const timer = setTimeout(fetchDocs, 300);
    return () => clearTimeout(timer);
  }, [fetchDocs]);

  const executeArchive = async () => {
    if (!archiveDocConfirm) return;
    try {
      await documentAPI.archive(archiveDocConfirm._id);
      toast.success(`"${archiveDocConfirm.title}" archived successfully`);
      setArchiveDocConfirm(null);
      fetchDocs();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to archive document');
    }
  };

  const executeDelete = async () => {
    if (!deleteDocConfirm) return;
    try {
      await documentAPI.remove(deleteDocConfirm._id);
      toast.success(`"${deleteDocConfirm.title}" permanently purged from database`);
      setDeleteDocConfirm(null);
      fetchDocs();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete document');
    }
  };

  return (
    <div className="page-content">
      <div className="table-container">
        <div className="table-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <FileText size={20} color="#818cf8" />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0 }}>Contract & Document Inventory</h3>
                <span style={{ background: 'rgba(79,70,229,0.15)', color: '#818cf8', padding: '2px 8px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                  {total} tracked
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {isAdmin
                  ? 'Command Center • Global Company View (Cross-Department)'
                  : `Scoped Workspace • ${user?.department || 'General'} Department`}
              </div>
            </div>
          </div>

          <div className="table-filters" style={{ flexWrap: 'wrap' }}>
            <div className="search-wrap">
              <Search size={15} />
              <input
                className="form-input search-input"
                placeholder="Search title, issuer, tag..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            {/* Scope toggle */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', padding: 2, borderRadius: 8, border: '1px solid var(--border)' }}>
              <button
                type="button"
                className={`btn btn-sm ${scope === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => { setScope('all'); setPage(1); }}
              >
                {isAdmin ? 'All Org' : `${user?.department || 'Dept'}`}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${scope === 'mine' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => { setScope('mine'); setPage(1); }}
              >
                Assigned to Me
              </button>
            </div>

            {isAdmin && (
              <select className="form-select" style={{ width: 145 }} value={filterDept} onChange={e => { setFilterDept(e.target.value); setPage(1); }}>
                <option value="">All Departments</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}

            <select className="form-select" style={{ width: 125 }} value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}>
              <option value="">All Types</option>
              {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <select className="form-select" style={{ width: 135 }} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <button
              type="button"
              className={`btn btn-sm ${showArchived ? 'btn-secondary' : 'btn-ghost'}`}
              style={{ fontSize: 12, border: '1px solid var(--border)' }}
              onClick={() => { setShowArchived(!showArchived); setPage(1); }}
              title="Toggle archived contracts"
            >
              <Archive size={13} /> {showArchived ? 'Hide Archives' : 'Archives'}
            </button>

            <button className="btn btn-primary btn-sm" onClick={() => setModal('add')}>
              <Plus size={14} /> Upload / Add
            </button>
          </div>
        </div>

        {loading ? (
          <div className="page-loader" style={{ height: 220 }}>
            <div className="loading-spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          </div>
        ) : docs.length === 0 ? (
          <div className="empty-state">
            <UploadCloud size={48} color="#818cf8" />
            <h3>No documents found</h3>
            <p>
              {showArchived
                ? 'No archived documents in this view.'
                : isAdmin
                  ? 'No documents found across company records. Add a document to get started.'
                  : `No documents found in your ${user?.department || 'General'} department workspace.`}
            </p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setModal('add')}>
              <Plus size={14} /> Upload Document
            </button>
          </div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Title & Tags</th>
                  <th>Department</th>
                  <th>Attached File</th>
                  <th>Type</th>
                  <th>Issuer</th>
                  <th>Expiry Date</th>
                  <th>Renewal Countdown</th>
                  <th>Status</th>
                  <th>Cost</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map(doc => {
                  const daysLeft = doc.daysUntilExpiry ?? Math.ceil((new Date(doc.expiryDate) - new Date()) / 86400000);
                  const dayColor = daysLeft < 0 ? 'var(--danger)' : daysLeft <= 3 ? 'var(--danger)' : daysLeft <= 7 ? 'var(--warning)' : daysLeft <= 30 ? '#d97706' : 'var(--success)';
                  const hasFile = !!doc.attachmentUrl;

                  return (
                    <tr key={doc._id} style={{ opacity: doc.isArchived ? 0.65 : 1 }}>
                      {/* Title & Tags */}
                      <td>
                        <div
                          className="td-title"
                          style={{ cursor: 'pointer', color: 'var(--text-primary)' }}
                          onClick={() => setDetailModalDoc(doc)}
                          title="Click to view details"
                        >
                          {doc.title}
                          {doc.isArchived && (
                            <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>
                              Archived
                            </span>
                          )}
                        </div>
                        {doc.tags?.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                            {doc.tags.map(tag => (
                              <span key={tag} style={{ background: 'rgba(79,70,229,0.1)', color: '#818cf8', padding: '1px 6px', borderRadius: 10, fontSize: 11 }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Department */}
                      <td>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid var(--border)',
                          fontSize: 12,
                          fontWeight: 500,
                          color: 'var(--text-secondary)'
                        }}>
                          {doc.department || 'General'}
                        </span>
                      </td>

                      {/* File Attachment */}
                      <td>
                        {hasFile ? (
                          <a
                            href={`${API_BASE_URL}${doc.attachmentUrl}`}
                            target="_blank"
                            rel="noreferrer"
                            className="file-action-btn"
                            title={`Open ${doc.fileName || 'file'}`}
                          >
                            <ExternalLink size={12} />
                            <span>{doc.fileName ? (doc.fileName.length > 16 ? doc.fileName.slice(0, 14) + '...' : doc.fileName) : 'View File'}</span>
                          </a>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No file</span>
                        )}
                      </td>

                      {/* Type */}
                      <td><span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{doc.type}</span></td>

                      {/* Issuer */}
                      <td className="td-muted">{doc.issuer}</td>

                      {/* Expiry Date */}
                      <td className="td-muted">{format(new Date(doc.expiryDate), 'dd MMM yyyy')}</td>

                      {/* Days Left / Countdown */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: dayColor, fontWeight: 800, fontSize: 14 }}>
                            {daysLeft > 0 ? `${daysLeft} days` : `${Math.abs(daysLeft)} days expired`}
                          </span>
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td><span className={statusBadge(doc.status)}>{doc.status}</span></td>

                      {/* Cost */}
                      <td className="td-muted">{doc.cost > 0 ? `${doc.currency} ${doc.cost.toLocaleString()}` : '—'}</td>

                      {/* Action buttons */}
                      <td>
                        <div className="table-actions">
                          <button
                            className="btn btn-secondary btn-icon btn-sm"
                            title="View Full Details"
                            onClick={() => setDetailModalDoc(doc)}
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            className="btn btn-secondary btn-icon btn-sm"
                            style={{ color: '#34d399' }}
                            title="Renew Contract"
                            onClick={() => setRenewModalDoc(doc)}
                          >
                            <RotateCw size={13} />
                          </button>
                          <button
                            className="btn btn-secondary btn-icon btn-sm"
                            title="Edit Document"
                            onClick={() => setModal(doc)}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            className="btn btn-secondary btn-icon btn-sm"
                            title="Archive Contract (Move to inactive records)"
                            onClick={() => setArchiveDocConfirm(doc)}
                          >
                            <Archive size={13} />
                          </button>
                          {isAdmin ? (
                            <button
                              className="btn btn-danger btn-icon btn-sm"
                              title="Permanent Purge (Admin Only — Forensic audit logged)"
                              onClick={() => setDeleteDocConfirm(doc)}
                            >
                              <Trash2 size={13} />
                            </button>
                          ) : (
                            <span
                              title="Only Compliance Admins can permanently purge records (Compliance Rule)"
                              style={{ display: 'inline-flex', alignItems: 'center', opacity: 0.3, cursor: 'not-allowed', padding: 4 }}
                            >
                              <Trash2 size={13} />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {pages > 1 && (
              <div className="pagination">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
                  <button key={p} className={`page-btn ${page === p ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
                ))}
                <button className="page-btn" disabled={page === pages} onClick={() => setPage(p => p + 1)}>›</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modal && (
        <DocumentModal
          key={modal === 'add' ? 'add' : (modal?._id || 'doc')}
          doc={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={fetchDocs}
        />
      )}

      {/* Quick Renew Modal */}
      {renewModalDoc && (
        <RenewModal
          doc={renewModalDoc}
          onClose={() => setRenewModalDoc(null)}
          onSaved={fetchDocs}
        />
      )}

      {/* Detail View Modal */}
      {detailModalDoc && (
        <DocumentDetailModal
          doc={detailModalDoc}
          onClose={() => setDetailModalDoc(null)}
          onEdit={(d) => setModal(d)}
          onRenew={(d) => setRenewModalDoc(d)}
        />
      )}

      {/* In-App Archive Confirmation Modal */}
      {archiveDocConfirm && (
        <div className="modal-overlay" onClick={() => setArchiveDocConfirm(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Archive size={18} color="var(--text-secondary)" />
                </div>
                <h2 style={{ fontSize: 16 }}>Archive Contract</h2>
              </div>
              <button className="btn btn-secondary btn-icon" onClick={() => setArchiveDocConfirm(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Are you sure you want to archive <strong>"{archiveDocConfirm.title}"</strong>?
              </p>
              <div style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                This will move the document out of active inventory into the historical archive. Its renewal alerts will be paused.
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setArchiveDocConfirm(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={executeArchive}>
                Confirm Archival
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Permanent Delete Confirmation Modal (Admin Compliance) */}
      {deleteDocConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteDocConfirm(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--danger-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}>
                  <Trash2 size={18} />
                </div>
                <h2 style={{ fontSize: 16 }}>Permanent Record Purge</h2>
              </div>
              <button className="btn btn-secondary btn-icon" onClick={() => setDeleteDocConfirm(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ padding: '10px 14px', background: 'var(--danger-subtle)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 6, color: 'var(--danger)', fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>
                ⚠️ High-Risk Action · Permanent Database Erasure
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                You are about to permanently purge:
              </p>
              <div style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{deleteDocConfirm.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Issuer: {deleteDocConfirm.issuer} · Dept: {deleteDocConfirm.department || 'General'}
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                This record and any attachments will be irrevocably deleted. This action is reserved solely for Administrators and is recorded in the Forensic Audit Trail.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteDocConfirm(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={executeDelete}>
                Permanently Purge Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Documents;
