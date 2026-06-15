require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || '';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function sheetsGet(params) {
  const url = new URL(GOOGLE_SCRIPT_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { redirect: 'follow' });
  return res.json();
}

async function sheetsPost(data) {
  const res = await fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    redirect: 'follow',
  });
  return res.json();
}

// POST /api/scan
app.post('/api/scan', async (req, res) => {
  if (!GOOGLE_SCRIPT_URL) {
    return res.status(503).json({ error: 'GOOGLE_SCRIPT_URL not configured' });
  }

  const { its, day, hijriDate, gregDate, time, method } = req.body;

  if (!its || !/^\d{8}$/.test(its)) {
    return res.status(400).json({ error: 'ITS must be exactly 8 digits' });
  }
  const dayNum = Number(day);
  if (!dayNum || dayNum < 1 || dayNum > 9) {
    return res.status(400).json({ error: 'Invalid day (1–9)' });
  }

  const entry = {
    its,
    day: dayNum,
    hijriDate: hijriDate || '',
    gregDate: gregDate || '',
    time: time || new Date().toLocaleTimeString('en-GB'),
    method: method || 'Manual',
  };

  const result = await sheetsPost(entry);
  if (result.duplicate) {
    return res.json({ duplicate: true, firstScanTime: result.firstScanTime });
  }
  res.json({ success: true, entry });
});

// GET /api/scans?day=N
app.get('/api/scans', async (req, res) => {
  if (!GOOGLE_SCRIPT_URL) return res.json([]);
  const params = { action: 'scans' };
  if (req.query.day) params.day = req.query.day;
  const scans = await sheetsGet(params);
  res.json(scans);
});

// GET /api/stats
app.get('/api/stats', async (req, res) => {
  if (!GOOGLE_SCRIPT_URL) {
    return res.json({ day1:0,day2:0,day3:0,day4:0,day5:0,day6:0,day7:0,day8:0,day9:0 });
  }
  const stats = await sheetsGet({ action: 'stats' });
  res.json(stats);
});

app.listen(PORT, () => {
  console.log(`ITS Scanner backend → http://localhost:${PORT}`);
  if (!GOOGLE_SCRIPT_URL) console.warn('GOOGLE_SCRIPT_URL not set — Google Sheets sync disabled');
});
