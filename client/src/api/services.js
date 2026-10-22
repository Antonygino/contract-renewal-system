import API from './axios';

export const authAPI = {
  register: (data) => API.post('/auth/register', data),
  login: (data) => API.post('/auth/login', data),
  getMe: () => API.get('/auth/me'),
  updateProfile: (data) => API.put('/auth/profile', data),
};

export const documentAPI = {
  getAll: (params) => API.get('/documents', { params }),
  getOne: (id) => API.get(`/documents/${id}`),
  create: (data) => API.post('/documents', data, data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {}),
  update: (id, data) => API.put(`/documents/${id}`, data, data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {}),
  renew: (id, data) => API.post(`/documents/${id}/renew`, data, data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {}),
  archive: (id) => API.patch(`/documents/${id}/archive`),
  remove: (id) => API.delete(`/documents/${id}`),
  getStats: (params) => API.get('/documents/stats', { params }),
  parseFile: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return API.post('/documents/parse', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  aiScanFile: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return API.post('/documents/ai-scan', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

export const adminAPI = {
  getStats: () => API.get('/admin/stats'),
  getUsers: () => API.get('/admin/users'),
  getAuditLogs: (params) => API.get('/admin/audit-logs', { params }),
  getApprovals: () => API.get('/admin/approvals'),
  approveRenewal: (id) => API.put(`/admin/approvals/${id}/approve`),
  rejectRenewal: (id, reason) => API.put(`/admin/approvals/${id}/reject`, { reason }),
  reassignDocument: (id, targetUserId) => API.put(`/admin/documents/${id}/reassign`, { targetUserId }),
};

export const reportAPI = {
  downloadPDF: () => API.get('/reports/pdf', { responseType: 'blob' }),
  downloadExcel: () => API.get('/reports/excel', { responseType: 'blob' }),
};
