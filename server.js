// server.js (minimal changes for production)
// — คงโครงเดิมไว้ เพิ่มแค่สิ่งที่จำเป็นสำหรับ Render + MongoDB —

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// ====== Config (สำคัญเวลา deploy) ======
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5500';
const MONGODB_URI = process.env.MONGODB_URI || '';

// ====== Middlewares ======
app.use(express.json());
app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// [เพิ่ม] log ทุก request เพื่อดูใน Render Logs
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// [เพิ่ม] ตอบ preflight ให้ชัด (ปกติ cors() ก็พอ แต่นี่กันไว้)
app.options('/api/submit', cors({ origin: ALLOWED_ORIGIN }));

// ====== Local JSON fallback (เหมือนเดิม) ======
const DATA_FILE = path.join(__dirname, 'data.json');
function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ====== MongoDB (ใช้เมื่อมี MONGODB_URI) ======
let useDB = false;
let Entry = null;

if (MONGODB_URI) {
  mongoose.set('strictQuery', true);
  mongoose.connect(MONGODB_URI, {})
    .then(() => {
      console.log('✅ MongoDB connected');
      useDB = true;
    })
    .catch(err => console.error('❌ MongoDB error:', err.message));

  const entrySchema = new mongoose.Schema({
    riskPercentage: String,
    gender: String,
    age: Number,
    createdAt: { type: Date, default: Date.now }
  }, { versionKey: false });

  Entry = mongoose.models.Entry || mongoose.model('Entry', entrySchema);
}

// Health check
app.get('/', (_req, res) => {
  res.send('Backend is running. Use POST /api/submit and open /admin for summary.');
});

// [เพิ่ม] กันคนเรียก GET /api/submit แล้วสับสน
app.get('/api/submit', (_req, res) => {
  res.status(405).send('Use POST /api/submit');
});

// ====== API เดิม: รับข้อมูล ======
app.post('/api/submit', async (req, res) => {
  const { riskPercentage, gender, age } = req.body || {};
  if (riskPercentage === undefined || gender === undefined || age === undefined) {
    return res.status(400).json({ message: 'Missing data' });
  }

  try {
    if (useDB && Entry) {
      await Entry.create({
        riskPercentage: String(riskPercentage),
        gender,
        age: Number(age)
      });
    } else {
      const data = readData();
      if (!data[riskPercentage]) data[riskPercentage] = [];
      data[riskPercentage].push({ gender, age: Number(age) });
      writeData(data);
    }
    res.json({ message: 'ok' });
  } catch (e) {
    console.error('POST /api/submit error:', e);
    res.status(500).json({ message: 'server error' });
  }
});

// ====== Admin เดิม: สรุปสถิติ ======
app.get('/admin', async (_req, res) => {
  const ageRanges = [
    { label: '1-15', min: 1, max: 15 },
    { label: '16-39', min: 16, max: 39 },
    { label: '40-49', min: 40, max: 49 },
    { label: '50-59', min: 50, max: 59 },
    { label: '60+',  min: 60, max: 150 }
  ];

  let grouped = {};
  try {
    if (useDB && Entry) {
      const all = await Entry.find({}, { riskPercentage: 1, gender: 1, age: 1, _id: 0 }).lean();
      for (const r of all) {
        const key = r.riskPercentage;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push({ gender: r.gender, age: Number(r.age) });
      }
    } else {
      grouped = readData();
    }
  } catch (e) {
    console.error('GET /admin error:', e);
    return res.status(500).send('Admin error');
  }

  const risks = Object.keys(grouped);
  let html = `<table border=1 cellpadding=8><tr>
    <th>Risk %</th>
    <th>ชาย</th><th>หญิง</th><th>ไม่ระบุ</th>
    <th>1-15</th><th>16-39</th><th>40-49</th><th>50-59</th><th>60+</th>
  </tr>`;

  for (let r of risks) {
    const items = Array.isArray(grouped[r]) ? grouped[r] : [];
    const genderCount = { 'ชาย': 0, 'หญิง': 0, 'อื่นๆ': 0 };
    const ageCount = Array(ageRanges.length).fill(0);

    for (const u of items) {
      if (genderCount[u.gender] !== undefined) genderCount[u.gender]++;
      else genderCount['อื่นๆ']++;

      for (let i = 0; i < ageRanges.length; i++) {
        if (u.age >= ageRanges[i].min && u.age <= ageRanges[i].max) {
          ageCount[i]++;
          break;
        }
      }
    }

    html += `<tr><td>${r}</td>
      <td>${genderCount['ชาย']}</td>
      <td>${genderCount['หญิง']}</td>
      <td>${genderCount['อื่นๆ']}</td>
      <td>${ageCount[0]}</td>
      <td>${ageCount[1]}</td>
      <td>${ageCount[2]}</td>
      <td>${ageCount[3]}</td>
      <td>${ageCount[4]}</td>
    </tr>`;
  }
  html += `</table>`;
  res.send(html);
});

app.listen(PORT, () => console.log('Server ready at http://localhost:' + PORT));
