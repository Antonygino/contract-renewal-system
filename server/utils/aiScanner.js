/**
 * aiScanner.js
 * ──────────────────────────────────────────────────────────────────────────
 * Scan a document (PDF / Image / DOCX / TXT) using multiple AI providers
 * with automatic fallback:
 *   1. OpenAI  (GPT-4o)
 *   2. Google  (Gemini 1.5 Flash)
 *   3. Anthropic (Claude 3 Haiku)
 *   4. Regex-based local parser (always available)
 *
 * Each provider is tried in order. If a provider's token quota is exhausted
 * (or any API-level error occurs) the next provider is tried automatically.
 * ──────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');

let pdfParsePkg, mammoth;
try { pdfParsePkg = require('pdf-parse'); }      catch (_) {}
try { mammoth     = require('mammoth'); }        catch (_) {}

// ── AI SDKs (gracefully handled if missing keys) ─────────────────────────
let OpenAI, GoogleGenerativeAI, Anthropic;
try { ({ default: OpenAI } = require('openai')); }                      catch (_) {}
try { ({ GoogleGenerativeAI } = require('@google/generative-ai')); }    catch (_) {}
try { ({ default: Anthropic } = require('@anthropic-ai/sdk')); }        catch (_) {}

// ──────────────────────────────────────────────────────────────────────────
// EXTRACTION PROMPT
// ──────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a document data extraction engine. Extract the following fields from the document text provided and return ONLY valid JSON — no markdown, no extra commentary.

Required JSON shape:
{
  "title":        "<document title or contract name>",
  "type":         "<one of: Contract | License | Certification | Warranty | Insurance | Permit | Other>",
  "issuer":       "<organization/company/authority that issued this document>",
  "issueDate":    "<YYYY-MM-DD or null>",
  "expiryDate":   "<YYYY-MM-DD or null>",
  "cost":         <numeric amount or 0>,
  "currency":     "<INR | USD | EUR | GBP>",
  "tags":         ["<tag1>", "<tag2>"],
  "notes":        "<any reference IDs, names, policy numbers>",
  "description":  "<one-line summary of what this document is>"
}

Rules:
- Use null for dates you cannot find.
- For cost, return 0 if not mentioned.
- For currency, default to INR.
- tags should be from: Finance, Legal, IT, HR, Education, Facility, Insurance.
- Return ONLY the JSON object, nothing else.`;

// ──────────────────────────────────────────────────────────────────────────
// TEXT / IMAGE EXTRACTION FROM FILE
// ──────────────────────────────────────────────────────────────────────────
async function extractFileContent(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    if (!pdfParsePkg) return { text: '', base64: null, error: 'pdf-parse not installed' };
    try {
      const buffer = fs.readFileSync(filePath);
      let text = '';
      if (pdfParsePkg.PDFParse) {
        let fontUrl;
        try {
          const { pathToFileURL } = require('url');
          const fontsDir = path.resolve(__dirname, '../node_modules/pdfjs-dist/standard_fonts/');
          if (fs.existsSync(fontsDir)) {
            fontUrl = pathToFileURL(fontsDir).href;
            if (!fontUrl.endsWith('/')) fontUrl += '/';
          }
        } catch (_) {}
        const parser = new pdfParsePkg.PDFParse({
          data: new Uint8Array(buffer),
          standardFontDataUrl: fontUrl,
          verbosity: 0,
        });
        const res = await parser.getText();
        text = res.text || '';
      } else if (typeof pdfParsePkg === 'function') {
        const data = await pdfParsePkg(buffer);
        text = data.text || '';
      }
      return { text, base64: buffer.toString('base64'), mimeType: 'application/pdf' };
    } catch (e) { return { text: '', base64: null, error: e.message }; }
  }

  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
    try {
      const buffer = fs.readFileSync(filePath);
      return { text: '', base64: buffer.toString('base64'), mimeType: mimeMap[ext] };
    } catch (e) { return { text: '', base64: null, error: e.message }; }
  }

  if (ext === '.docx') {
    if (!mammoth) return { text: '', base64: null, error: 'mammoth not installed' };
    try {
      const buffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value || '', base64: null };
    } catch (e) { return { text: '', base64: null, error: e.message }; }
  }

  if (['.txt', '.csv'].includes(ext)) {
    try {
      const text = fs.readFileSync(filePath, 'utf8');
      return { text, base64: null };
    } catch (e) { return { text: '', base64: null, error: e.message }; }
  }

  return { text: '', base64: null, error: `Unsupported file type: ${ext}` };
}

// ──────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────
function safeParseJSON(raw) {
  if (!raw) return null;
  try {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = raw.indexOf('{');
    const lastBrace  = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
      } catch { return null; }
    }
    return null;
  }
}

function getApiKeys(baseKey) {
  const keys = [];
  // 1. Primary env variable (can be single or comma-separated list of keys)
  if (process.env[baseKey]) {
    const parts = process.env[baseKey].split(',').map(k => k.trim());
    for (const p of parts) {
      if (p && !p.startsWith('your_') && !keys.includes(p)) {
        keys.push(p);
      }
    }
  }
  // 2. Numbered keys like GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc.
  for (let i = 1; i <= 10; i++) {
    const val = process.env[`${baseKey}_${i}`]?.trim();
    if (val && !val.startsWith('your_') && !keys.includes(val)) {
      keys.push(val);
    }
  }
  return keys;
}

function isQuotaError(err) {
  const msg    = (err?.message || '').toLowerCase();
  const status = err?.status || err?.statusCode || err?.response?.status;
  return (
    status === 429 ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('insufficient_quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('overloaded') ||
    msg.includes('credit')
  );
}

// ──────────────────────────────────────────────────────────────────────────
// PROVIDER 1 — OpenAI GPT-4o
// ──────────────────────────────────────────────────────────────────────────
async function scanWithOpenAI({ text, base64, mimeType }, apiKey) {
  if (!OpenAI) throw new Error('openai package not available');
  if (!apiKey || apiKey.startsWith('your_')) throw new Error('OpenAI API key not configured');

  const client = new OpenAI({ apiKey });
  const userContent = [];

  if (base64 && mimeType && mimeType !== 'application/pdf') {
    userContent.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } });
  }

  const docText = text?.trim() || '[No text extracted — analyze the image above]';
  userContent.push({ type: 'text', text: `Document text:\n\n${docText}` });

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userContent },
    ],
  });

  const raw    = response.choices?.[0]?.message?.content || '';
  const parsed = safeParseJSON(raw);
  if (!parsed) throw new Error('OpenAI returned invalid JSON');
  return parsed;
}

// ──────────────────────────────────────────────────────────────────────────
// PROVIDER 2 — Google Gemini
// ──────────────────────────────────────────────────────────────────────────
async function scanWithGemini({ text, base64, mimeType }, apiKey) {
  if (!GoogleGenerativeAI) throw new Error('@google/generative-ai package not available');
  if (!apiKey || apiKey.startsWith('your_')) throw new Error('Gemini API key not configured');

  const genAI = new GoogleGenerativeAI(apiKey);
  const parts = [];

  // If text was extracted, send text (lightweight and fast).
  // If text is absent/scanned image, send base64 image/PDF for vision OCR.
  const hasExtractedText = text && text.trim().length > 30;
  if (!hasExtractedText && base64 && mimeType) {
    parts.push({ inlineData: { mimeType, data: base64 } });
  }

  const docText = text?.trim() || '[Analyze the attached document/image above and extract metadata]';
  parts.push({ text: `${SYSTEM_PROMPT}\n\nDocument text:\n\n${docText.slice(0, 30000)}` });

  // Prioritize 3.5-flash-lite (high availability, ultra-fast) then 3.8-flash
  const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
  let lastErr = null;

  for (const mod of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({ model: mod }, { timeout: 45000 });
      const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
      const raw    = result.response.text();
      const parsed = safeParseJSON(raw);
      if (!parsed) throw new Error(`Gemini (${mod}) returned invalid JSON`);
      return parsed;
    } catch (e) {
      lastErr = e;
      console.warn(`[aiScanner] Gemini model ${mod} failed (${e.status || e.message}), trying next candidate...`);
      if (isQuotaError(e)) {
        throw e;
      }
      continue;
    }
  }
  throw lastErr || new Error('All Gemini models failed');
}

// ──────────────────────────────────────────────────────────────────────────
// PROVIDER 3 — Anthropic Claude 3 Haiku
// ──────────────────────────────────────────────────────────────────────────
async function scanWithClaude({ text, base64, mimeType }, apiKey) {
  if (!Anthropic) throw new Error('@anthropic-ai/sdk package not available');
  if (!apiKey || apiKey.startsWith('your_')) throw new Error('Anthropic API key not configured');

  const client = new Anthropic({ apiKey });
  const userContent = [];

  if (base64 && mimeType && mimeType !== 'application/pdf') {
    userContent.push({ type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } });
  }

  const docText = text?.trim() || '[No text extracted — analyze the image above]';
  userContent.push({ type: 'text', text: `Document text:\n\n${docText}` });

  const message = await client.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const raw    = message.content?.[0]?.text || '';
  const parsed = safeParseJSON(raw);
  if (!parsed) throw new Error('Claude returned invalid JSON');
  return parsed;
}

// ──────────────────────────────────────────────────────────────────────────
// PROVIDER — xAI Grok (grok-2-latest / grok-beta)
// ──────────────────────────────────────────────────────────────────────────
async function scanWithGrok({ text }, apiKey) {
  if (!OpenAI) throw new Error('openai package not available');
  if (!apiKey || apiKey.startsWith('your_')) throw new Error('Grok API key not configured');

  const client = new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1' });
  const docText = text?.trim() || '[No text extracted]';

  const candidateModels = ['grok-2-latest', 'grok-beta'];
  let lastErr = null;
  for (const mod of candidateModels) {
    try {
      const response = await client.chat.completions.create({
        model: mod,
        max_tokens: 1000,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: `Document text:\n\n${docText}` },
        ],
      });
      const raw    = response.choices?.[0]?.message?.content || '';
      const parsed = safeParseJSON(raw);
      if (!parsed) throw new Error(`Grok (${mod}) returned invalid JSON`);
      return parsed;
    } catch (e) {
      lastErr = e;
      if (isQuotaError(e)) throw e;
      if (e.status === 404) continue;
      throw e;
    }
  }
  throw lastErr || new Error('All Grok models failed');
}

// ──────────────────────────────────────────────────────────────────────────
// PROVIDER 4 — Groq (Llama 3.3 70B — ultra-fast & free tier)
// ──────────────────────────────────────────────────────────────────────────
async function scanWithGroq({ text }, apiKey) {
  if (!OpenAI) throw new Error('openai package not available');
  if (!apiKey || apiKey.startsWith('your_')) throw new Error('Groq API key not configured');

  const client = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });
  const docText = text?.trim() || '[No text extracted]';

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 1000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: `Document text:\n\n${docText}` },
    ],
  });

  const raw    = response.choices?.[0]?.message?.content || '';
  const parsed = safeParseJSON(raw);
  if (!parsed) throw new Error('Groq returned invalid JSON');
  return parsed;
}

// ──────────────────────────────────────────────────────────────────────────
// PROVIDER 5 — DeepSeek (deepseek-chat)
// ──────────────────────────────────────────────────────────────────────────
async function scanWithDeepSeek({ text }, apiKey) {
  if (!OpenAI) throw new Error('openai package not available');
  if (!apiKey || apiKey.startsWith('your_')) throw new Error('DeepSeek API key not configured');

  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
  const docText = text?.trim() || '[No text extracted]';

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: 1000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: `Document text:\n\n${docText}` },
    ],
  });

  const raw    = response.choices?.[0]?.message?.content || '';
  const parsed = safeParseJSON(raw);
  if (!parsed) throw new Error('DeepSeek returned invalid JSON');
  return parsed;
}

// ──────────────────────────────────────────────────────────────────────────
// PROVIDER 6 — Mistral AI (mistral-small-latest)
// ──────────────────────────────────────────────────────────────────────────
async function scanWithMistral({ text }, apiKey) {
  if (!OpenAI) throw new Error('openai package not available');
  if (!apiKey || apiKey.startsWith('your_')) throw new Error('Mistral API key not configured');

  const client = new OpenAI({ apiKey, baseURL: 'https://api.mistral.ai/v1' });
  const docText = text?.trim() || '[No text extracted]';

  const response = await client.chat.completions.create({
    model: 'mistral-small-latest',
    max_tokens: 1000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: `Document text:\n\n${docText}` },
    ],
  });

  const raw    = response.choices?.[0]?.message?.content || '';
  const parsed = safeParseJSON(raw);
  if (!parsed) throw new Error('Mistral returned invalid JSON');
  return parsed;
}

// ──────────────────────────────────────────────────────────────────────────
// PROVIDER 4 — Regex local fallback
// ──────────────────────────────────────────────────────────────────────────
const MONTH_MAP = { jan:0,january:0,feb:1,february:1,mar:2,march:2,apr:3,april:3,may:4,jun:5,june:5,jul:6,july:6,aug:7,august:7,sep:8,september:8,oct:9,october:9,nov:10,november:10,dec:11,december:11 };
function _parseDate(str) {
  if (!str) return null;
  str = str.trim();
  let m = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) { let y = parseInt(m[3]); if (y < 100) y += 2000; return new Date(y, parseInt(m[2]) - 1, parseInt(m[1])); }
  m = str.match(/^(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})$/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  m = str.match(/(\d{1,2})\s+([A-Za-z]+)[,\s]+(\d{4})/);
  if (m) { const mo = MONTH_MAP[m[2].toLowerCase()]; if (mo !== undefined) return new Date(parseInt(m[3]), mo, parseInt(m[1])); }
  m = str.match(/([A-Za-z]+)\s+(\d{1,2})[,\s]+(\d{4})/);
  if (m) { const mo = MONTH_MAP[m[1].toLowerCase()]; if (mo !== undefined) return new Date(parseInt(m[3]), mo, parseInt(m[2])); }
  return null;
}
function _toISO(d) {
  if (!d || isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function scanWithRegex({ text }) {
  const t = text || '';
  const lower = t.toLowerCase();
  const result = { title: '', type: 'Other', issuer: '', issueDate: null, expiryDate: null, cost: 0, currency: 'INR', tags: [], notes: '', description: '' };

  const typeKws = { License:['license','licence'], Contract:['contract','agreement','lease','nda','mou'], Certification:['certificate','certification','certified'], Warranty:['warranty','guarantee'], Insurance:['insurance','policy','premium','insured'], Permit:['permit','permission','authorization'] };
  for (const [tp, kws] of Object.entries(typeKws)) { if (kws.some(k => lower.includes(k))) { result.type = tp; break; } }

  const issueM = t.match(/(?:issue\s*date|issued\s*on|valid\s*from|effective\s*date)[\s:=]*([0-9A-Za-z,.\/\- ]+)/i);
  if (issueM) result.issueDate = _toISO(_parseDate(issueM[1].slice(0, 25)));

  const expiryM = t.match(/(?:expiry\s*date|expiration|valid\s*(?:till|until|to)|expires?[\s:=])[\s:=]*([0-9A-Za-z,.\/\- ]+)/i);
  if (expiryM) result.expiryDate = _toISO(_parseDate(expiryM[1].slice(0, 25)));

  if (!result.issueDate) result.issueDate = _toISO(new Date());
  if (!result.expiryDate) { const d = new Date(); d.setFullYear(d.getFullYear() + 1); result.expiryDate = _toISO(d); }

  const costM = t.match(/(?:total\s*amount|amount\s*paid|fee|premium|cost|price)[\s:=₹$€£]*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (costM) result.cost = parseFloat(costM[1].replace(/,/g, '')) || 0;

  const lines = t.split('\n').map(l => l.trim()).filter(l => l.length > 5 && l.length < 80);
  result.title = lines[0] || 'Scanned Document';

  const issuerM = t.match(/(?:issued\s*by|issuer|authority|provider|vendor|company)[\s:=]*([A-Z][A-Za-z0-9 ,.&'()-]+?)(?:\n|$)/i);
  if (issuerM && issuerM[1].length < 80) result.issuer = issuerM[1].trim();

  const tagKws = { Finance:['invoice','payment','receipt','tax','gst','bank'], Legal:['agreement','contract','nda','legal'], IT:['aws','cloud','software','license','subscription'], HR:['employee','offer letter','salary','payroll'], Education:['certificate','course','exam','university'], Insurance:['insurance','policy','premium'] };
  for (const [tag, kws] of Object.entries(tagKws)) { if (kws.some(k => lower.includes(k))) result.tags.push(tag); }

  result.description = `Regex-extracted. Type: ${result.type}. Issuer: ${result.issuer || 'Unknown'}.`;
  return result;
}

// ──────────────────────────────────────────────────────────────────────────
// NORMALISE — clean & validate extracted fields
// ──────────────────────────────────────────────────────────────────────────
function normalise(raw) {
  const VALID_TYPES      = ['Contract', 'License', 'Certification', 'Warranty', 'Insurance', 'Permit', 'Other'];
  const VALID_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];
  return {
    title:        String(raw.title || '').slice(0, 100).trim() || 'Scanned Document',
    type:         VALID_TYPES.includes(raw.type) ? raw.type : 'Other',
    issuer:       String(raw.issuer || '').slice(0, 100).trim() || '',
    issueDate:    isValidDate(raw.issueDate)  ? raw.issueDate  : null,
    expiryDate:   isValidDate(raw.expiryDate) ? raw.expiryDate : null,
    cost:         typeof raw.cost === 'number' && raw.cost >= 0 ? raw.cost : 0,
    currency:     VALID_CURRENCIES.includes(raw.currency) ? raw.currency : 'INR',
    tags:         Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : [],
    notes:        String(raw.notes || '').slice(0, 1000).trim(),
    description:  String(raw.description || '').slice(0, 500).trim(),
    reminderDays: 30,
  };
}

function isValidDate(str) {
  if (!str) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str).getTime());
}

// ──────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ──────────────────────────────────────────────────────────────────────────

/**
 * Scan a document file with AI fallback chain.
 * @param {string} filePath  Absolute path to the uploaded file
 * @returns {Promise<{ success, provider, parsed, warnings, message? }>}
 */
