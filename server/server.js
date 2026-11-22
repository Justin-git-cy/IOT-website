// server/server.js - Pharma Cold-Chain Monitor Backend
// Based on 4-Day Build Plan: ESP32 + Node.js + Express + React/Vanilla UI
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
  secret: process.env.SESSION_SECRET || 'pharma_cold_chain_secret_2026',
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

// Seed default accounts
(async () => {
  const adminHash = await bcrypt.hash('Admin@123', 10);
  users.push({
    id: uuidv4(),
    name: 'Sumukh (Lead Researcher)',
    email: 'admin@pharmachain.com',
    password: adminHash,
    role: 'Lead Engineer',
    organization: 'Pharma Cold-Chain Project'
  });

  const demoHash = await bcrypt.hash('Demo@123', 10);
  users.push({
    id: uuidv4(),
    name: 'Dr. Anita Rao',
    email: 'demo@pharmachain.com',
    password: demoHash,
    role: 'Quality Auditor',
    organization: 'Vaccine Cold Storage Lab'
  });
  console.log('✅ Default users seeded.');
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
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'pharma_secret');
      const user = users.find(u => u.id === decoded.id);
      if (user) {
        req.user = user;
        return next();
      }
    } catch (e) {}
  }
  return res.status(401).json({ error: 'Authentication required. Please sign in.' });
}

// ─── Cold-Chain Core Engine (From PDF Specs) ──────────────────────────────────
// 1. In-memory readings log (last 200)
const readings = [];

// 2. Diagnosis history (last 60 readings for slope detection)
const history = [];

// 3. Spoilage Clock state
let excursionSec = 0;
let lastTs = null;
let BUDGET_SEC = 30 * 60; // 30 minutes default. 120s in demo mode
let currentBatchName = 'Covaxin Batch #V-2026-11';

// 4. Tamper-Evident Hash Chain
const chain = [];
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function addRecord(reading) {
  const prev = chain.length ? chain[chain.length - 1].hash : 'GENESIS';
  const record = {
    ...reading,
    prev,
    hash: sha(prev + JSON.stringify(reading))
  };
  chain.push(record);
  return record;
}

function verifyChain() {
  let prev = 'GENESIS';
  for (let i = 0; i < chain.length; i++) {
    const { prev: p, hash, ...reading } = chain[i];
    if (p !== prev || sha(prev + JSON.stringify(reading)) !== hash) {
      return { ok: false, brokenAt: i, total: chain.length, lastHash: hash };
    }
    prev = hash;
  }
  return { ok: true, length: chain.length, lastHash: prev };
}

// Spoilage Clock calculation (capped at 60s per gap as specified in PDF)
function updateClock(r, now) {
  if (lastTs && r.temp > 8.0) {
    excursionSec += Math.min((now - lastTs) / 1000, 60);
  }
  lastTs = now;
  const used = excursionSec / BUDGET_SEC;
  const state = used >= 1.0 ? 'QUARANTINE: do not use' : used >= 0.5 ? 'CAUTION' : 'SAFE';
  return { excursionSec: Math.round(excursionSec), used: Math.min(used, 1), state, budgetSec: BUDGET_SEC };
}

// Smart Diagnosis Rule Engine (From Page 8 of PDF)
function diagnose(r) {
  history.push({ ...r, ts: r.ts || Date.now() });
  if (history.length > 60) history.shift();

  const recent = history.slice(-12); // ~2 minutes at 10s per reading
  const rising = recent.length >= 12 && (recent[recent.length - 1].temp - recent[0].temp > 1.0);

  if (r.temp < 2.0) {
    return { level: 'warn', cause: 'Freezing risk', code: 'FREEZING_RISK' };
  }
  if (r.temp <= 8.0) {
    return { level: 'ok', cause: 'Normal', code: 'NORMAL' };
  }
  if (r.door) {
    return { level: 'alert', cause: 'Door left open', code: 'DOOR_OPEN' };
  }
  if (!r.mains) {
    return { level: 'alert', cause: 'Power cut', code: 'POWER_CUT' };
  }
  if (rising) {
    return { level: 'alert', cause: 'Possible compressor failure', code: 'COMPRESSOR_FAILURE' };
  }
  return { level: 'warn', cause: 'Temperature high, cause unclear', code: 'TEMP_HIGH_UNCLEAR' };
}

