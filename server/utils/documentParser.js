const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function getStandardFontDataUrl() {
  try {
    const fontsDir = path.resolve(__dirname, '../node_modules/pdfjs-dist/standard_fonts/');
    if (fs.existsSync(fontsDir)) {
      let url = pathToFileURL(fontsDir).href;
      if (!url.endsWith('/')) url += '/';
      return url;
    }
  } catch (_) {}
  return undefined;
}

// ─────────────────────────────────────────────
//  Extract raw text from a PDF file path
// ─────────────────────────────────────────────
async function extractPDFText(filePath) {
  const buffer = fs.readFileSync(filePath);
  const fontUrl = getStandardFontDataUrl();
  const parser = new PDFParse({
    data: new Uint8Array(buffer),
    standardFontDataUrl: fontUrl,
    verbosity: 0,
  });
  const result = await parser.getText();
  return result.text || '';
}

// ─────────────────────────────────────────────
//  DATE HELPERS
// ─────────────────────────────────────────────
const MONTH_MAP = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
  nov: 10, november: 10, dec: 11, december: 11,
};

function normalizeYear(y) {
  y = parseInt(y, 10);
  if (y < 100) y += 2000;
  return y;
}

function parseDate(str) {
  if (!str) return null;
  str = str.trim();

  // DD/MM/YYYY or MM/DD/YYYY or YYYY/MM/DD
  let m = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    let y = normalizeYear(m[3]);
    // If first number > 12, treat as day first (DD/MM)
    let day = parseInt(m[1], 10);
    let mon = parseInt(m[2], 10);
    if (day > 12) return new Date(y, mon - 1, day);
    return new Date(y, mon - 1, day); // Assume DD/MM default
  }

  // YYYY-MM-DD (ISO)
  m = str.match(/^(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})$/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));

  // DD Month YYYY  /  Month DD, YYYY  /  Month YYYY
  m = str.match(/(\d{1,2})\s+([A-Za-z]+)[,\s]+(\d{4})/);
  if (m) {
    const mon = MONTH_MAP[m[2].toLowerCase()];
    if (mon !== undefined) return new Date(parseInt(m[3]), mon, parseInt(m[1]));
  }
  m = str.match(/([A-Za-z]+)\s+(\d{1,2})[,\s]+(\d{4})/);
  if (m) {
    const mon = MONTH_MAP[m[1].toLowerCase()];
    if (mon !== undefined) return new Date(parseInt(m[3]), mon, parseInt(m[2]));
  }
  m = str.match(/([A-Za-z]+)[,\s]+(\d{4})/);
  if (m) {
    const mon = MONTH_MAP[m[1].toLowerCase()];
    if (mon !== undefined) return new Date(parseInt(m[2]), mon, 1);
  }
  return null;
}