async function scanDocument(filePath) {
  const warnings = [];

  const fileContent = await extractFileContent(filePath);
  if (fileContent.error && !fileContent.base64 && !fileContent.text) {
    return { success: false, provider: 'none', parsed: null, warnings, message: fileContent.error };
  }

  const providerDefs = [
    { name: 'Gemini',   env: 'GEMINI_API_KEY',    fn: scanWithGemini },
    { name: 'OpenAI',   env: 'OPENAI_API_KEY',    fn: scanWithOpenAI },
    { name: 'Grok',     env: 'GROK_API_KEY',      fn: scanWithGrok },
    { name: 'Claude',   env: 'ANTHROPIC_API_KEY', fn: scanWithClaude },
    { name: 'Groq',     env: 'GROQ_API_KEY',      fn: scanWithGroq },
    { name: 'DeepSeek', env: 'DEEPSEEK_API_KEY',  fn: scanWithDeepSeek },
    { name: 'Mistral',  env: 'MISTRAL_API_KEY',   fn: scanWithMistral },
  ];

  for (const p of providerDefs) {
    const keys = getApiKeys(p.env);
    if (keys.length === 0) {
      warnings.push(`${p.name} skipped: no key configured`);
      continue;
    }

    for (let i = 0; i < keys.length; i++) {
      const apiKey = keys[i];
      const keyLabel = keys.length > 1 ? `${p.name} (Key ${i + 1})` : p.name;
      try {
        const result = await p.fn(fileContent, apiKey);
        if (result) {
          return { success: true, provider: p.name, parsed: normalise(result), warnings };
        }
      } catch (err) {
        const reason = isQuotaError(err) ? 'quota/rate-limit' : err.message;
        warnings.push(`${keyLabel} skipped: ${reason}`);
        console.warn(`[aiScanner] ${keyLabel} failed (${reason}), trying next key/provider…`);
      }
    }
  }

  // Regex fallback
  try {
    const result = scanWithRegex(fileContent);
    return { success: true, provider: 'Regex (local)', parsed: normalise(result), warnings };
  } catch (err) {
    warnings.push(`Regex fallback failed: ${err.message}`);
  }

  return {
    success: false,
    provider: 'none',
    parsed: null,
    warnings,
    message: 'All AI providers and local parser failed. Please fill in the form manually.',
  };
}

module.exports = { scanDocument };
