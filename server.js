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
  const mockStudents = [
    { name: '陳美玲', type: 'ENFP' },
    { name: '林志偉', type: 'ISTJ' },
    { name: '王雅琴', type: 'INFJ' },
    { name: '張家豪', type: 'ESTP' },
    { name: '李佳穎', type: 'ISFJ' },
    { name: '黃俊傑', type: 'ENTJ' },
    { name: '吳雅文', type: 'INFP' },
    { name: '劉建宏', type: 'ESTJ' },
    { name: '蔡欣怡', type: 'ESFJ' },
    { name: '許志明', type: 'INTP' },
    { name: '鄭雅婷', type: 'ENFJ' },
    { name: '謝宗翰', type: 'ISTP' },
    { name: '周怡君', type: 'ESFP' },
    { name: '楊承恩', type: 'INTJ' },
    { name: '洪美惠', type: 'ISFP' },
    { name: '蕭志豪', type: 'ENTP' },
    { name: '盧雅芳', type: 'ISTJ' },
    { name: '傅俊宇', type: 'ESFJ' },
    { name: '曾佩珊', type: 'ENFP' },
    { name: '賴冠廷', type: 'ISFJ' }
  ];

  const students = mockStudents.map((s, i) => ({
    id: i + 1,
    name: s.name,
    password: s.name,
    mbti_type: s.type,
    answers: null,
    completed_at: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)).toISOString()
  }));

  return {
    nextId: students.length + 1,
    students,
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
    console.error('⚠️ 讀取資料檔案失敗，將重新建立:', e.message);
  }
  // First run or corrupt file — create fresh data
  const data = getDefaultData();
  saveData(data);
  console.log('✅ 已建立 20 位模擬學生資料');
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
    return res.json({ success: false, message: '測試尚未開放，請等待老師開啟測試。' });
  }

  if (!name || !password) {
    return res.json({ success: false, message: '請輸入姓名和密碼' });
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
    return res.json({ success: false, message: '密碼錯誤' });
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
    return res.json({ success: false, message: '缺少必要資料' });
  }

  const student = data.students.find(s => s.id === studentId);
  if (!student) {
    return res.json({ success: false, message: '找不到學生' });
  }

  if (student.mbti_type) {
    return res.json({ success: false, message: '你已經完成測試了' });
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
    return res.json({ success: false, message: '帳號或密碼錯誤' });
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
  let csv = BOM + '姓名,MBTI類型,完成時間\n';
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
  console.log('🧠 MBTI 性格測試系統已啟動！');
  console.log(`   監聽埠號: ${PORT}`);
  console.log('   管理員帳號: admin / admin123');
  console.log('');
});
