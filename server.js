require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || '';
const DATA_FILE = path.join(__dirname, 'data', 'scans.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadScans() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveScans(scans) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(scans, null, 2), 'utf8');
}

async function forwardToSheets(data) {
  if (!GOOGLE_SCRIPT_URL) return;
  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      redirect: 'follow',
    });
  } catch (e) {
    console.error('Google Sheets sync failed:', e.message);
  }
}

// POST /api/scan
app.post('/api/scan', async (req, res) => {
  const { its, day, hijriDate, gregDate, time, method } = req.body;

  if (!its || !/^\d{8}$/.test(its)) {
    return res.status(400).json({ error: 'ITS must be exactly 8 digits' });
  }
  const dayNum = Number(day);
  if (!dayNum || dayNum < 1 || dayNum > 9) {
    return res.status(400).json({ error: 'Invalid day (1–9)' });
  }

  const scans = loadScans();
  const existing = scans.find(s => s.its === its && s.day === dayNum);
  if (existing) {
    return res.json({ duplicate: true, firstScanTime: existing.time });
  }

  const entry = {
    its,
    day: dayNum,
    hijriDate: hijriDate || '',
    gregDate: gregDate || '',
    time: time || new Date().toLocaleTimeString('en-GB'),
    method: method || 'Manual',
    createdAt: new Date().toISOString(),
  };

  scans.push(entry);
  saveScans(scans);

  // Fire-and-forget — don't block response on Sheets sync
  forwardToSheets(entry).catch(e => console.error('Sheets sync error:', e.message));

  res.json({ success: true, entry });
});

// GET /api/scans?day=N
app.get('/api/scans', (req, res) => {
  const day = req.query.day ? parseInt(req.query.day) : null;
  const scans = loadScans();
  res.json(day ? scans.filter(s => s.day === day) : scans);
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  const scans = loadScans();
  const stats = {};
  for (let i = 1; i <= 9; i++) {
    stats[`day${i}`] = scans.filter(s => s.day === i).length;
  }
  res.json(stats);
});

app.listen(PORT, () => {
  console.log(`ITS Scanner backend → http://localhost:${PORT}`);
  if (!GOOGLE_SCRIPT_URL) console.warn('GOOGLE_SCRIPT_URL not set — Google Sheets sync disabled');
});
