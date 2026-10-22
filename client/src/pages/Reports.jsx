import { useState } from 'react';
import { reportAPI } from '../api/services';
import toast from 'react-hot-toast';
import { FileText, Table, Download, BarChart2, CheckCircle } from 'lucide-react';

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const Reports = () => {
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [loadingExcel, setLoadingExcel] = useState(false);

  const handlePDF = async () => {
    setLoadingPDF(true);
    try {
      const { data } = await reportAPI.downloadPDF();
      downloadBlob(data, `renewal-report-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('PDF downloaded!');
    } catch {
      toast.error('Failed to generate PDF');
    } finally {
      setLoadingPDF(false);
    }
  };

  const handleExcel = async () => {
    setLoadingExcel(true);
    try {
      const { data } = await reportAPI.downloadExcel();
      downloadBlob(data, `renewal-report-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Excel downloaded!');
    } catch {
      toast.error('Failed to generate Excel');
    } finally {
      setLoadingExcel(false);
    }
  };

  const features = [
    'All documents with full metadata',
    'Issue & expiry dates formatted',
    'Status color-coded (Active, Expired, etc.)',
    'Cost and currency details',
    'Document type breakdown',
    'Styled headers and alternating rows',
  ];

  return (
    <div className="page-content">
      <div className="card" style={{ marginBottom: 28, background: 'linear-gradient(135deg, rgba(79,70,229,0.12), rgba(124,58,237,0.08))', border: '1px solid rgba(79,70,229,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, background: 'rgba(79,70,229,0.2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChart2 size={22} color="#818cf8" />
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Reports & Export</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 2 }}>
              Export your complete document renewal data as PDF or Excel spreadsheet.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* PDF Card */}
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, background: 'rgba(220,38,38,0.12)', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <FileText size={32} color="#f87171" />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>PDF Report</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            Download a beautifully formatted PDF report of all your documents.
          </p>
          <ul style={{ listStyle: 'none', marginBottom: 24, textAlign: 'left' }}>
            {features.map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                <CheckCircle size={14} color="#4ade80" /> {f}
              </li>
            ))}
          </ul>
          <button className="btn btn-danger btn-lg" style={{ width: '100%', background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }} onClick={handlePDF} disabled={loadingPDF}>
            {loadingPDF ? <span className="loading-spinner" /> : <><Download size={16} /> Download PDF</>}
          </button>
        </div>

        {/* Excel Card */}
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, background: 'rgba(22,163,74,0.12)', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Table size={32} color="#4ade80" />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Excel Spreadsheet</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            Download an Excel (.xlsx) file for further analysis and filtering.
          </p>
          <ul style={{ listStyle: 'none', marginBottom: 24, textAlign: 'left' }}>
            {features.map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                <CheckCircle size={14} color="#4ade80" /> {f}
              </li>
            ))}
          </ul>
          <button className="btn btn-success btn-lg" style={{ width: '100%', background: 'linear-gradient(135deg, #16a34a, #15803d)' }} onClick={handleExcel} disabled={loadingExcel}>
            {loadingExcel ? <span className="loading-spinner" /> : <><Download size={16} /> Download Excel</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Reports;