function toISO(d) {
  if (!d || isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addYears(d, n) {
  const r = new Date(d);
  r.setFullYear(r.getFullYear() + n);
  return r;
}

// ─────────────────────────────────────────────
//  MAIN PARSER
// ─────────────────────────────────────────────
function parseDocumentData(rawText) {
  const text = rawText;
  const lower = text.toLowerCase();

  const result = {
    title: '',
    type: 'Other',
    issuer: '',
    issueDate: null,
    expiryDate: null,
    cost: 0,
    currency: 'INR',
    tags: [],
    notes: '',
    description: '',
    reminderDays: 30,
    confidence: {},  // which fields were detected
  };

  // ── 1. DOCUMENT TYPE ──────────────────────────────────────
  const typeKeywords = {
    License:       ['license', 'licence', 'permission slip', 'driving license'],
    Contract:      ['contract', 'agreement', 'lease', 'nda', 'memorandum of understanding', 'mou', 'service agreement', 'msa', 'sla'],
    Certification: ['certificate', 'certification', 'certified', 'registration certificate', 'gate', 'exam', 'application fee', 'admit card'],
    Warranty:      ['warranty', 'guarantee', 'extended warranty', 'product warranty'],
    Insurance:     ['insurance', 'policy', 'premium', 'insured', 'indemnity', 'coverage', 'insurer'],
    Permit:        ['permit', 'permission', 'authorization', 'trade license'],
  };
  for (const [type, kws] of Object.entries(typeKeywords)) {
    if (kws.some(kw => lower.includes(kw))) {
      result.type = type;
      result.confidence.type = 'high';
      break;
    }
  }

  // ── 2. DATES ─────────────────────────────────────────────
  // Patterns: "Issue Date:", "Valid From:", "Effective Date:", "Date of Issue:", "Date:"
  const issueDatePatterns = [
    /(?:issue\s*date|date\s*of\s*issue|issued\s*on|issued\s*date|start\s*date|valid\s*from|effective\s*date|commencement\s*date|date\s*of\s*commencement)[\s:=]*([0-9A-Za-z,.\/ -]+)/i,
    /(?:^|\n|\r)date[\s:=]*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/im,
  ];
  const expiryDatePatterns = [
    /(?:expiry\s*date|expiration\s*date|valid\s*(?:till|upto|until|to|through)|expires?\s*(?:on)?|renewal\s*date|due\s*date|valid\s*upto|valid\s*till|expiry|last\s*date)[\s:=]*([0-9A-Za-z,.\/ -]+)/i,
    /(?:validity|valid)[\s:]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
  ];

  for (const pat of issueDatePatterns) {
    const m = text.match(pat);
    if (m) {
      const d = parseDate(m[1].slice(0, 25));
      if (d) { result.issueDate = toISO(d); result.confidence.issueDate = 'high'; break; }
    }
  }

  for (const pat of expiryDatePatterns) {
    const m = text.match(pat);
    if (m) {
      const d = parseDate(m[1].slice(0, 25));
      if (d) { result.expiryDate = toISO(d); result.confidence.expiryDate = 'high'; break; }
    }
  }

  // Fallback: scan all date-like strings, pick earliest as issueDate, latest as expiryDate
  if (!result.issueDate || !result.expiryDate) {
    const allDateMatterns = [
      /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/g,
      /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[,\s]+\d{4})\b/gi,
      /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}[,\s]+\d{4})\b/gi,
    ];
    const allDates = [];
    for (const pat of allDateMatterns) {
      let m;
      while ((m = pat.exec(text)) !== null) {
        const d = parseDate(m[1]);
        if (d && !isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2040) {
          allDates.push(d);
        }
      }
    }
    if (allDates.length >= 2) {
      allDates.sort((a, b) => a - b);
      if (!result.issueDate) result.issueDate = toISO(allDates[0]);
      if (!result.expiryDate) result.expiryDate = toISO(allDates[allDates.length - 1]);
    } else if (allDates.length === 1) {
      if (!result.issueDate) result.issueDate = toISO(allDates[0]);
    }
  }

  // If we have issueDate but no expiryDate, default to 1 year later
  if (result.issueDate && !result.expiryDate) {
    result.expiryDate = toISO(addYears(new Date(result.issueDate), 1));
    result.confidence.expiryDate = 'inferred';
  }

  // If we have neither, use today + 1 year
  if (!result.issueDate) result.issueDate = toISO(new Date());
  if (!result.expiryDate) result.expiryDate = toISO(addYears(new Date(), 1));

  // ── 3. COST / AMOUNT ──────────────────────────────────────
  const costPatterns = [
    /(?:total\s*amount|amount\s*paid|amount|fee|premium|sum|price|charges?|cost)[\s:=₹$€£]*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/,
    /([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:rs\.?|inr|₹)/i,
  ];
  const currencyMap = { '₹': 'INR', inr: 'INR', rs: 'INR', '$': 'USD', '€': 'EUR', '£': 'GBP' };

  for (const pat of costPatterns) {
    const m = text.match(pat);
    if (m) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0 && val < 100000000) {
        result.cost = val;
        result.confidence.cost = 'high';
        // Detect currency
        if (m[0].includes('$')) result.currency = 'USD';
        else if (m[0].includes('€')) result.currency = 'EUR';
        else if (m[0].includes('£')) result.currency = 'GBP';
        break;
      }
    }
  }

  // ── 4. TITLE ─────────────────────────────────────────────
  // Check for common document title patterns
  const titlePatterns = [
    /(?:certificate\s+of\s+[\w\s]+)/i,
    /(?:[\w\s]+\s+(?:agreement|contract|license|policy|permit|warranty|certification))/i,
    /(?:(?:annual|monthly|weekly)\s+[\w\s]+\s+(?:subscription|plan|service|support|maintenance))/i,
  ];
  for (const pat of titlePatterns) {
    const m = text.match(pat);
    if (m && m[0].trim().length > 5 && m[0].trim().length < 80) {
      result.title = m[0].trim().replace(/\s+/g, ' ');
      result.confidence.title = 'medium';
      break;
    }
  }

  // Fallback: use first meaningful line
  if (!result.title) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5 && l.length < 80 && !/^https?:\/\//.test(l) && !/^\d+$/.test(l));
    if (lines.length > 0) {
      result.title = lines[0].replace(/[^a-zA-Z0-9 &.,\-:]/g, ' ').replace(/\s+/g, ' ').trim();
      result.confidence.title = 'low';
    }
  }

  // Clean up title
  result.title = result.title.slice(0, 100).replace(/\s+/g, ' ').trim();

  // ── 5. ISSUER ─────────────────────────────────────────────
  const issuerPatterns = [
    /(?:issued\s*by|issuer|certif(?:ied|ying)\s*authority|authority|provider|vendor|company|organization|from)[\s:=]*([A-Z][A-Za-z0-9 ,.\-&'()]+?)(?:\n|$|,\s*\n)/i,
    /(?:this\s+(?:is\s+to\s+)?certify\s+that|this\s+certifies?\s+that).*?(?:by|from)\s+([A-Z][A-Za-z ]+)/i,
  ];
  for (const pat of issuerPatterns) {
    const m = text.match(pat);
    if (m && m[1].trim().length > 2 && m[1].trim().length < 80) {
      result.issuer = m[1].trim();
      result.confidence.issuer = 'medium';
      break;
    }
  }

  // Detect known issuers by domain/keyword
  const knownIssuers = [
    { kw: ['iit madras', 'iitm', 'gate', 'goaps.iitm'], issuer: 'IIT Madras / GATE Office' },
    { kw: ['amazon web services', 'aws'], issuer: 'Amazon Web Services' },
    { kw: ['microsoft'], issuer: 'Microsoft Corporation' },
    { kw: ['google'], issuer: 'Google LLC' },
    { kw: ['hdfc'], issuer: 'HDFC Bank' },
    { kw: ['icici'], issuer: 'ICICI Bank' },
    { kw: ['sbi', 'state bank'], issuer: 'State Bank of India' },
    { kw: ['lic', 'life insurance corporation'], issuer: 'LIC India' },
    { kw: ['cisco'], issuer: 'Cisco Systems' },
    { kw: ['oracle'], issuer: 'Oracle Corporation' },
    { kw: ['salesforce'], issuer: 'Salesforce' },
    { kw: ['ministry of', 'government of', 'govt of', 'department of'], issuer: null /* extract from line */ },
  ];
  if (!result.issuer) {
    for (const { kw, issuer } of knownIssuers) {
      if (kw.some(k => lower.includes(k))) {
        result.issuer = issuer || '';
        if (!result.issuer) {
          const m = text.match(/(?:ministry|department|government)\s+of\s+[a-z\s]+/i);
          if (m) result.issuer = m[0].trim();
        }
        if (result.issuer) { result.confidence.issuer = 'high'; break; }
      }
    }
  }

  // ── 6. TAGS ───────────────────────────────────────────────
  const tagKeywords = {
    Finance:       ['invoice', 'payment', 'receipt', 'tax', 'gst', 'bank', 'transaction'],
    Legal:         ['agreement', 'contract', 'nda', 'mou', 'legal', 'clause', 'terms'],
    IT:            ['aws', 'cloud', 'software', 'license', 'subscription', 'api', 'server', 'domain'],
    HR:            ['employee', 'offer letter', 'appointment', 'salary', 'payroll', 'insurance'],
    Education:     ['certificate', 'course', 'exam', 'gate', 'admit card', 'university', 'college'],
    Facility:      ['lease', 'rent', 'office', 'property', 'premises'],
    Insurance:     ['insurance', 'policy', 'premium', 'coverage', 'claim'],
  };
  for (const [tag, kws] of Object.entries(tagKeywords)) {
    if (kws.some(kw => lower.includes(kw))) result.tags.push(tag);
  }

  // ── 7. NOTES ─────────────────────────────────────────────
  const noteLines = [];
  const nameMatch   = text.match(/(?:name|applicant|holder|insured|employee)[\s:=]+([A-Z][A-Za-z ]+?)(?:\n|$)/i);
  const txnMatch    = text.match(/(?:transaction\s*(?:id|no|number)|txn\s*id|ref\s*(?:no|number)|bank\s*ref)[\s:=]*([A-Z0-9]+)/i);
  const enrollMatch = text.match(/(?:enrollment|registration|application|policy|id|number)[\s:=]+([A-Z0-9]+)/i);

  if (nameMatch)   noteLines.push('Name: ' + nameMatch[1].trim());
  if (enrollMatch) noteLines.push('ID: ' + enrollMatch[1].trim());
  if (txnMatch)    noteLines.push('Transaction: ' + txnMatch[1].trim());
  result.notes = noteLines.join(' | ');

  // ── 8. DESCRIPTION ────────────────────────────────────────
  result.description = `Auto-parsed from uploaded document. Type: ${result.type}. Issuer: ${result.issuer || 'Unknown'}.`;

  // ── 9. REMINDER DAYS based on type ───────────────────────
  const reminderMap = { Insurance: 60, Contract: 45, License: 30, Certification: 30, Warranty: 30, Permit: 30, Other: 30 };
  result.reminderDays = reminderMap[result.type] || 30;

  return result;
}

// ─────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────
async function parseUploadedDocument(filePath) {
  try {
    const ext = filePath.toLowerCase().split('.').pop();
    if (ext !== 'pdf') {
      return { success: false, message: 'Only PDF files can be auto-parsed. Please fill in the details manually.' };
    }
    const text = await extractPDFText(filePath);
    if (!text || text.trim().length < 10) {
      return { success: false, message: 'Could not extract text from this PDF. Please fill in the details manually.' };
    }
    const parsed = parseDocumentData(text);
    return { success: true, parsed, rawTextLength: text.length };
  } catch (err) {
    console.error('[DocumentParser] Error:', err.message);
    return { success: false, message: 'Parse error: ' + err.message };
  }
}

module.exports = { parseUploadedDocument };
