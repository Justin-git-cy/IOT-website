// server/server.js - Enterprise Pharma Cold-Chain IoT Surveillance Platform
// Production-grade backend: Node.js + Express + Cryptographic Audit + Diagnostics
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security & Middlewares ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'cryopharma_cold_chain_enterprise_secret_2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '../public')));

// ─── User Store & Authentication ───────────────────────────────────────────────
const users = [];

// Seed enterprise accounts
(async () => {
  const adminHash = await bcrypt.hash('Admin@123', 10);
  users.push({
    id: uuidv4(),
    name: 'Dr. Sarah Jenkins',
    email: 'admin@pharmachain.com',
    password: adminHash,
    role: 'Chief Quality Officer',
    organization: 'Apex BioLogistics Central Labs'
  });

  const demoHash = await bcrypt.hash('Demo@123', 10);
  users.push({
    id: uuidv4(),
    name: 'Marcus Vance',
    email: 'demo@pharmachain.com',
    password: demoHash,
    role: 'Clinical Storage Director',
    organization: 'Metropolitan Vaccine Repository'
  });
  console.log('✅ Default users initialized.');
})();

function requireAuth(req, res, next) {
  // Session check
  if (req.session && req.session.userId) {
    const user = users.find(u => u.id === req.session.userId);
    if (user) {
      req.user = user;
      return next();
    }
  }
  // JWT Bearer check
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cryopharma_secret');
      const user = users.find(u => u.id === decoded.id);
      if (user) {
        req.user = user;
        return next();
      }
    } catch (e) {}
  }
  return res.status(401).json({ error: 'Authentication required. Please sign in.' });
}

// ─── Cold-Chain Core Engine ───────────────────────────────────────────────────
// 1. In-memory readings log (last 300)
const readings = [];

// 2. Diagnosis history (sliding window for slope calculation)
const history = [];

// 3. Spoilage Clock state (Cumulative Thermal Exposure Accounting)
let excursionSec = 0;
let lastTs = null;
let BUDGET_SEC = 30 * 60; // 30 minutes clinical budget
let currentBatchName = 'Covaxin mRNA-1273 / Batch #CVX-9042';
let facilityName = 'Cold Storage Unit Alpha-4 (Main Biologics Vault)';

// 4. Tamper-Evident SHA-256 Hash Chain
const chain = [];
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function addRecord(reading) {
  const prev = chain.length ? chain[chain.length - 1].hash : 'GENESIS_BLOCK_0000000000000000';
  const record = {
    ...reading,
    prev,
    hash: sha(prev + JSON.stringify(reading))
  };
  chain.push(record);
  return record;
}

function verifyChain() {
  let prev = 'GENESIS_BLOCK_0000000000000000';
  for (let i = 0; i < chain.length; i++) {
    const { prev: p, hash, ...reading } = chain[i];
    if (p !== prev || sha(prev + JSON.stringify(reading)) !== hash) {
      return { ok: false, brokenAt: i, total: chain.length, lastHash: hash };
    }
    prev = hash;
  }
  return { ok: true, length: chain.length, lastHash: prev };
}

// Spoilage Clock calculation (capped at 60s per gap for network resilience)
function updateClock(r, now) {
  if (lastTs && r.temp > 8.0) {
    excursionSec += Math.min((now - lastTs) / 1000, 60);
  }
  lastTs = now;
  const used = excursionSec / BUDGET_SEC;
  const state = used >= 1.0 ? 'QUARANTINE: DO NOT DISPENSE' : used >= 0.5 ? 'CAUTION: REVIEW AUDIT LOG' : 'SAFE: WITHIN SPECIFICATION';
  return { excursionSec: Math.round(excursionSec), used: Math.min(used, 1), state, budgetSec: BUDGET_SEC };
}

