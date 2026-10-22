// API Integration Tests — tests live endpoints on localhost:5000
const http = require('http');

const BASE = 'http://localhost:5000/api';
let token = '';
let docId  = '';

const pass = (label, msg) => console.log(`\x1b[32m✅ PASS\x1b[0m [${label}] ${msg}`);
const fail = (label, msg) => console.log(`\x1b[31m❌ FAIL\x1b[0m [${label}] ${msg}`);

function request(method, path, body = null, authToken = '') {
  return new Promise((resolve, reject) => {
    const url   = new URL(BASE + path);
    const data  = body ? JSON.stringify(body) : null;
    const opts  = {
      hostname: url.hostname,
      port:     url.port || 80,
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log('\n' + '═'.repeat(54));
  console.log('   RENEWALTRACK — API INTEGRATION TESTS');
  console.log('═'.repeat(54));

  // A1: Health check
  try {
    const r = await request('GET', '/health');
    if (r.status === 200 && r.body.success)
      pass('A1', `Health check OK — "${r.body.message}"`);
    else fail('A1', `Status ${r.status}`);
  } catch(e) { fail('A1', e.message); }

  // A2: Register new user
  const testEmail = `test_${Date.now()}@renewaltrack.dev`;
  try {
    const r = await request('POST', '/auth/register', {
      name: 'Test User', email: testEmail, password: 'Test@1234', organization: 'FSD College'
    });
    if (r.status === 201 && r.body.token) {
      token = r.body.token;
      pass('A2', `Register OK — user: ${r.body.user.name} | token received`);
    } else fail('A2', `Status ${r.status} — ${r.body.message}`);
  } catch(e) { fail('A2', e.message); }

  // A3: Login
  try {
    const r = await request('POST', '/auth/login', { email: testEmail, password: 'Test@1234' });
    if (r.status === 200 && r.body.token) {
      token = r.body.token;
      pass('A3', `Login OK — email: ${testEmail}`);
    } else fail('A3', `Status ${r.status} — ${r.body.message}`);
  } catch(e) { fail('A3', e.message); }

  // A4: Login with wrong password
  try {
    const r = await request('POST', '/auth/login', { email: testEmail, password: 'WrongPass!' });
    if (r.status === 401) pass('A4', `Wrong password → 401 Unauthorized (correct)`);
    else fail('A4', `Expected 401, got ${r.status}`);
  } catch(e) { fail('A4', e.message); }

  // A5: Get current user profile (protected)
  try {
    const r = await request('GET', '/auth/me', null, token);
    if (r.status === 200 && r.body.user.email === testEmail)
      pass('A5', `GET /auth/me OK — name: ${r.body.user.name}`);
    else fail('A5', `Status ${r.status}`);
  } catch(e) { fail('A5', e.message); }

  // A6: Access protected route without token → 401
  try {
    const r = await request('GET', '/auth/me');
    if (r.status === 401) pass('A6', `No token → 401 Unauthorized (correct)`);
    else fail('A6', `Expected 401, got ${r.status}`);
  } catch(e) { fail('A6', e.message); }

  // A7: Create document
  const expiry = new Date(); expiry.setFullYear(expiry.getFullYear() + 1);
  const issue  = new Date(); issue.setFullYear(issue.getFullYear() - 1);
  try {
    const r = await request('POST', '/documents', {
      title: 'Test Office Lease', type: 'Contract', issuer: 'Property Corp Ltd',
      issueDate: issue.toISOString(), expiryDate: expiry.toISOString(),
      cost: 50000, currency: 'INR', reminderDays: 30,
      description: 'Annual office lease agreement', tags: ['office', 'lease']
    }, token);
    if (r.status === 201 && r.body.document?._id) {
      docId = r.body.document._id;
      pass('A7', `Create document OK — id: ${docId} | status: ${r.body.document.status}`);
    } else fail('A7', `Status ${r.status} — ${r.body.message}`);
  } catch(e) { fail('A7', e.message); }

  // A8: Get all documents
  try {
    const r = await request('GET', '/documents', null, token);
    if (r.status === 200 && Array.isArray(r.body.documents))
      pass('A8', `GET /documents OK — total: ${r.body.total}, returned: ${r.body.documents.length}`);
    else fail('A8', `Status ${r.status}`);
  } catch(e) { fail('A8', e.message); }

  // A9: Get single document
  try {
    const r = await request('GET', `/documents/${docId}`, null, token);
    if (r.status === 200 && r.body.document.title === 'Test Office Lease')
      pass('A9', `GET /documents/:id OK — title: "${r.body.document.title}"`);
    else fail('A9', `Status ${r.status}`);
  } catch(e) { fail('A9', e.message); }

  // A10: Update document
  try {
    const r = await request('PUT', `/documents/${docId}`, { title: 'Updated Office Lease', cost: 60000 }, token);
    if (r.status === 200 && r.body.document.title === 'Updated Office Lease')
      pass('A10', `PUT /documents/:id OK — new title: "${r.body.document.title}", cost: ${r.body.document.cost}`);
    else fail('A10', `Status ${r.status} — ${r.body.message}`);
  } catch(e) { fail('A10', e.message); }

  // A11: Dashboard stats
  try {
    const r = await request('GET', '/documents/stats', null, token);
    if (r.status === 200 && r.body.stats)
      pass('A11', `GET /documents/stats OK — total: ${r.body.stats.total}, active: ${r.body.stats.active}, expiringSoon: ${r.body.stats.expiringSoon}`);
    else fail('A11', `Status ${r.status}`);
  } catch(e) { fail('A11', e.message); }

  // A12: Search documents
  try {
    const r = await request('GET', '/documents?search=Updated', null, token);
    if (r.status === 200 && r.body.documents.length >= 1)
      pass('A12', `Search OK — found ${r.body.documents.length} doc(s) for "Updated"`);
    else fail('A12', `Status ${r.status} | found: ${r.body.documents?.length}`);
  } catch(e) { fail('A12', e.message); }

  // A13: Filter by type
  try {
    const r = await request('GET', '/documents?type=Contract', null, token);
    if (r.status === 200)
      pass('A13', `Filter by type=Contract OK — found ${r.body.total} doc(s)`);
    else fail('A13', `Status ${r.status}`);
  } catch(e) { fail('A13', e.message); }

  // A14: Update profile
  try {
    const r = await request('PUT', '/auth/profile', { name: 'Updated Name', organization: 'New Org' }, token);
    if (r.status === 200 && r.body.user.name === 'Updated Name')
      pass('A14', `PUT /auth/profile OK — name: ${r.body.user.name}`);
    else fail('A14', `Status ${r.status}`);
  } catch(e) { fail('A14', e.message); }

  // A15: Delete document
  try {
    const r = await request('DELETE', `/documents/${docId}`, null, token);
    if (r.status === 200 && r.body.success)
      pass('A15', `DELETE /documents/:id OK — "${r.body.message}"`);
    else fail('A15', `Status ${r.status} — ${r.body.message}`);
  } catch(e) { fail('A15', e.message); }

  // A16: Get deleted document → 404
  try {
    const r = await request('GET', `/documents/${docId}`, null, token);
    if (r.status === 404) pass('A16', `Deleted document → 404 Not Found (correct)`);
    else fail('A16', `Expected 404, got ${r.status}`);
  } catch(e) { fail('A16', e.message); }

  console.log('\n' + '═'.repeat(54));
  console.log('   Integration tests complete');
  console.log('═'.repeat(54) + '\n');
}

run().catch(e => console.error('Runner error:', e.message));
