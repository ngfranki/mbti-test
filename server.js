const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Glitch uses .data/ for persistent storage; fall back to local for dev
const DATA_DIR = fs.existsSync(path.join(__dirname, '.data'))
  ? path.join(__dirname, '.data')
  : __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== JSON File Storage ====================

function getDefaultData() {
  return {
    nextId: 1,
    students: [],
    settings: { test_open: false },
    admin: { username: 'admin', password: 'admin123' }
  };
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('â ï¸ è®åè³ææªæ¡å¤±æï¼å°éæ°å»ºç«:', e.message);
  }
  // First run or corrupt file â create fresh data
  const data = getDefaultData();
  saveData(data);
  console.log('â å·²å»ºç«åå§ç©ºç½è³æ');
  return data;
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Load data on startup
let data = loadData();

// ==================== API Routes ====================

// Student login
app.post('/api/login', (req, res) => {
  const { name, password } = req.body;

  // Check master switch
  if (!data.settings.test_open) {
    return res.json({ success: false, message: 'æ¸¬è©¦å°æªéæ¾ï¼è«ç­å¾èå¸«éåæ¸¬è©¦ã' });
  }

  if (!name || !password) {
    return res.json({ success: false, message: 'è«è¼¸å¥å§ååå¯ç¢¸' });
  }

  // Find or create student
  let student = data.students.find(s => s.name === name);

  if (!student) {
    // Auto-register new student
    student = {
      id: data.nextId++,
      name,
      password: name,
      mbti_type: null,
      answers: null,
      completed_at: null
    };
    data.students.push(student);
    saveData(data);
  }

  if (student.password !== password) {
    return res.json({ success: false, message: 'å¯ç¢¼é¯èª¤' });
  }

  if (student.mbti_type) {
    return res.json({
      success: true,
      completed: true,
      mbti_type: student.mbti_type,
      studentId: student.id,
      name: student.name
    });
  }

  return res.json({
    success: true,
    completed: false,
    studentId: student.id,
    name: student.name
  });
});

// Submit test results
app.post('/api/submit', (req, res) => {
  const { studentId, answers, mbtiType } = req.body;

  if (!studentId || !mbtiType) {
    return res.json({ success: false, message: 'ç¼ºå°å¿è¦è³æ' });
  }

  const student = data.students.find(s => s.id === studentId);
  if (!student) {
    return res.json({ success: false, message: 'æ¾ä¸å°å­¸ç' });
  }

  if (student.mbti_type) {
    return res.json({ success: false, message: 'ä½ å·²ç¶å®ææ¸¬è©¦äº' });
  }

  student.mbti_type = mbtiType;
  student.answers = answers;
  student.completed_at = new Date().toISOString();
  saveData(data);

  return res.json({ success: true, mbti_type: mbtiType });
});

// Get all results (for charts)
app.get('/api/results', (req, res) => {
  const results = data.students
    .filter(s => s.mbti_type)
    .map(s => ({ name: s.name, mbti_type: s.mbti_type }));
  return res.json({ success: true, results });
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (username !== data.admin.username || password !== data.admin.password) {
    return res.json({ success: false, message: 'å¸³èæå¯ç¢¼é¯èª¤' });
  }

  return res.json({ success: true });
});

// Admin: get all results
app.get('/api/admin/results', (req, res) => {
  const students = data.students
    .map(s => ({ id: s.id, name: s.name, mbti_type: s.mbti_type, completed_at: s.completed_at }))
    .sort((a, b) => {
      if (!a.completed_at) return 1;
      if (!b.completed_at) return -1;
      return new Date(b.completed_at) - new Date(a.completed_at);
    });
  return res.json({ success: true, students, isOpen: data.settings.test_open });
});

// Admin: toggle master switch
app.post('/api/admin/toggle', (req, res) => {
  data.settings.test_open = !data.settings.test_open;
  saveData(data);
  return res.json({ success: true, isOpen: data.settings.test_open });
});

// Admin: get status
app.get('/api/admin/status', (req, res) => {
  const total = data.students.length;
  const completed = data.students.filter(s => s.mbti_type).length;
  return res.json({ success: true, isOpen: data.settings.test_open, total, completed });
});

// Admin: export CSV
app.get('/api/admin/export', (req, res) => {
  const completed = data.students
    .filter(s => s.mbti_type)
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

  const BOM = '\uFEFF';
  let csv = BOM + 'å§å,MBTIé¡å,å®ææé\n';
  for (const s of completed) {
    const time = s.completed_at ? new Date(s.completed_at).toLocaleString('zh-TW') : '';
    csv += `${s.name},${s.mbti_type},${time}\n`;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=mbti_results.csv');
  res.send(csv);
});

// Server info (public URL for share link)
app.get('/api/server-info', (req, res) => {
  // On Glitch, use the public URL from request headers
  const host = req.get('host');
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const url = `${protocol}://${host}`;
  return res.json({ success: true, url });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('ð§  MBTI æ§æ ¼æ¸¬è©¦ç³»çµ±å·²ååï¼');
  console.log(`   ç£è½å è: ${PORT}`);
  console.log('   ç®¡çå¡å¸³è: admin / admin123');
  console.log('');
});
