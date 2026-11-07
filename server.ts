import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { initialQuestions, initialStages, initialStudents } from './src/seedData.ts';
import { AnswerSubmission, AppDatabaseState, LeaderboardRank, Question, StageId, Student, StudentProgress } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'gelora_db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Database helper
function loadDatabase(): AppDatabaseState {
  if (!fs.existsSync(DB_FILE)) {
    const initialState: AppDatabaseState = {
      stages: initialStages,
      students: initialStudents,
      questions: initialQuestions,
      submissions: [],
      studentProgress: {},
      adminPassword: 'admin',
      activeStageId: 'penyisihan',
      announcement: 'Selamat datang di Lomba Literasi dan Numerasi GELORA 26 SMPN 26 Sijunjung! Junjung tinggi kejujuran dan sportivitas.'
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialState, null, 2), 'utf-8');
    return initialState;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse DB, re-initializing...', e);
    const initialState: AppDatabaseState = {
      stages: initialStages,
      students: initialStudents,
      questions: initialQuestions,
      submissions: [],
      studentProgress: {},
      adminPassword: 'admin',
      activeStageId: 'penyisihan',
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialState, null, 2), 'utf-8');
    return initialState;
  }
}

function saveDatabase(state: AppDatabaseState) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
    broadcastRealtimeEvent('STATE_UPDATED', { activeStageId: state.activeStageId });
  } catch (err) {
    console.error('Error saving database:', err);
  }
}

// Realtime SSE clients
type SSEClient = { id: number; res: Response };
let sseClients: SSEClient[] = [];
let nextClientId = 1;

function broadcastRealtimeEvent(type: string, data: any) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.res.write(payload);
    } catch {
      // ignore dropped connection
    }
  });
}

