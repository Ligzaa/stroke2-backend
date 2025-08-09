// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;
app.use(express.json());
// Enable CORS
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); // หรือเจาะจงเฉพาะ 'http://127.0.0.1:5500'
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
});


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

app.post('/api/submit', (req, res) => {
    const { riskPercentage, gender, age } = req.body;
    if (!riskPercentage || !gender || !age) {
        return res.status(400).json({ message: 'Missing data' });
    }
    const data = readData();
    if (!data[riskPercentage]) data[riskPercentage] = [];
    data[riskPercentage].push({ gender, age: Number(age) });
    writeData(data);
    res.json({ message: 'ok' });
});

// Admin สรุปสถิติแบบละเอียด
app.get('/admin', (req, res) => {
    const data = readData();
    // กำหนดกลุ่มอายุ
    const ageRanges = [
        { label: '1-15', min: 1, max: 15 },
        { label: '16-39', min: 16, max: 39 },
        { label: '40-49', min: 40, max: 49 },
        { label: '50-59', min: 50, max: 59 },
        { label: '60+', min: 60, max: 150 }
    ];
    const risks = Object.keys(data);
    let html = `<table border=1 cellpadding=8><tr>
        <th>Risk %</th>
        <th>ชาย</th><th>หญิง</th><th>ไม่ระบุ</th>
        <th>1-15</th><th>16-39</th><th>40-49</th><th>50-59</th><th>60+</th>
    </tr>`;
    for (let r of risks) {
        const items = Array.isArray(data[r]) ? data[r] : [];
        const genderCount = { 'ชาย': 0, 'หญิง': 0, 'อื่นๆ': 0 };
        const ageCount = [0, 0, 0, 0, 0, 0];
        for (const u of items) {
            if (genderCount[u.gender] !== undefined) genderCount[u.gender]++;
            else genderCount['อื่นๆ']++;
            // นับกลุ่มอายุ
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

app.listen(PORT, () => console.log("Server ready at http://localhost:"+PORT));