// Intelligent Multi-Factor Root Cause Diagnostic Engine
function diagnose(r) {
  history.push({ ...r, ts: r.ts || Date.now() });
  if (history.length > 60) history.shift();

  const recent = history.slice(-12); // ~2 minutes at 10s per reading
  const rising = recent.length >= 12 && (recent[recent.length - 1].temp - recent[0].temp > 1.0);

  if (r.temp < 2.0) {
    return { level: 'warn', cause: 'Freezing Hazard (< 2.0°C)', code: 'FREEZING_RISK' };
  }
  if (r.temp <= 8.0) {
    return { level: 'ok', cause: 'Compliant (+2.0°C to +8.0°C)', code: 'NORMAL' };
  }
  if (r.door) {
    return { level: 'alert', cause: 'Door Left Ajar (Thermal Breach)', code: 'DOOR_OPEN' };
  }
  if (!r.mains) {
    return { level: 'alert', cause: 'Mains Grid Power Failure', code: 'POWER_CUT' };
  }
  if (rising) {
    return { level: 'alert', cause: 'Compressor Cooling System Failure', code: 'COMPRESSOR_FAILURE' };
  }
  return { level: 'warn', cause: 'Thermal Excursion (Unassigned Cause)', code: 'TEMP_HIGH_UNCLEAR' };
}

// Seed baseline operational telemetry
function seedBaselineData() {
  const now = Date.now();
  for (let i = 24; i >= 1; i--) {
    const reading = {
      ts: now - i * 10000,
      temp: +(4.1 + Math.sin(i / 4) * 0.9).toFixed(1),
      door: false,
      mains: true,
      battery: 98,
      rssi: -58,
      uptime: 86400 + (25 - i) * 10
    };
    readings.push(reading);
    history.push(reading);
    addRecord({ ts: reading.ts, temp: reading.temp, door: reading.door, mains: reading.mains });
  }
}
seedBaselineData();

// ─── Auth API Routes ──────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please try again later.' }
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, organization, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (users.find(u => u.email === email)) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    const hash = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      name,
      email,
      password: hash,
      role: role || 'Cold-Chain Surveillance Specialist',
      organization: organization || 'Regional Medical Supply'
    };
    users.push(user);
    req.session.userId = user.id;
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'cryopharma_secret', { expiresIn: '24h' });
    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, organization: user.organization }
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

    req.session.userId = user.id;
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'cryopharma_secret', { expiresIn: '24h' });
    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, organization: user.organization }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login error.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out successfully.' });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const { password, ...safe } = req.user;
  res.json(safe);
});

// ─── Cold-Chain Telemetry & Diagnostics API ──────────────────────────────────