// Calculate leaderboard for a stage
export function computeStageLeaderboard(db: AppDatabaseState, stageId: StageId): LeaderboardRank[] {
  // Find all students qualified for or participating in this stage
  const validStudents = db.students.filter(s => {
    // Stage hierarchy: penyisihan -> top30 -> semifinal -> final
    const hierarchy: StageId[] = ['penyisihan', 'top30', 'semifinal', 'final'];
    const studentStageIndex = hierarchy.indexOf(s.qualifiedStage);
    const targetStageIndex = hierarchy.indexOf(stageId);
    return studentStageIndex >= targetStageIndex;
  });

  const studentStats: Record<string, { totalScore: number; totalAnswered: number; correctCount: number; lastSubmitTime: number }> = {};

  validStudents.forEach(st => {
    studentStats[st.id] = { totalScore: 0, totalAnswered: 0, correctCount: 0, lastSubmitTime: 0 };
  });

  // Calculate scores from submissions in this stage
  db.submissions
    .filter(sub => sub.stageId === stageId)
    .forEach(sub => {
      if (!studentStats[sub.studentId]) {
        studentStats[sub.studentId] = { totalScore: 0, totalAnswered: 0, correctCount: 0, lastSubmitTime: 0 };
      }
      studentStats[sub.studentId].totalScore += sub.scoreEarned;
      studentStats[sub.studentId].totalAnswered += 1;
      if (sub.isCorrect) {
        studentStats[sub.studentId].correctCount += 1;
      }
      if (sub.submittedAt > studentStats[sub.studentId].lastSubmitTime) {
        studentStats[sub.studentId].lastSubmitTime = sub.submittedAt;
      }
    });

  // Sort by score desc, then by lastSubmitTime asc (faster gets higher rank)
  const ranked = validStudents
    .map(st => {
      const stats = studentStats[st.id] || { totalScore: 0, totalAnswered: 0, correctCount: 0, lastSubmitTime: 0 };
      return {
        rank: 1,
        studentId: st.id,
        noPeserta: st.noPeserta,
        nama: st.nama,
        sekolah: st.sekolah,
        totalScore: Math.round(stats.totalScore * 10) / 10,
        totalAnswered: stats.totalAnswered,
        correctCount: stats.correctCount,
        lastSubmitTime: stats.lastSubmitTime
      };
    })
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      if (a.lastSubmitTime && b.lastSubmitTime) return a.lastSubmitTime - b.lastSubmitTime;
      return a.noPeserta.localeCompare(b.noPeserta);
    });

  ranked.forEach((r, idx) => {
    r.rank = idx + 1;
  });

  return ranked;
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: '10mb' }));

  // Serve public static assets (especially banner image in /public)
  app.use(express.static(path.join(__dirname, 'public')));

  // SSE Realtime stream
  app.get('/api/realtime/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const clientId = nextClientId++;
    sseClients.push({ id: clientId, res });

    // Send initial handshake
    res.write(`event: CONNECTED\ndata: ${JSON.stringify({ clientId, timestamp: Date.now() })}\n\n`);

    const interval = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 20000);

    req.on('close', () => {
      clearInterval(interval);
      sseClients = sseClients.filter(c => c.id !== clientId);
    });
  });

  // GET Current full state
  app.get('/api/state', (req: Request, res: Response) => {
    const db = loadDatabase();
    const activeLeaderboard = computeStageLeaderboard(db, db.activeStageId);
    res.json({
      activeStageId: db.activeStageId,
      stages: db.stages,
      students: db.students,
      questions: db.questions,
      submissions: db.submissions,
      announcement: db.announcement,
      leaderboard: activeLeaderboard
    });
  });

  // POST Login
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { role, noPeserta, pin, password } = req.body;
    const db = loadDatabase();

    if (role === 'admin') {
      if (password === db.adminPassword || password === 'gelora26' || password === 'admin') {
        return res.json({
          success: true,
          role: 'admin',
          user: { id: 'admin_1', nama: 'Panitia Lomba GELORA 26', role: 'admin' }
        });
      }
      return res.status(401).json({ success: false, message: 'Password Panitia salah. (Default: admin)' });
    }

    if (role === 'student') {
      const student = db.students.find(
        s => s.noPeserta.trim().toLowerCase() === (noPeserta || '').trim().toLowerCase()
      );
      if (!student) {
        return res.status(404).json({ success: false, message: 'Nomor Peserta tidak ditemukan.' });
      }
      if (pin && student.pin && pin !== student.pin && pin !== '1234') {
        return res.status(401).json({ success: false, message: 'PIN Peserta tidak cocok.' });
      }

      return res.json({
        success: true,
        role: 'student',
        user: student
      });
    }

    return res.status(400).json({ success: false, message: 'Role tidak valid.' });
  });

  // GET Leaderboard for specific stage
  app.get('/api/leaderboard/:stageId', (req: Request, res: Response) => {
    const stageId = req.params.stageId as StageId;
    const db = loadDatabase();
    const ranked = computeStageLeaderboard(db, stageId);
    res.json(ranked);
  });

  // POST Submit student answer for a question
  app.post('/api/submit-answer', (req: Request, res: Response) => {
    const { studentId, stageId, questionId, answer } = req.body;
    const db = loadDatabase();

    const question = db.questions.find(q => q.id === questionId);
    const student = db.students.find(s => s.id === studentId);

    if (!question || !student) {
      return res.status(404).json({ success: false, message: 'Soal atau Siswa tidak ditemukan.' });
    }

    // Evaluate answer according to question type
    let isCorrect = false;
    let scoreEarned = 0;
    const maxPoints = question.points || 10;

    if (question.type === 'pg_single') {
      const correct = question.correctOptionIds?.[0];
      if (answer === correct) {
        isCorrect = true;
        scoreEarned = maxPoints;
      }
    } else if (question.type === 'pg_complex') {
      // answer is array of selected option IDs
      const studentSelected: string[] = Array.isArray(answer) ? answer : [];
      const correctIds: string[] = question.correctOptionIds || [];
      
      const correctCount = studentSelected.filter(id => correctIds.includes(id)).length;
      const wrongCount = studentSelected.filter(id => !correctIds.includes(id)).length;

      if (wrongCount === 0 && correctCount === correctIds.length) {
        isCorrect = true;
        scoreEarned = maxPoints;
      } else if (correctCount > 0 && wrongCount <= 1) {
        // Partial score
        const ratio = Math.max(0, (correctCount - wrongCount * 0.5) / correctIds.length);
        scoreEarned = Math.round(ratio * maxPoints * 10) / 10;
        isCorrect = scoreEarned >= (maxPoints * 0.6);
      }
    } else if (question.type === 'true_false') {
      // answer is Record<statementId, boolean>
      const statements = question.trueFalseStatements || [];
      let matchCount = 0;
      statements.forEach(st => {
        if (answer && answer[st.id] === st.correctAnswer) {
          matchCount++;
        }
      });
      if (statements.length > 0) {
        const ratio = matchCount / statements.length;
        scoreEarned = Math.round(ratio * maxPoints * 10) / 10;
        isCorrect = matchCount === statements.length;
      }
    } else if (question.type === 'matching') {
      // answer is Record<premiseId, string>
      const pairs = question.matchingPairs || [];
      let matchCount = 0;
      pairs.forEach(p => {
        if (answer && answer[p.id] === p.response) {
          matchCount++;
        }
      });
      if (pairs.length > 0) {
        const ratio = matchCount / pairs.length;
        scoreEarned = Math.round(ratio * maxPoints * 10) / 10;
        isCorrect = matchCount === pairs.length;
      }
    }

    // Save or update submission
    const existingIndex = db.submissions.findIndex(
      sub => sub.studentId === studentId && sub.stageId === stageId && sub.questionId === questionId
    );

    const submission: AnswerSubmission = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      studentId,
      stageId: stageId as StageId,
      questionId,
      type: question.type,
      answer,
      isCorrect,
      scoreEarned,
      submittedAt: Date.now()
    };

    if (existingIndex >= 0) {
      db.submissions[existingIndex] = submission;
    } else {
      db.submissions.push(submission);
    }

    // Update student progress tracker
    const progressKey = `${studentId}_${stageId}`;
    if (!db.studentProgress[progressKey]) {
      db.studentProgress[progressKey] = {
        studentId,
        stageId: stageId as StageId,
        completedQuestionIds: [questionId],
        totalScore: scoreEarned,
        isFinished: false
      };
    } else {
      const prog = db.studentProgress[progressKey];
      if (!prog.completedQuestionIds.includes(questionId)) {
        prog.completedQuestionIds.push(questionId);
      }
      // Recalculate total score for this stage
      prog.totalScore = db.submissions
        .filter(s => s.studentId === studentId && s.stageId === stageId)
        .reduce((sum, s) => sum + s.scoreEarned, 0);
    }

    saveDatabase(db);

    // Compute updated leaderboard and student's new rank immediately!
    const updatedLeaderboard = computeStageLeaderboard(db, stageId as StageId);
    const myRankEntry = updatedLeaderboard.find(r => r.studentId === studentId);
    const currentRank = myRankEntry ? myRankEntry.rank : 1;
    const totalScore = myRankEntry ? myRankEntry.totalScore : scoreEarned;

    // Broadcast live event to all connected screens (panitia projector & other students)
    broadcastRealtimeEvent('SUBMISSION_RECEIVED', {
      studentId,
      stageId,
      studentName: student.nama,
      scoreEarned,
      newTotalScore: totalScore,
      rank: currentRank,
      leaderboard: updatedLeaderboard
    });

    res.json({
      success: true,
      isCorrect,
      scoreEarned,
      totalScore,
      currentRank,
      totalParticipants: updatedLeaderboard.length,
      topLeaderboard: updatedLeaderboard.slice(0, 5)
    });
  });

  // POST Finish Stage for student
  app.post('/api/finish-stage', (req: Request, res: Response) => {
    const { studentId, stageId } = req.body;
    const db = loadDatabase();
    const progressKey = `${studentId}_${stageId}`;

    if (db.studentProgress[progressKey]) {
      db.studentProgress[progressKey].isFinished = true;
      db.studentProgress[progressKey].finishedAt = Date.now();
    } else {
      db.studentProgress[progressKey] = {
        studentId,
        stageId: stageId as StageId,
        completedQuestionIds: [],
        totalScore: 0,
        isFinished: true,
        finishedAt: Date.now()
      };
    }

    saveDatabase(db);
    const finalLeaderboard = computeStageLeaderboard(db, stageId as StageId);
    const myRank = finalLeaderboard.find(r => r.studentId === studentId);

    broadcastRealtimeEvent('STUDENT_FINISHED', {
      studentId,
      stageId,
      finalRank: myRank?.rank || 1,
      totalScore: myRank?.totalScore || 0
    });

    res.json({
      success: true,
      myRank,
      leaderboard: finalLeaderboard
    });
  });

  // ADMIN: Activate Stage
  app.post('/api/admin/stage/activate', (req: Request, res: Response) => {
    const { stageId } = req.body;
    const db = loadDatabase();

    if (!db.stages[stageId as StageId]) {
      return res.status(400).json({ success: false, message: 'Babak tidak valid' });
    }

    // Set all to false, then set target to true
    Object.keys(db.stages).forEach(k => {
      db.stages[k as StageId].isActive = (k === stageId);
    });
    db.activeStageId = stageId as StageId;

    saveDatabase(db);
    broadcastRealtimeEvent('STAGE_ACTIVATED', {
      activeStageId: stageId,
      stage: db.stages[stageId as StageId]
    });

    res.json({ success: true, activeStageId: stageId, stages: db.stages });
  });

  // ADMIN: Promote top participants to next stage
  app.post('/api/admin/stage/promote', (req: Request, res: Response) => {
    const { fromStageId, toStageId, quota } = req.body;
    const db = loadDatabase();

    const ranked = computeStageLeaderboard(db, fromStageId as StageId);
    const passingCount = quota || (toStageId === 'top30' ? 30 : toStageId === 'semifinal' ? 10 : 3);
    const promotedStudents = ranked.slice(0, passingCount);
    const promotedIds = promotedStudents.map(s => s.studentId);

    db.students.forEach(st => {
      if (promotedIds.includes(st.id)) {
        st.qualifiedStage = toStageId as StageId;
        st.status = 'lolos';
      } else if (st.qualifiedStage === fromStageId) {
        st.status = 'gugur';
      }
    });

    saveDatabase(db);
    broadcastRealtimeEvent('STUDENTS_PROMOTED', {
      fromStageId,
      toStageId,
      promotedCount: promotedIds.length,
      promotedNames: promotedStudents.map(p => p.nama)
    });

    res.json({
      success: true,
      promotedCount: promotedIds.length,
      promotedStudents
    });
  });

  // ADMIN: Manage Questions
  app.post('/api/admin/questions', (req: Request, res: Response) => {
    const newQ: Question = {
      ...req.body,
      id: req.body.id || `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    };
    const db = loadDatabase();
    db.questions.push(newQ);
    saveDatabase(db);
    res.json({ success: true, question: newQ });
  });

  app.put('/api/admin/questions/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const db = loadDatabase();
    const index = db.questions.findIndex(q => q.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Soal tidak ditemukan' });
    }
    db.questions[index] = { ...db.questions[index], ...req.body, id };
    saveDatabase(db);
    res.json({ success: true, question: db.questions[index] });
  });

  app.delete('/api/admin/questions/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const db = loadDatabase();
    db.questions = db.questions.filter(q => q.id !== id);
    saveDatabase(db);
    res.json({ success: true });
  });

  // ADMIN: Manage Students
  app.post('/api/admin/students', (req: Request, res: Response) => {
    const db = loadDatabase();
    const newStudent: Student = {
      ...req.body,
      id: req.body.id || `std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      qualifiedStage: req.body.qualifiedStage || 'penyisihan',
      status: req.body.status || 'aktif'
    };
    db.students.push(newStudent);
    saveDatabase(db);
    res.json({ success: true, student: newStudent });
  });

  app.put('/api/admin/students/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const db = loadDatabase();
    const idx = db.students.findIndex(s => s.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan' });
    }
    db.students[idx] = { ...db.students[idx], ...req.body, id };
    saveDatabase(db);
    res.json({ success: true, student: db.students[idx] });
  });

  app.delete('/api/admin/students/:id', (req: Request, res: Response) => {
    const id = req.params.id;
    const db = loadDatabase();
    db.students = db.students.filter(s => s.id !== id);
    db.submissions = db.submissions.filter(sub => sub.studentId !== id);
    saveDatabase(db);
    res.json({ success: true });
  });

  // ADMIN: Bulk Seed Students for big competition test
  app.post('/api/admin/students/bulk-seed', (req: Request, res: Response) => {
    const db = loadDatabase();
    const sampleNames = [
      'Alifia Rahma', 'Bagas Pratama', 'Citra Dewi', 'Doni Kurniawan',
      'Elsa Novita', 'Fajar Ramadhan', 'Gita Permata', 'Hendra Saputra',
      'Indah Wulandari', 'Joko Susilo', 'Khadijah Putri', 'Lukman Hakim',
      'Maya Anggraini', 'Naufal Akbar', 'Olivia Maharani', 'Putra Utama',
      'Qonita Azzahra', 'Rian Hidayat', 'Salsabila Putri', 'Taufik Ismail'
    ];
    const schools = [
      'SMP Negeri 26 Sijunjung', 'SMP Negeri 1 Sijunjung', 'SMP Negeri 2 Sijunjung',
      'SMP Negeri 7 Sijunjung', 'MTsN 1 Sijunjung'
    ];

    const newGenerated: Student[] = sampleNames.map((name, i) => {
      const num = db.students.length + i + 1;
      const formattedNum = num < 10 ? `00${num}` : num < 100 ? `0${num}` : `${num}`;
      return {
        id: `std_gen_${Date.now()}_${i}`,
        noPeserta: `G26-${formattedNum}`,
        nama: name,
        sekolah: schools[i % schools.length],
        kelas: `VIII ${String.fromCharCode(65 + (i % 4))}`,
        pin: '1234',
        qualifiedStage: 'penyisihan',
        status: 'aktif'
      };
    });

    db.students.push(...newGenerated);
    saveDatabase(db);
    res.json({ success: true, addedCount: newGenerated.length, total: db.students.length });
  });

  // ADMIN: Reset Submissions / Progress
  app.post('/api/admin/reset-progress', (req: Request, res: Response) => {
    const { stageId } = req.body;
    const db = loadDatabase();

    if (stageId && stageId !== 'all') {
      db.submissions = db.submissions.filter(s => s.stageId !== stageId);
      Object.keys(db.studentProgress).forEach(k => {
        if (k.endsWith(`_${stageId}`)) {
          delete db.studentProgress[k];
        }
      });
    } else {
      db.submissions = [];
      db.studentProgress = {};
      db.students.forEach(st => {
        st.qualifiedStage = 'penyisihan';
        st.status = 'aktif';
      });
    }

    saveDatabase(db);
    broadcastRealtimeEvent('STATE_RESET', { stageId });
    res.json({ success: true });
  });

  // Mount Vite middlewares in development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server GELORA 26 running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
