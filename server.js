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

function withTimeout(promise, ms) {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out')), ms)
  );
  return Promise.race([promise, timer]);
}

async function sheetsGet(params) {
  const url = new URL(GOOGLE_SCRIPT_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await withTimeout(fetch(url.toString(), { redirect: 'follow' }), 20000);
  return res.json();
}

async function sheetsPost(data) {
  const res = await withTimeout(fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    redirect: 'follow',
  }), 20000);
  return res.json();
}

// POST /api/scan
app.post('/api/scan', async (req, res) => {
  if (!GOOGLE_SCRIPT_URL) {
    return res.status(503).json({ error: 'GOOGLE_SCRIPT_URL not configured' });
  }

  const { its, day, hijriDate, gregDate, time } = req.body;

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
  };

  try {
    const result = await sheetsPost(entry);
    if (result.duplicate) {
      return res.json({ duplicate: true, firstScanTime: result.firstScanTime });
    }
    res.json({ success: true, entry });
  } catch (err) {
    res.status(502).json({ error: 'Sheets unavailable — ' + err.message });
  }
});

// GET /api/scans?day=N
app.get('/api/scans', async (req, res) => {
  if (!GOOGLE_SCRIPT_URL) return res.json([]);
  try {
    const params = { action: 'scans' };
    if (req.query.day) params.day = req.query.day;
    const scans = await sheetsGet(params);
    res.json(scans);
  } catch { res.json([]); }
});

// GET /api/stats
app.get('/api/stats', async (req, res) => {
  if (!GOOGLE_SCRIPT_URL) {
    return res.json({ day1:0,day2:0,day3:0,day4:0,day5:0,day6:0,day7:0,day8:0,day9:0 });
  }
  try {
    const stats = await sheetsGet({ action: 'stats' });
    res.json(stats);
  } catch { res.json({ day1:0,day2:0,day3:0,day4:0,day5:0,day6:0,day7:0,day8:0,day9:0 }); }
});

app.listen(PORT, () => {
  console.log(`ITS Scanner backend → http://localhost:${PORT}`);
  if (!GOOGLE_SCRIPT_URL) console.warn('GOOGLE_SCRIPT_URL not set — Google Sheets sync disabled');
});