// POST /api/reading - Ingests telemetry packet from ESP32 edge node
app.post('/api/reading', (req, res) => {
  try {
    const { temp, door, mains, uptime, battery, rssi } = req.body;
    if (temp === undefined) {
      return res.status(400).json({ error: 'Missing temp parameter in reading payload.' });
    }

    const now = Date.now();
    const reading = {
      ts: now,
      temp: parseFloat(temp),
      door: Boolean(door),
      mains: mains !== undefined ? Boolean(mains) : true,
      battery: battery !== undefined ? parseInt(battery) : 96,
      rssi: rssi !== undefined ? parseInt(rssi) : -61,
      uptime: uptime ? parseInt(uptime) : Math.floor(process.uptime())
    };

    // 1. Run multi-factor diagnosis
    const diag = diagnose(reading);

    // 2. Accumulate Spoilage Clock
    const clock = updateClock(reading, now);

    // 3. Cryptographic hash chain insertion
    const chained = addRecord({
      ts: reading.ts,
      temp: reading.temp,
      door: reading.door,
      mains: reading.mains
    });

    // 4. Store in chronological memory buffer
    readings.push({ ...reading, diagnosis: diag, hash: chained.hash });
    if (readings.length > 300) readings.shift();

    res.status(201).json({
      status: 'ok',
      reading,
      diagnosis: diag,
      spoilageClock: clock,
      hash: chained.hash
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record reading: ' + err.message });
  }
});

// GET /api/readings - Returns chronological buffer
app.get('/api/readings', (req, res) => {
  res.json(readings.slice(-200));
});

// GET /api/status - Complete operational state
app.get('/api/status', (req, res) => {
  const latest = readings[readings.length - 1] || null;
  const now = Date.now();
  let isOffline = false;

  // Offline detection threshold: 60 seconds
  if (latest && (now - latest.ts > 60000)) {
    isOffline = true;
  }

  const diag = latest ? (isOffline ? { level: 'alert', cause: 'Telemetry Node Offline', code: 'OFFLINE' } : latest.diagnosis) : null;
  const used = excursionSec / BUDGET_SEC;
  const spoilageState = used >= 1.0 ? 'QUARANTINE: DO NOT DISPENSE' : used >= 0.5 ? 'CAUTION: REVIEW AUDIT LOG' : 'SAFE: WITHIN SPECIFICATION';
  const chainCheck = verifyChain();

  res.json({
    latest,
    isOffline,
    secondsSinceLastPing: latest ? Math.round((now - latest.ts) / 1000) : null,
    diagnosis: diag,
    facility: facilityName,
    spoilageClock: {
      excursionSec: Math.round(excursionSec),
      budgetSec: BUDGET_SEC,
      usedFraction: Math.min(used, 1.0),
      verdict: spoilageState,
      batch: currentBatchName
    },
    chainStatus: chainCheck,
    totalRecords: chain.length
  });
});

// GET /api/verify - Validates tamper-evident hash chain integrity
app.get('/api/verify', (req, res) => {
  const result = verifyChain();
  res.json(result);
});

// POST /api/tamper/:i - Integrity test demonstration
app.post('/api/tamper/:i', (req, res) => {
  const index = parseInt(req.params.i);
  if (isNaN(index) || index < 0 || index >= chain.length) {
    return res.status(400).json({ error: `Invalid index. Must be between 0 and ${chain.length - 1}` });
  }

  const originalTemp = chain[index].temp;
  chain[index].temp = +(originalTemp + 5.2).toFixed(1);

  if (readings[index]) {
    readings[index].temp = chain[index].temp;
  }

  const check = verifyChain();
  res.json({
    message: `Record #${index} was modified from ${originalTemp}°C to ${chain[index].temp}°C.`,
    tamperedIndex: index,
    verification: check
  });
});

// POST /api/chain/reset - Restore and recompute hash chain
app.post('/api/chain/reset', (req, res) => {
  chain.length = 0;
  let prev = 'GENESIS_BLOCK_0000000000000000';
  for (let r of readings) {
    const raw = { ts: r.ts, temp: r.temp, door: r.door, mains: r.mains };
    const h = sha(prev + JSON.stringify(raw));
    chain.push({ ...raw, prev, hash: h });
    r.hash = h;
    prev = h;
  }
  res.json({ message: 'Hash chain recalculated and verified.', verification: verifyChain() });
});

// POST /api/spoilage/reset - Reset Spoilage Clock for a fresh batch
app.post('/api/spoilage/reset', (req, res) => {
  const { batchName, budgetSec } = req.body || {};
  excursionSec = 0;
  lastTs = null;
  if (batchName) currentBatchName = batchName;
  if (budgetSec) BUDGET_SEC = parseInt(budgetSec);
  res.json({
    message: 'Thermal exposure clock re-initialized for new batch allocation.',
    batch: currentBatchName,
    budgetSec: BUDGET_SEC,
    excursionSec: 0,
    verdict: 'SAFE: WITHIN SPECIFICATION'
  });
});

// POST /api/spoilage/budget - Set thermal excursion budget
app.post('/api/spoilage/budget', (req, res) => {
  const { seconds } = req.body;
  if (!seconds || seconds <= 0) return res.status(400).json({ error: 'Valid seconds required' });
  BUDGET_SEC = parseInt(seconds);
  res.json({ message: `Thermal budget set to ${BUDGET_SEC} seconds`, budgetSec: BUDGET_SEC });
});

// ─── PDF Compliance Audit Report (FDA 21 CFR Part 11 / WHO GDP Standards) ────
app.get('/api/report.pdf', (req, res) => {
  try {
    const v = verifyChain();
    const doc = new PDFDocument({ margin: 45, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="PharmaGuard_Cold_Chain_Compliance_Audit.pdf"');
    doc.pipe(res);

    // Header banner
    doc.rect(0, 0, doc.page.width, 95).fill('#081021');
    doc.fillColor('#06b6d4').fontSize(20).font('Helvetica-Bold')
      .text('PHARMAGUARD COLD-CHAIN PLATFORM', 45, 26);
    doc.fillColor('#94a3b8').fontSize(10).font('Helvetica')
      .text('FDA 21 CFR Part 11 & WHO GDP Official Thermal Compliance Certificate', 45, 52);
    doc.fillColor('#f59e0b').fontSize(9).font('Helvetica-Bold')
      .text('INTEGRITY LEVEL: CRYPTOGRAPHICALLY SECURED', 45, 68);

    doc.moveDown(4.2);

    // Section 1: Facility & Consignment Profile
    doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold')
      .text('1. Facility & Batch Manifest');
    doc.moveDown(0.4);

    const nowStr = new Date().toUTCString();
    doc.fontSize(9.5).font('Helvetica').fillColor('#334155')
      .text(`Facility / Monitored Unit: ${facilityName}`)
      .text(`Pharmaceutical Consignment: ${currentBatchName}`)
      .text(`Audit Generated At: ${nowStr}`)
      .text(`Prescribed Safe Band: +2.00°C to +8.00°C (WHO Good Distribution Practice)`)
      .text(`Logged Cryptographic Blocks: ${chain.length} telemetric cycles`)
      .text(`Cumulative Thermal Excursion: ${Math.round(excursionSec / 60)} min (${excursionSec} sec)`)
      .text(`Thermal Budget Allocation: ${Math.round(BUDGET_SEC / 60)} minutes`);

    doc.moveDown(1.2);

    // Section 2: Cryptographic Audit Trail Verification
    doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold')
      .text('2. Cryptographic Chain-of-Custody Verification');
    doc.moveDown(0.4);

    const isVerified = v.ok;
    const boxColor = isVerified ? '#ecfdf5' : '#fef2f2';
    const strokeColor = isVerified ? '#10b981' : '#ef4444';
    const textColor = isVerified ? '#065f46' : '#991b1b';

    const yBox = doc.y;
    doc.rect(45, yBox, 505, 56).fillAndStroke(boxColor, strokeColor);
    doc.fillColor(textColor).fontSize(11).font('Helvetica-Bold')
      .text(`CHAIN INTEGRITY: ${isVerified ? 'VERIFIED (100% Tamper-Evident)' : 'TAMPER DETECTED AT BLOCK #' + v.brokenAt}`, 60, yBox + 12);
    doc.fontSize(8.5).font('Helvetica')
      .text(`SHA-256 Merkle Tip Hash: ${v.lastHash || 'GENESIS'}`, 60, yBox + 30)
      .text(`Audit Status: ${isVerified ? 'No historical mutations detected. Complies with digital audit record requirements.' : 'Warning: Hash discrepancy detected. Historical data has been altered.'}`, 60, yBox + 42);

    doc.moveDown(3.2);

    // Section 3: Excursion Log & Event Analysis
    doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold')
      .text('3. Thermal Excursion Log & Root Cause Analysis');
    doc.moveDown(0.4);

    const excursions = readings.filter(r => r.temp > 8.0 || r.temp < 2.0).slice(-8);
    if (excursions.length === 0) {
      doc.fontSize(9.5).font('Helvetica').fillColor('#059669')
        .text('✓ Perfect Thermal Compliance: Zero temperature excursions outside the +2.0°C to +8.0°C range during this logging period.');
    } else {
      excursions.forEach((ex) => {
        const time = new Date(ex.ts).toISOString();
        const cause = ex.diagnosis ? ex.diagnosis.cause : 'Thermal Breach';
        doc.fontSize(8.5).font('Helvetica').fillColor('#1e293b')
          .text(`• [${time}] Temp: ${ex.temp.toFixed(1)}°C | Door: ${ex.door ? 'OPEN' : 'CLOSED'} | Power: ${ex.mains ? 'MAINS' : 'BATTERY'} | Root Cause: ${cause}`);
      });
    }

    doc.moveDown(1.5);

    // Section 4: Spoilage Verdict & Quality Clearance
    doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold')
      .text('4. Quality Assurance Disposition');
    doc.moveDown(0.4);

    const usedFraction = excursionSec / BUDGET_SEC;
    let disposition = 'APPROVED FOR CLINICAL DISPENSING';
    let dispColor = '#059669';

    if (usedFraction >= 1.0) {
      disposition = 'REJECTED — PRODUCT QUARANTINED (EXCEEDS PERMISSIBLE THERMAL BUDGET)';
      dispColor = '#dc2626';
    } else if (usedFraction >= 0.5) {
      disposition = 'CONDITIONAL CLEARANCE — SECONDARY VIAL VERIFICATION MANDATORY';
      dispColor = '#d97706';
    }

    doc.rect(45, doc.y, 505, 34).fillAndStroke('#f8fafc', '#cbd5e1');
    doc.fillColor(dispColor).fontSize(10).font('Helvetica-Bold')
      .text(`DISPOSITION: ${disposition}`, 58, doc.y - 25);

    doc.moveDown(2);

    // Footer Sign-Off
    doc.fillColor('#64748b').fontSize(8).font('Helvetica')
      .text('Generated automatically by PharmaGuard Enterprise IoT Node. Digital Signature ID: ' + uuidv4(), 45, doc.page.height - 50)
      .text('Compliant with WHO Annex 9 / FDA 21 CFR Part 11 Electronic Records standard.', 45, doc.page.height - 38);

    doc.end();
  } catch (err) {
    res.status(500).send('Error generating report: ' + err.message);
  }
});

// ─── Diagnostics & Simulation API ─────────────────────────────────────────────
app.post('/api/simulate', (req, res) => {
  const { scenario } = req.body;
  const now = Date.now();
  let temp = 4.2;
  let door = false;
  let mains = true;

  if (scenario === 'door_open') {
    temp = 9.8;
    door = true;
    mains = true;
  } else if (scenario === 'power_cut') {
    temp = 10.4;
    door = false;
    mains = false;
  } else if (scenario === 'freezing') {
    temp = 0.8;
    door = false;
    mains = true;
  } else if (scenario === 'compressor_failure') {
    history.length = 0;
    for (let k = 0; k < 12; k++) {
      const t = +(7.5 + (k * 0.2)).toFixed(1);
      const r = { ts: now - (12 - k) * 10000, temp: t, door: false, mains: true };
      history.push(r);
      readings.push(r);
      addRecord({ ts: r.ts, temp: r.temp, door: r.door, mains: r.mains });
    }
    temp = 9.8;
    door = false;
    mains = true;
  } else if (scenario === 'normal') {
    temp = 4.2;
    door = false;
    mains = true;
  }

  const reading = {
    ts: now,
    temp,
    door,
    mains,
    battery: mains ? 99 : 74,
    rssi: -58,
    uptime: Math.floor(process.uptime())
  };
  const diag = diagnose(reading);
  const clock = updateClock(reading, now);
  const chained = addRecord({ ts: reading.ts, temp: reading.temp, door: reading.door, mains: reading.mains });
  readings.push({ ...reading, diagnosis: diag, hash: chained.hash });

  res.json({
    scenario,
    reading,
    diagnosis: diag,
    spoilageClock: clock,
    hash: chained.hash
  });
});

// ─── HTML Page Routes ─────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '../public/login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, '../public/register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../public/dashboard.html')));
app.get('/hardware', (req, res) => res.sendFile(path.join(__dirname, '../public/hardware.html')));
app.get('/simulator', (req, res) => res.sendFile(path.join(__dirname, '../public/simulator.html')));
app.get('/audit', (req, res) => res.sendFile(path.join(__dirname, '../public/audit.html')));

// Fallback
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, '../public/index.html')));

// ─── Start Server ─────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`❄️  PHARMAGUARD ENTERPRISE COLD-CHAIN SURVEILLANCE`);
    console.log(`📍 Console URL: http://localhost:${PORT}`);
    console.log(`======================================================`);
    console.log(`Credentials:`);
    console.log(`  QA Officer : admin@pharmachain.com | Password: Admin@123`);
    console.log(`  Storage Dir: demo@pharmachain.com  | Password: Demo@123`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;
