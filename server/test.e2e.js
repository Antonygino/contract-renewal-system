const http = require('http');
const mongoose = require('mongoose');

const BASE_URL = 'http://localhost:5000/api';

let testsPassed = 0;
let testsFailed = 0;
const results = [];

function pass(code, name, detail) {
  testsPassed++;
  results.push({ status: 'PASS', code, name, detail });
  console.log(`\x1b[32m✔ PASS\x1b[0m [${code}] ${name} - ${detail}`);
}

function fail(code, name, detail) {
  testsFailed++;
  results.push({ status: 'FAIL', code, name, detail });
  console.log(`\x1b[31m✖ FAIL\x1b[0m [${code}] ${name} - ${detail}`);
}

function makeRequest(method, path, body = null, token = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;

    const reqHeaders = {
      ...headers,
    };

    if (body && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }

    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }

    if (data && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = Buffer.byteLength(data);
    }

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: reqHeaders,
    };

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed,
          raw,
        });
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runAudit() {
  console.log('\n=============================================================');
  console.log('   FULL END-TO-END AUDIT SUITE — RENEWAL TRACKER MERN STACK   ');
  console.log('=============================================================\n');

  // -------------------------------------------------------------------------
  // SECTION 1: PUBLIC / HEALTH CHECKS (Status 200)
  // -------------------------------------------------------------------------
  try {
    const res = await makeRequest('GET', '/health');
    if (res.statusCode === 200 && res.data.success === true) {
      pass('H1', 'Health Check', `200 OK - ${res.data.message}`);
    } else {
      fail('H1', 'Health Check', `Expected 200, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('H1', 'Health Check', err.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 2: 404 ROUTE NOT FOUND
  // -------------------------------------------------------------------------
  try {
    const res = await makeRequest('GET', '/non-existent-endpoint');
    if (res.statusCode === 404 && res.data.success === false) {
      pass('R1', 'Unknown Route 404', `404 returned correctly - ${res.data.message}`);
    } else {
      fail('R1', 'Unknown Route 404', `Expected 404, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('R1', 'Unknown Route 404', err.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 3: AUTHENTICATION FLOW (201, 200, 400, 401, 409)
  // -------------------------------------------------------------------------
  const timestamp = Date.now();
  const userAEmail = `audit_a_${timestamp}@test.com`;
  const userBEmail = `audit_b_${timestamp}@test.com`;
  let tokenA = '';
  let tokenB = '';
  let userAId = '';
  let userBId = '';

  // Register User A
  try {
    const res = await makeRequest('POST', '/auth/register', {
      name: 'Auditor A',
      email: userAEmail,
      password: 'AuditPassword@123',
      organization: 'Audit Corp',
    });
    if (res.statusCode === 201 && res.data.token) {
      tokenA = res.data.token;
      userAId = res.data.user.id;
      pass('AU1', 'Register User A', `201 Created - token received for ${userAEmail}`);
    } else {
      fail('AU1', 'Register User A', `Expected 201, got ${res.statusCode} (${JSON.stringify(res.data)})`);
    }
  } catch (err) {
    fail('AU1', 'Register User A', err.message);
  }

  // Register User B (for IDOR tests)
  try {
    const res = await makeRequest('POST', '/auth/register', {
      name: 'Auditor B',
      email: userBEmail,
      password: 'AuditPassword@123',
      organization: 'Audit Corp B',
    });
    if (res.statusCode === 201 && res.data.token) {
      tokenB = res.data.token;
      userBId = res.data.user.id;
      pass('AU2', 'Register User B', `201 Created - token received for ${userBEmail}`);
    } else {
      fail('AU2', 'Register User B', `Expected 201, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('AU2', 'Register User B', err.message);
  }

  // Duplicate Registration (Expect 409 Conflict)
  try {
    const res = await makeRequest('POST', '/auth/register', {
      name: 'Auditor Duplicate',
      email: userAEmail,
      password: 'AuditPassword@123',
    });
    if (res.statusCode === 409 || res.statusCode === 400) {
      pass('AU3', 'Duplicate Registration Rejection', `${res.statusCode} Conflict/Bad Request - ${res.data.message}`);
    } else {
      fail('AU3', 'Duplicate Registration Rejection', `Expected 409 or 400, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('AU3', 'Duplicate Registration Rejection', err.message);
  }

  // Registration Validation Error (Missing fields / invalid email / short password)
  try {
    const res = await makeRequest('POST', '/auth/register', {
      name: '',
      email: 'invalid-email-address',
      password: '123',
    });
    if (res.statusCode === 400 || res.statusCode === 422) {
      pass('AU4', 'Registration Validation Rejection', `${res.statusCode} Validation error - ${res.data.message}`);
    } else {
      fail('AU4', 'Registration Validation Rejection', `Expected 400 or 422, got ${res.statusCode} (${res.raw})`);
    }
  } catch (err) {
    fail('AU4', 'Registration Validation Rejection', err.message);
  }

  // Valid Login
  try {
    const res = await makeRequest('POST', '/auth/login', {
      email: userAEmail,
      password: 'AuditPassword@123',
    });
    if (res.statusCode === 200 && res.data.token) {
      pass('AU5', 'Valid Login', `200 OK - token returned for ${userAEmail}`);
    } else {
      fail('AU5', 'Valid Login', `Expected 200, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('AU5', 'Valid Login', err.message);
  }

  // Login Wrong Password (Expect 401)
  try {
    const res = await makeRequest('POST', '/auth/login', {
      email: userAEmail,
      password: 'WrongPassword!',
    });
    if (res.statusCode === 401) {
      pass('AU6', 'Login Wrong Password', `401 Unauthorized - ${res.data.message}`);
    } else {
      fail('AU6', 'Login Wrong Password', `Expected 401, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('AU6', 'Login Wrong Password', err.message);
  }

  // Login Nonexistent User (Expect 401)
  try {
    const res = await makeRequest('POST', '/auth/login', {
      email: 'nonexistent_user_9999@test.com',
      password: 'SomePassword@123',
    });
    if (res.statusCode === 401) {
      pass('AU7', 'Login Nonexistent User', `401 Unauthorized - ${res.data.message}`);
    } else {
      fail('AU7', 'Login Nonexistent User', `Expected 401, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('AU7', 'Login Nonexistent User', err.message);
  }

  // Login Missing Credentials (Expect 400)
  try {
    const res = await makeRequest('POST', '/auth/login', {});
    if (res.statusCode === 400) {
      pass('AU8', 'Login Missing Credentials', `400 Bad Request - ${res.data.message}`);
    } else {
      fail('AU8', 'Login Missing Credentials', `Expected 400, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('AU8', 'Login Missing Credentials', err.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 4: JWT TOKEN VALIDATION & AUTHENTICATED REQUESTS
  // -------------------------------------------------------------------------

  // GET /auth/me with Valid Token (200)
  try {
    const res = await makeRequest('GET', '/auth/me', null, tokenA);
    if (res.statusCode === 200 && res.data.user?.email === userAEmail) {
      pass('TK1', 'Verify Profile /auth/me', `200 OK - Authenticated as ${res.data.user.name}`);
    } else {
      fail('TK1', 'Verify Profile /auth/me', `Expected 200, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('TK1', 'Verify Profile /auth/me', err.message);
  }

  // Protected route with Missing Token (Expect 401)
  try {
    const res = await makeRequest('GET', '/auth/me');
    if (res.statusCode === 401) {
      pass('TK2', 'Missing Token Protected Route', `401 Unauthorized - ${res.data.message}`);
    } else {
      fail('TK2', 'Missing Token Protected Route', `Expected 401, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('TK2', 'Missing Token Protected Route', err.message);
  }

  // Protected route with Malformed Token (Expect 401)
  try {
    const res = await makeRequest('GET', '/auth/me', null, 'this-is-not-a-valid-jwt');
    if (res.statusCode === 401) {
      pass('TK3', 'Malformed Token Protected Route', `401 Unauthorized - ${res.data.message}`);
    } else {
      fail('TK3', 'Malformed Token Protected Route', `Expected 401, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('TK3', 'Malformed Token Protected Route', err.message);
  }

  // Protected route with Expired/Forged JWT (Expect 401)
  try {
    const forgedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3MDUxMzM4N2U4YWE2NjJjY2YwMzM4IiwiaWF0IjoxNTAwMDAwMDAwLCJleHAiOjE1MDAwMDAwMDF9.forgedsignatureforgedsignatureforgedsignature';
    const res = await makeRequest('GET', '/auth/me', null, forgedToken);
    if (res.statusCode === 401) {
      pass('TK4', 'Forged/Expired Token Protected Route', `401 Unauthorized - ${res.data.message}`);
    } else {
      fail('TK4', 'Forged/Expired Token Protected Route', `Expected 401, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('TK4', 'Forged/Expired Token Protected Route', err.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 5: CRUD & DATA PERSISTENCE FOR DOCUMENTS
  // -------------------------------------------------------------------------
  let docAId = '';

  // Create Document (201)
  try {
    const res = await makeRequest('POST', '/documents', {
      title: 'Master Service Agreement 2026',
      type: 'Contract',
      issuer: 'Acme Enterprise Solutions',
      issueDate: '2026-01-15',
      expiryDate: '2027-01-15',
      cost: 45000,
      currency: 'INR',
      reminderDays: 30,
      description: 'Annual enterprise IT support and SLA agreement',
      tags: ['IT', 'SLA', 'Support'],
    }, tokenA);

    if (res.statusCode === 201 && res.data.document?._id) {
      docAId = res.data.document._id;
      pass('DOC1', 'Create Document', `201 Created - ID: ${docAId}, Status: ${res.data.document.status}`);
    } else {
      fail('DOC1', 'Create Document', `Expected 201, got ${res.statusCode} (${JSON.stringify(res.data)})`);
    }
  } catch (err) {
    fail('DOC1', 'Create Document', err.message);
  }

  // Create Document with Missing Required Fields (Expect 400)
  try {
    const res = await makeRequest('POST', '/documents', {
      description: 'Missing title, issuer, dates',
    }, tokenA);

    if (res.statusCode === 400 || res.statusCode === 422) {
      pass('DOC2', 'Create Document Missing Fields', `${res.statusCode} Rejected - ${res.data.message}`);
    } else {
      fail('DOC2', 'Create Document Missing Fields', `Expected 400 or 422, got ${res.statusCode} (${res.raw})`);
    }
  } catch (err) {
    fail('DOC2', 'Create Document Missing Fields', err.message);
  }

  // Read Single Document (200)
  try {
    const res = await makeRequest('GET', `/documents/${docAId}`, null, tokenA);
    if (res.statusCode === 200 && res.data.document?.title === 'Master Service Agreement 2026') {
      pass('DOC3', 'Get Document by ID', `200 OK - retrieved "${res.data.document.title}"`);
    } else {
      fail('DOC3', 'Get Document by ID', `Expected 200, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('DOC3', 'Get Document by ID', err.message);
  }

  // Update Document (200)
  try {
    const res = await makeRequest('PUT', `/documents/${docAId}`, {
      title: 'Master Service Agreement 2026 (Updated SLA)',
      cost: 50000,
    }, tokenA);
    if (res.statusCode === 200 && res.data.document?.title === 'Master Service Agreement 2026 (Updated SLA)') {
      pass('DOC4', 'Update Document', `200 OK - updated cost to ${res.data.document.cost}`);
    } else {
      fail('DOC4', 'Update Document', `Expected 200, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('DOC4', 'Update Document', err.message);
  }

  // Status Preservation: Mark Document as 'Cancelled' and update other fields
  try {
    const resCancel = await makeRequest('PUT', `/documents/${docAId}`, {
      status: 'Cancelled',
      notes: 'Customer terminated early',
    }, tokenA);
    if (resCancel.statusCode === 200 && resCancel.data.document?.status === 'Cancelled') {
      // Now update title without changing status, verify status remains Cancelled
      const resKeep = await makeRequest('PUT', `/documents/${docAId}`, {
        title: 'Master Service Agreement (Terminated)',
      }, tokenA);
      if (resKeep.statusCode === 200 && resKeep.data.document?.status === 'Cancelled') {
        pass('STAT1', 'Document Status Preservation', `Cancelled status correctly preserved upon edit`);
      } else {
        fail('STAT1', 'Document Status Preservation', `Status was reverted to ${resKeep.data.document?.status}!`);
      }
    } else {
      fail('STAT1', 'Document Status Preservation', `Failed to set status to Cancelled: ${resCancel.data?.message}`);
    }
  } catch (err) {
    fail('STAT1', 'Document Status Preservation', err.message);
  }

  // Renew Document (200)
  try {
    const res = await makeRequest('POST', `/documents/${docAId}/renew`, {
      newExpiryDate: '2028-01-15',
      cost: 55000,
      notes: 'Renewed for year 2027-2028',
    }, tokenA);
    if (res.statusCode === 200 && res.data.document?.expiryDate) {
      pass('DOC5', 'Renew Document', `200 OK - new expiry: ${res.data.document.expiryDate}`);
    } else {
      fail('DOC5', 'Renew Document', `Expected 200, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('DOC5', 'Renew Document', err.message);
  }

  // Dashboard Stats (200)
  try {
    const res = await makeRequest('GET', '/documents/stats', null, tokenA);
    if (res.statusCode === 200 && res.data.stats?.total >= 1) {
      pass('DOC6', 'Dashboard Stats Aggregation', `200 OK - Total: ${res.data.stats.total}`);
    } else {
      fail('DOC6', 'Dashboard Stats Aggregation', `Expected 200 with total >= 1, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('DOC6', 'Dashboard Stats Aggregation', err.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 6: IDOR (INSECURE DIRECT OBJECT REFERENCE) TESTING
  // -------------------------------------------------------------------------

  // User B tries to read User A's document (Expect 404)
  try {
    const res = await makeRequest('GET', `/documents/${docAId}`, null, tokenB);
    if (res.statusCode === 404 || res.statusCode === 403) {
      pass('SEC1', 'IDOR: Unauthorized Read Blocked', `${res.statusCode} Access Denied to User A document`);
    } else {
      fail('SEC1', 'IDOR: Unauthorized Read Blocked', `CRITICAL VULNERABILITY: User B accessed User A doc with status ${res.statusCode}!`);
    }
  } catch (err) {
    fail('SEC1', 'IDOR: Unauthorized Read Blocked', err.message);
  }

  // User B tries to update User A's document (Expect 404)
  try {
    const res = await makeRequest('PUT', `/documents/${docAId}`, {
      title: 'HACKED TITLE BY USER B',
    }, tokenB);
    if (res.statusCode === 404 || res.statusCode === 403) {
      pass('SEC2', 'IDOR: Unauthorized Update Blocked', `${res.statusCode} Update Denied`);
    } else {
      fail('SEC2', 'IDOR: Unauthorized Update Blocked', `CRITICAL VULNERABILITY: User B modified User A doc with status ${res.statusCode}!`);
    }
  } catch (err) {
    fail('SEC2', 'IDOR: Unauthorized Update Blocked', err.message);
  }

  // User B tries to renew User A's document (Expect 404)
  try {
    const res = await makeRequest('POST', `/documents/${docAId}/renew`, {
      newExpiryDate: '2099-01-01',
    }, tokenB);
    if (res.statusCode === 404 || res.statusCode === 403) {
      pass('SEC3', 'IDOR: Unauthorized Renew Blocked', `${res.statusCode} Renew Denied`);
    } else {
      fail('SEC3', 'IDOR: Unauthorized Renew Blocked', `CRITICAL VULNERABILITY: User B renewed User A doc!`);
    }
  } catch (err) {
    fail('SEC3', 'IDOR: Unauthorized Renew Blocked', err.message);
  }

  // User B tries to delete User A's document (Expect 404)
  try {
    const res = await makeRequest('DELETE', `/documents/${docAId}`, null, tokenB);
    if (res.statusCode === 404 || res.statusCode === 403) {
      pass('SEC4', 'IDOR: Unauthorized Delete Blocked', `${res.statusCode} Delete Denied`);
    } else {
      fail('SEC4', 'IDOR: Unauthorized Delete Blocked', `CRITICAL VULNERABILITY: User B deleted User A doc!`);
    }
  } catch (err) {
    fail('SEC4', 'IDOR: Unauthorized Delete Blocked', err.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 7: ROLE-BASED ACCESS CONTROL (RBAC) & ADMIN ENDPOINTS
  // -------------------------------------------------------------------------

  // Login as seeded System Admin
  let adminToken = '';
  try {
    const res = await makeRequest('POST', '/auth/login', {
      email: 'admin@renewaltrack.com',
      password: 'Admin@1234',
    });
    if (res.statusCode === 200 && res.data.token) {
      adminToken = res.data.token;
      pass('RB1', 'Admin Login', `200 OK - Admin authenticated`);
    } else {
      fail('RB1', 'Admin Login', `Expected 200, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('RB1', 'Admin Login', err.message);
  }

  // Regular user attempts Admin API -> Expect 403 Forbidden
  try {
    const res = await makeRequest('GET', '/admin/stats', null, tokenA);
    if (res.statusCode === 403) {
      pass('RB2', 'User -> Admin API Blocked', `403 Forbidden - ${res.data.message}`);
    } else {
      fail('RB2', 'User -> Admin API Blocked', `Expected 403, got ${res.statusCode} (${res.raw})`);
    }
  } catch (err) {
    fail('RB2', 'User -> Admin API Blocked', err.message);
  }

  // Unauthenticated attempts Admin API -> Expect 401 Unauthorized
  try {
    const res = await makeRequest('GET', '/admin/stats');
    if (res.statusCode === 401) {
      pass('RB3', 'Unauthenticated -> Admin API Blocked', `401 Unauthorized - ${res.data.message}`);
    } else {
      fail('RB3', 'Unauthenticated -> Admin API Blocked', `Expected 401, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('RB3', 'Unauthenticated -> Admin API Blocked', err.message);
  }

  // Admin attempts Admin API -> Expect 200 OK
  if (adminToken) {
    try {
      const res = await makeRequest('GET', '/admin/stats', null, adminToken);
      if (res.statusCode === 200 && res.data.stats?.totalUsers >= 1) {
        pass('RB4', 'Admin -> Admin Stats OK', `200 OK - Total Users: ${res.data.stats.totalUsers}, Total Docs: ${res.data.stats.totalDocuments}`);
      } else {
        fail('RB4', 'Admin -> Admin Stats OK', `Expected 200, got ${res.statusCode}`);
      }
    } catch (err) {
      fail('RB4', 'Admin -> Admin Stats OK', err.message);
    }

    try {
      const res = await makeRequest('GET', '/admin/users', null, adminToken);
      if (res.statusCode === 200 && Array.isArray(res.data.users)) {
        pass('RB5', 'Admin -> Admin Users List OK', `200 OK - ${res.data.total} user(s) returned`);
      } else {
        fail('RB5', 'Admin -> Admin Users List OK', `Expected 200, got ${res.statusCode}`);
      }
    } catch (err) {
      fail('RB5', 'Admin -> Admin Users List OK', err.message);
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 8: INPUT VALIDATION, MALFORMED DATA & INJECTION PROBES
  // -------------------------------------------------------------------------

  // Malformed ObjectId in URL (Expect 400 or 404, NEVER 500)
  try {
    const res = await makeRequest('GET', '/documents/invalid-objectid-12345', null, tokenA);
    if (res.statusCode === 400 || res.statusCode === 404) {
      pass('INP1', 'Malformed ObjectId URL Parameter', `${res.statusCode} Handled cleanly without 500`);
    } else {
      fail('INP1', 'Malformed ObjectId URL Parameter', `Expected 400 or 404, got ${res.statusCode} (${res.raw})`);
    }
  } catch (err) {
    fail('INP1', 'Malformed ObjectId URL Parameter', err.message);
  }

  // Regex Syntax Special Characters in Search (? * + [ ( { \)
  try {
    const res = await makeRequest('GET', '/documents?search=%2B%2A%3F%5B', null, tokenA);
    if (res.statusCode === 200) {
      pass('INP2', 'Regex Special Characters Search', `200 OK - search escaped safely without regex crash`);
    } else {
      fail('INP2', 'Regex Special Characters Search', `Expected 200, got ${res.statusCode} (${res.raw})`);
    }
  } catch (err) {
    fail('INP2', 'Regex Special Characters Search', err.message);
  }

  // NoSQL Injection in Login (Object instead of string in email)
  try {
    const res = await makeRequest('POST', '/auth/login', {
      email: { $gt: '' },
      password: 'password',
    });
    if (res.statusCode === 400 || res.statusCode === 401) {
      pass('INP3', 'NoSQL Injection in Login', `${res.statusCode} Rejected safely`);
    } else {
      fail('INP3', 'NoSQL Injection in Login', `Expected 400 or 401, got ${res.statusCode} (${res.raw})`);
    }
  } catch (err) {
    fail('INP3', 'NoSQL Injection in Login', err.message);
  }

  // Malformed JSON Payload (Expect 400, NEVER 500)
  try {
    const res = await makeRequest('POST', '/auth/login', '{ "broken_json": ', null, { 'Content-Type': 'application/json' });
    if (res.statusCode === 400) {
      pass('INP4', 'Malformed JSON Payload Handling', `400 Bad Request`);
    } else {
      fail('INP4', 'Malformed JSON Payload Handling', `Expected 400, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('INP4', 'Malformed JSON Payload Handling', err.message);
  }

  // Unsupported File Upload (Expect 400, NEVER 500)
  try {
    const boundary = '----WebKitFormBoundaryXYZ';
    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="payload.exe"\r\n`;
    body += `Content-Type: application/octet-stream\r\n\r\n`;
    body += `malicious-bytes\r\n`;
    body += `--${boundary}--\r\n`;

    const res = await makeRequest('POST', '/documents', body, tokenA, {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    });
    if (res.statusCode === 400) {
      pass('INP5', 'Unsupported File Extension Rejection', `400 Bad Request - ${res.data.message}`);
    } else {
      fail('INP5', 'Unsupported File Extension Rejection', `Expected 400, got ${res.statusCode} (${res.raw})`);
    }
  } catch (err) {
    fail('INP5', 'Unsupported File Extension Rejection', err.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 9: DEACTIVATED USER ACCOUNT TOKEN REVOCATION
  // -------------------------------------------------------------------------
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect('mongodb://localhost:27017/renewal_tracker');
    }
    const User = require('./models/User');
    await User.findByIdAndUpdate(userBId, { isActive: false });

    // Try making request with tokenB
    const res = await makeRequest('GET', '/auth/me', null, tokenB);
    if (res.statusCode === 403) {
      pass('SEC5', 'Deactivated Account Token Enforcement', `403 Forbidden - ${res.data.message}`);
    } else {
      fail('SEC5', 'Deactivated Account Token Enforcement', `Expected 403, got ${res.statusCode}`);
    }

    // Restore userB
    await User.findByIdAndUpdate(userBId, { isActive: true });
    await mongoose.disconnect();
  } catch (err) {
    fail('SEC5', 'Deactivated Account Token Enforcement', err.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 10: EXPORT REPORTS (PDF & EXCEL)
  // -------------------------------------------------------------------------

  // Export PDF (200, application/pdf)
  try {
    const res = await makeRequest('GET', '/reports/pdf', null, tokenA);
    const contentType = res.headers['content-type'] || '';
    if (res.statusCode === 200 && contentType.includes('application/pdf')) {
      pass('REP1', 'Export PDF Report', `200 OK - Content-Type: ${contentType}`);
    } else {
      fail('REP1', 'Export PDF Report', `Expected 200 with application/pdf, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('REP1', 'Export PDF Report', err.message);
  }

  // Export Excel (200, spreadsheetml)
  try {
    const res = await makeRequest('GET', '/reports/excel', null, tokenA);
    const contentType = res.headers['content-type'] || '';
    if (res.statusCode === 200 && contentType.includes('spreadsheetml')) {
      pass('REP2', 'Export Excel Report', `200 OK - Content-Type: ${contentType}`);
    } else {
      fail('REP2', 'Export Excel Report', `Expected 200 with spreadsheetml, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('REP2', 'Export Excel Report', err.message);
  }

  // Reports without Token (Expect 401)
  try {
    const res = await makeRequest('GET', '/reports/pdf');
    if (res.statusCode === 401) {
      pass('REP3', 'Export PDF Protected', `401 Unauthorized`);
    } else {
      fail('REP3', 'Export PDF Protected', `Expected 401, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('REP3', 'Export PDF Protected', err.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 11: TEARDOWN / DELETE DOCUMENT (200 then 404)
  // -------------------------------------------------------------------------
  try {
    const res = await makeRequest('DELETE', `/documents/${docAId}`, null, tokenA);
    if (res.statusCode === 200) {
      pass('CLN1', 'Delete Document', `200 OK - Document deleted successfully`);
    } else {
      fail('CLN1', 'Delete Document', `Expected 200, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('CLN1', 'Delete Document', err.message);
  }

  try {
    const res = await makeRequest('GET', `/documents/${docAId}`, null, tokenA);
    if (res.statusCode === 404) {
      pass('CLN2', 'Verify Document Deleted', `404 Not Found`);
    } else {
      fail('CLN2', 'Verify Document Deleted', `Expected 404, got ${res.statusCode}`);
    }
  } catch (err) {
    fail('CLN2', 'Verify Document Deleted', err.message);
  }

  console.log('\n=============================================================');
  console.log(`   AUDIT FINISHED: ${testsPassed} PASSED | ${testsFailed} FAILED`);
  console.log('=============================================================\n');
}

runAudit().catch(console.error);
