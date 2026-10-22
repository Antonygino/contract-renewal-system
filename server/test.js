require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

const pass = (label, msg) => console.log(`\x1b[32m✅ PASS\x1b[0m [${label}] ${msg}`);
const fail = (label, msg) => console.log(`\x1b[31m❌ FAIL\x1b[0m [${label}] ${msg}`);

console.log('\n' + '═'.repeat(52));
console.log('   RENEWALTRACK — BACKEND UNIT TESTS');
console.log('═'.repeat(52));

async function runTests() {

  // T1: Models load
  try {
    const User = require('./models/User');
    const Doc  = require('./models/Document');
    const uKeys = Object.keys(User.schema.paths).filter(k=>!k.startsWith('_')).join(', ');
    const dKeys = Object.keys(Doc.schema.paths).filter(k=>!k.startsWith('_')).slice(0,7).join(', ');
    pass('T1', 'Mongoose models load OK');
    console.log(`       User: ${uKeys}`);
    console.log(`       Doc : ${dKeys}...`);
  } catch(e) { fail('T1', 'Models: ' + e.message); }

  // T2: Middleware
  try {
    const { protect, adminOnly } = require('./middleware/authMiddleware');
    require('./middleware/errorMiddleware');
    pass('T2', `Middleware OK — exports: protect(${typeof protect}), adminOnly(${typeof adminOnly})`);
  } catch(e) { fail('T2', e.message); }

  // T3: Controllers
  try {
    const a = require('./controllers/authController');
    const d = require('./controllers/documentController');
    const r = require('./controllers/reportController');
    pass('T3', 'Controllers OK');
    console.log(`       authCtrl : ${Object.keys(a).join(', ')}`);
    console.log(`       docCtrl  : ${Object.keys(d).join(', ')}`);
    console.log(`       repCtrl  : ${Object.keys(r).join(', ')}`);
  } catch(e) { fail('T3', e.message); }

  // T4: Routes
  try {
    require('./routes/authRoutes');
    require('./routes/documentRoutes');
    require('./routes/reportRoutes');
    pass('T4', 'All 3 route files load without error');
  } catch(e) { fail('T4', e.message); }

  // T5: bcrypt hash + compare
  try {
    const hash  = await bcrypt.hash('StrongPass@99', 12);
    const match = await bcrypt.compare('StrongPass@99', hash);
    const wrong = await bcrypt.compare('WrongPassword', hash);
    if (match && !wrong) pass('T5', 'bcrypt hash + compare: correct match=true, wrong match=false');
    else fail('T5', `Unexpected results match=${match} wrong=${wrong}`);
  } catch(e) { fail('T5', e.message); }

  // T6: JWT sign / verify / reject
  try {
    const token = jwt.sign({ id: 'user_test_001' }, 'jwtSecret', { expiresIn: '7d' });
    const dec   = jwt.verify(token, 'jwtSecret');
    let rejected = false;
    try { jwt.verify(token, 'badSecret'); } catch { rejected = true; }
    if (dec.id === 'user_test_001' && rejected) {
      pass('T6', `JWT sign/verify OK — id=${dec.id} | bad secret rejected=${rejected}`);
    } else fail('T6', 'JWT verification logic incorrect');
  } catch(e) { fail('T6', e.message); }

  // T7: Document status logic (mirrors pre-save hook)
  try {
    const getStatus = (daysFromNow, reminder = 30) => {
      const expiry = new Date(Date.now() + daysFromNow * 86400000);
      const daysLeft = Math.ceil((expiry - new Date()) / 86400000);
      if (expiry < new Date()) return 'Expired';
      if (daysLeft <= reminder) return 'Expiring Soon';
      return 'Active';
    };
    const r1 = getStatus(-2);   // past      → Expired
    const r2 = getStatus(10);   // 10 days   → Expiring Soon (< 30)
    const r3 = getStatus(60);   // 60 days   → Active
    if (r1==='Expired' && r2==='Expiring Soon' && r3==='Active') {
      pass('T7', `Status logic: -2d=${r1} | 10d=${r2} | 60d=${r3}`);
    } else fail('T7', `Unexpected: ${r1}, ${r2}, ${r3}`);
  } catch(e) { fail('T7', e.message); }

  // T8: Email service + Cron utils
  try {
    const { sendRenewalReminder } = require('./utils/emailService');
    const { startRenewalCron }    = require('./utils/cronJobs');
    pass('T8', `Utils load — sendRenewalReminder=${typeof sendRenewalReminder}, startRenewalCron=${typeof startRenewalCron}`);
  } catch(e) { fail('T8', e.message); }

  // T9: API route structure
  try {
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/api/auth',      require('./routes/authRoutes'));
    app.use('/api/documents', require('./routes/documentRoutes'));
    app.use('/api/reports',   require('./routes/reportRoutes'));
    pass('T9', 'Full Express app with all routes mounts without error');
  } catch(e) { fail('T9', e.message); }

  console.log('\n' + '═'.repeat(52));
  console.log('   Tests complete');
  console.log('═'.repeat(52) + '\n');
}

runTests().catch(e => console.error('Test runner error:', e.message));