// Seed initial baseline readings so dashboard has rich history immediately
function seedBaselineData() {
  const now = Date.now();
  for (let i = 24; i >= 1; i--) {
    const reading = {
      ts: now - i * 10000,
      temp: +(3.8 + Math.sin(i / 3) * 1.2).toFixed(1),
      door: false,
      mains: true,
      uptime: 3000 + (25 - i) * 10
    };
    readings.push(reading);
    history.push(reading);
    addRecord(reading);
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
      role: role || 'Field Monitor',
      organization: organization || 'Pharma Lab'
    };
    users.push(user);
    req.session.userId = user.id;
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'pharma_secret', { expiresIn: '24h' });
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
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'pharma_secret', { expiresIn: '24h' });
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

// ─── Cold-Chain Device & Monitoring API (Page 5-6 of PDF) ────────────────────

// POST /api/reading - Receives reading from ESP32 or Simulator
app.post('/api/reading', (req, res) => {
  try {
    const { temp, door, mains, uptime } = req.body;
    if (temp === undefined) {
      return res.status(400).json({ error: 'Missing temp parameter in reading payload.' });
    }

    const now = Date.now();
    const reading = {
      ts: now,
      temp: parseFloat(temp),
      door: Boolean(door),
      mains: mains !== undefined ? Boolean(mains) : true,
      uptime: uptime ? parseInt(uptime) : Math.floor(process.uptime())
    };

    // 1. Run diagnosis
    const diag = diagnose(reading);

    // 2. Update Spoilage Clock
    const clock = updateClock(reading, now);

    // 3. Store in hash chain
    const chained = addRecord({
      ts: reading.ts,
      temp: reading.temp,
      door: reading.door,
      mains: reading.mains
    });

    // 4. Keep in readings array
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

// GET /api/readings - Returns last 200 readings
app.get('/api/readings', (req, res) => {
  res.json(readings.slice(-200));
});

// GET /api/status - Latest reading + diagnosis + spoilage clock + chain status
app.get('/api/status', (req, res) => {
  const latest = readings[readings.length - 1] || null;
  const now = Date.now();
  let isOffline = false;

  // Offline detection: if no reading for 60 seconds (Page 2 & 8 of PDF)
  if (latest && (now - latest.ts > 60000)) {
    isOffline = true;
  }

  const diag = latest ? (isOffline ? { level: 'alert', cause: 'Device offline', code: 'OFFLINE' } : latest.diagnosis) : null;
  const used = excursionSec / BUDGET_SEC;
  const spoilageState = used >= 1.0 ? 'QUARANTINE: do not use' : used >= 0.5 ? 'CAUTION' : 'SAFE';
  const chainCheck = verifyChain();

  res.json({
    latest,
    isOffline,
    secondsSinceLastPing: latest ? Math.round((now - latest.ts) / 1000) : null,
    diagnosis: diag,
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

// GET /api/verify - Validates tamper-evident hash chain (Page 6 of PDF)
app.get('/api/verify', (req, res) => {
  const result = verifyChain();
  res.json(result);
});

// POST /api/tamper/:i - Demo-only route to alter an old reading and break the chain live! (Page 6 & 11)
app.post('/api/tamper/:i', (req, res) => {
  const index = parseInt(req.params.i);
  if (isNaN(index) || index < 0 || index >= chain.length) {
    return res.status(400).json({ error: `Invalid index. Must be between 0 and ${chain.length - 1}` });
  }

  // Tamper the record's temperature
  const originalTemp = chain[index].temp;
  chain[index].temp = +(originalTemp + 5.5).toFixed(1);

  // Also update in readings array if found
  if (readings[index]) {
    readings[index].temp = chain[index].temp;
  }

  const check = verifyChain();
  res.json({
    message: `Record #${index} was tampered! Temperature changed from ${originalTemp}°C to ${chain[index].temp}°C.`,
    tamperedIndex: index,
    verification: check
  });
});

// POST /api/chain/reset - Restore/repair chain back to valid state
app.post('/api/chain/reset', (req, res) => {
  chain.length = 0;
  let prev = 'GENESIS';
  for (let r of readings) {
    const raw = { ts: r.ts, temp: r.temp, door: r.door, mains: r.mains };
    const h = sha(prev + JSON.stringify(raw));
    chain.push({ ...raw, prev, hash: h });
    r.hash = h;
    prev = h;
  }
  res.json({ message: 'Hash chain recalculated and repaired.', verification: verifyChain() });
});

// POST /api/spoilage/reset - Reset Spoilage Clock for a new medicine batch (Page 6 of PDF)
app.post('/api/spoilage/reset', (req, res) => {
  const { batchName, budgetSec } = req.body || {};
  excursionSec = 0;
  lastTs = null;
  if (batchName) currentBatchName = batchName;
  if (budgetSec) BUDGET_SEC = parseInt(budgetSec);
  res.json({
    message: 'Spoilage clock reset for new batch',
    batch: currentBatchName,
    budgetSec: BUDGET_SEC,
    excursionSec: 0,
    verdict: 'SAFE'
  });
});

// POST /api/spoilage/budget - Set budget (e.g. 120s for demo, 1800s for real)
app.post('/api/spoilage/budget', (req, res) => {
  const { seconds } = req.body;
  if (!seconds || seconds <= 0) return res.status(400).json({ error: 'Valid seconds required' });
  BUDGET_SEC = parseInt(seconds);
  res.json({ message: `Budget updated to ${BUDGET_SEC} seconds`, budgetSec: BUDGET_SEC });
});

// ─── PDF Compliance Report Generator (Page 9 & 10 of PDF) ────────────────────
app.get('/api/report.pdf', (req, res) => {
  try {
    const v = verifyChain();
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Pharma_Cold_Chain_Compliance_Report.pdf"');
    doc.pipe(res);

    // Header styling
    doc.rect(0, 0, doc.page.width, 100).fill('#0a192f');
    doc.fillColor('#00bcd4').fontSize(22).font('Helvetica-Bold')
      .text('PHARMA COLD-CHAIN MONITOR', 50, 30);
    doc.fillColor('#e6f1ff').fontSize(11).font('Helvetica')
      .text('Official Temperature Compliance & Chain-of-Custody Audit Report', 50, 60);

    doc.moveDown(4);

    // Metadata Card
    doc.fillColor('#2d3748').fontSize(14).font('Helvetica-Bold')
      .text('1. Audit Metadata');
    doc.moveDown(0.5);

    const nowStr = new Date().toLocaleString();
    doc.fontSize(10).font('Helvetica')
      .fillColor('#4a5568')
      .text(`Generated At: ${nowStr}`)
      .text(`Monitored Batch: ${currentBatchName}`)
      .text(`Compliant Range: +2.0°C to +8.0°C (WHO & FDA Standards)`)
      .text(`Total Records Logged: ${chain.length}`)
      .text(`Total Excursion Time: ${Math.round(excursionSec / 60)} minutes (${excursionSec} seconds)`)
      .text(`Spoilage Clock Verdict: ${excursionSec >= BUDGET_SEC ? 'QUARANTINE (DO NOT USE)' : excursionSec >= BUDGET_SEC * 0.5 ? 'CAUTION' : 'SAFE'}`);

    doc.moveDown(1.5);

    // Cryptographic Chain Verification Box
    doc.fillColor('#2d3748').fontSize(14).font('Helvetica-Bold')
      .text('2. Tamper-Evident Hash Chain Audit');
    doc.moveDown(0.5);

    const isVerified = v.ok;
    const boxColor = isVerified ? '#e6fffa' : '#fff5f5';
    const strokeColor = isVerified ? '#38b2ac' : '#e53e3e';
    const textColor = isVerified ? '#234e52' : '#742a2a';

    const yBox = doc.y;
    doc.rect(50, yBox, 500, 50).fillAndStroke(boxColor, strokeColor);
    doc.fillColor(textColor).fontSize(11).font('Helvetica-Bold')
      .text(`Status: ${isVerified ? 'VERIFIED (Chain Integrity Intact)' : 'TAMPER DETECTED at Record #' + v.brokenAt}`, 65, yBox + 12);
    doc.fontSize(9).font('Helvetica')
      .text(`Final SHA-256 Block Hash: ${v.lastHash || 'n/a'}`, 65, yBox + 28);

    doc.moveDown(3);

    // Excursions Summary
    doc.fillColor('#2d3748').fontSize(14).font('Helvetica-Bold')
      .text('3. Temperature Excursion Log (Recent Out of Range)');
    doc.moveDown(0.5);

    const excursions = readings.filter(r => r.temp > 8.0 || r.temp < 2.0).slice(-10);
    if (excursions.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#38a169')
        .text('No critical temperature excursions recorded. Fridge has remained within safe +2°C to +8°C bounds.');
    } else {
      excursions.forEach((ex, idx) => {
        const time = new Date(ex.ts).toLocaleTimeString();
        const cause = ex.diagnosis ? ex.diagnosis.cause : 'Unknown';
        doc.fontSize(9).font('Helvetica').fillColor('#2d3748')
          .text(`• [${time}] Temp: ${ex.temp}°C | Door: ${ex.door ? 'OPEN' : 'CLOSED'} | Mains: ${ex.mains ? 'ON' : 'OFF'} | Cause: ${cause}`);
      });
    }

    doc.moveDown(2);

    // Hardware Bill of Materials & Architecture Summary
    doc.fillColor('#2d3748').fontSize(14).font('Helvetica-Bold')
      .text('4. Device Specifications & BOM');
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica').fillColor('#4a5568')
      .text('Microcontroller: ESP32 DevKit 38-pin (Dual Core Tensilica Xtensa)')
      .text('Sensors: DS18B20 1-Wire Waterproof Probe (GPIO4) + Magnetic Reed Switch (GPIO14)')
      .text('Display & Indicators: 0.96" I2C SSD1306 OLED (GPIO21/22), Active Buzzer (GPIO18), Dual LED (GPIO25/26)')
      .text('Power Sensing: Voltage divider on GPIO34 for mains power-cut detection')
      .text('Total Hardware Prototype BOM Cost: ₹1,500 (vs ₹5,000–₹20,000 commercial data loggers)');

    doc.moveDown(2);

    // Honest Caveat (Mandatory from Page 1 & 10 of PDF)
    doc.rect(50, doc.y, 500, 36).fillAndStroke('#fffaf0', '#dd6b20');
    doc.fillColor('#7b341e').fontSize(9).font('Helvetica-Bold')
      .text('Honest Prototype Caveat:', 65, doc.y - 28)
      .font('Helvetica')
      .text('This is a prototype with a hobby-grade DS18B20 sensor (±0.5°C), not a certified medical device. The compressor rule is a heuristic based on a steady temperature rise.', 65, doc.y - 15);

    doc.end();
  } catch (err) {
    res.status(500).send('Error generating report: ' + err.message);
  }
});

// ─── Test Simulation Endpoints (For Wokwi & Live Testing) ──────────────────────
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
    // Inject 12 readings rising steadily
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
    temp = 4.5;
    door = false;
    mains = true;
  }

  const reading = { ts: now, temp, door, mains, uptime: Math.floor(process.uptime()) };
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
app.get('/presentation', (req, res) => res.sendFile(path.join(__dirname, '../public/presentation.html')));
app.get('/audit', (req, res) => res.sendFile(path.join(__dirname, '../public/audit.html')));

// Fallback
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, '../public/index.html')));

// ─── Start Server ─────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`❄️  PHARMA COLD-CHAIN MONITOR SERVER RUNNING`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`======================================================`);
    console.log(`Credentials:`);
    console.log(`  Admin / Lead : admin@pharmachain.com  | Password: Admin@123`);
    console.log(`  Doctor / Demo : demo@pharmachain.com   | Password: Demo@123`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;
