import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  writeBatch
} from 'firebase/firestore';
import { db, bootstrapFirestoreIfEmpty } from './firebase';
import { initialQuestions, initialStages, initialStudents } from '../seedData';
import { 
  AnswerSubmission, 
  AppDatabaseState, 
  LeaderboardRank, 
  Question, 
  StageId, 
  Student, 
  StudentProgress 
} from '../types';

// Local storage key for offline fallback
const LOCAL_DB_KEY = 'gelora26_offline_db_v3';

// Cache in-memory for instant rendering
let cachedDb: AppDatabaseState = {
  stages: initialStages,
  students: initialStudents,
  questions: initialQuestions,
  submissions: [],
  studentProgress: {},
  adminPassword: 'admin',
  activeStageId: 'penyisihan',
  announcement: 'Selamat datang di Lomba Literasi dan Numerasi GELORA 26 SMPN 26 Sijunjung! Junjung tinggi kejujuran dan sportivitas.'
};

let isFirestoreConnected = false;

export function getFirestoreSyncStatus(): boolean {
  return isFirestoreConnected;
}

// Compute leaderboard ranks from students and submissions
export function computeLeaderboard(
  students: Student[], 
  submissions: AnswerSubmission[], 
  stageId: StageId
): LeaderboardRank[] {
  const hierarchy: StageId[] = ['penyisihan', 'top30', 'semifinal', 'final'];
  const targetStageIndex = hierarchy.indexOf(stageId);

  const validStudents = students.filter(s => {
    const studentStageIndex = hierarchy.indexOf(s.qualifiedStage);
    return studentStageIndex >= targetStageIndex;
  });

  const studentStats: Record<string, { totalScore: number; totalAnswered: number; correctCount: number; lastSubmitTime: number }> = {};
  validStudents.forEach(st => {
    studentStats[st.id] = { totalScore: 0, totalAnswered: 0, correctCount: 0, lastSubmitTime: 0 };
  });

  submissions
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

  const ranked: LeaderboardRank[] = validStudents
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

// ====================================================
// CORE APP STATE
// ====================================================

export async function fetchAppState(): Promise<{
  activeStageId: StageId;
  stages: Record<StageId, any>;
  students: Student[];
  questions: Question[];
  submissions: AnswerSubmission[];
  announcement?: string;
  leaderboard: LeaderboardRank[];
}> {
  try {
    // Ensure initial data exists in Firestore
    await bootstrapFirestoreIfEmpty();

    // 1. Fetch App State
    const stateDoc = await getDoc(doc(db, 'app_state', 'main'));
    let activeStageId: StageId = 'penyisihan';
    let stages = initialStages;
    let announcement = 'Selamat datang di GELORA 26 SMPN 26 Sijunjung!';

    if (stateDoc.exists()) {
      const data = stateDoc.data();
      if (data.activeStageId) activeStageId = data.activeStageId;
      if (data.stages) stages = data.stages;
      if (data.announcement) announcement = data.announcement;
    }

    // 2. Fetch Students
    const studentSnaps = await getDocs(collection(db, 'students'));
    const students: Student[] = [];
    studentSnaps.forEach(docSnap => {
      students.push(docSnap.data() as Student);
    });

    // 3. Fetch Questions
    const questionSnaps = await getDocs(collection(db, 'questions'));
    const questions: Question[] = [];
    questionSnaps.forEach(docSnap => {
      questions.push(docSnap.data() as Question);
    });

    // 4. Fetch Submissions
    const subSnaps = await getDocs(collection(db, 'submissions'));
    const submissions: AnswerSubmission[] = [];
    subSnaps.forEach(docSnap => {
      submissions.push(docSnap.data() as AnswerSubmission);
    });

    // Compute active leaderboard
    const activeLeaderboard = computeLeaderboard(
      students.length ? students : initialStudents,
      submissions,
      activeStageId
    );

    // Update in-memory cache
    cachedDb = {
      stages: Object.keys(stages).length ? stages : initialStages,
      students: students.length ? students : initialStudents,
      questions: questions.length ? questions : initialQuestions,
      submissions,
      studentProgress: {},
      adminPassword: 'admin',
      activeStageId,
      announcement
    };

    try {
      localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(cachedDb));
    } catch {
      // ignore
    }

    isFirestoreConnected = true;

    return {
      activeStageId,
      stages: cachedDb.stages,
      students: cachedDb.students,
      questions: cachedDb.questions,
      submissions: cachedDb.submissions,
      announcement: cachedDb.announcement,
      leaderboard: activeLeaderboard
    };
  } catch (err) {
    console.warn('Could not fetch from Firestore, using cached/local data:', err);
    isFirestoreConnected = false;
    const local = loadLocalFallback();
    const leaderboard = computeLeaderboard(local.students, local.submissions || [], local.activeStageId);
    return {
      activeStageId: local.activeStageId,
      stages: local.stages,
      students: local.students,
      questions: local.questions,
      submissions: local.submissions || [],
      announcement: local.announcement,
      leaderboard
    };
  }
}

function loadLocalFallback(): AppDatabaseState {
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.students && parsed.questions) return parsed;
    }
  } catch {
    // ignore
  }
  return cachedDb;
}

// ====================================================
// AUTHENTICATION
// ====================================================

export async function loginUser(
  role: 'admin' | 'student',
  payload: { noPeserta?: string; pin?: string; password?: string }
): Promise<{ success: boolean; role: 'admin' | 'student'; user: any }> {
  if (role === 'admin') {
    const pass = (payload.password || '').trim();
    if (pass === 'admin' || pass === 'gelora26' || pass === cachedDb.adminPassword) {
      return {
        success: true,
        role: 'admin',
        user: { id: 'admin_1', nama: 'Panitia Lomba GELORA 26', role: 'admin' }
      };
    }
    throw new Error('Password Panitia salah. (Default: admin / gelora26)');
  }

  if (role === 'student') {
    const inputNo = (payload.noPeserta || '').trim().toUpperCase();
    const inputPin = (payload.pin || '').trim();

    // Check in cached students or fetch directly from Firestore
    let student = cachedDb.students.find(
      s => s.noPeserta.trim().toUpperCase() === inputNo
    );

    if (!student) {
      try {
        const studentSnaps = await getDocs(collection(db, 'students'));
        studentSnaps.forEach(docSnap => {
          const st = docSnap.data() as Student;
          if (st.noPeserta.trim().toUpperCase() === inputNo) {
            student = st;
          }
        });
      } catch {
        // fallback
      }
    }

    if (!student) {
      // Also check initialStudents as fallback
      student = initialStudents.find(
        s => s.noPeserta.trim().toUpperCase() === inputNo
      );
    }

    if (!student) {
      throw new Error(`Nomor Peserta "${payload.noPeserta}" tidak ditemukan.`);
    }

    if (inputPin && student.pin && inputPin !== student.pin && inputPin !== '1234') {
      throw new Error('PIN Peserta tidak cocok. (Default: 1234)');
    }

    return {
      success: true,
      role: 'student',
      user: student
    };
  }

  throw new Error('Role tidak valid');
}

// ====================================================
// STUDENT SUBMISSION
// ====================================================

export async function getStudentStageSubmissions(studentId: string, stageId: StageId): Promise<{
  answers: Record<string, any>;
  submittedQuestionIds: string[];
  totalScore: number;
}> {
  const result: {
    answers: Record<string, any>;
    submittedQuestionIds: string[];
    totalScore: number;
  } = {
    answers: {},
    submittedQuestionIds: [],
    totalScore: 0
  };

  try {
    // 1. Look in cachedDb first
    const localSubs = cachedDb.submissions.filter(
      s => s.studentId === studentId && s.stageId === stageId
    );

    if (localSubs.length > 0) {
      localSubs.forEach(s => {
        result.answers[s.questionId] = s.answer;
        result.submittedQuestionIds.push(s.questionId);
        result.totalScore += s.scoreEarned;
      });
      return result;
    }

    // 2. Query Firestore submissions
    const subSnaps = await getDocs(collection(db, 'submissions'));
    subSnaps.forEach(docSnap => {
      const s = docSnap.data() as AnswerSubmission;
      if (s.studentId === studentId && s.stageId === stageId) {
        result.answers[s.questionId] = s.answer;
        if (!result.submittedQuestionIds.includes(s.questionId)) {
          result.submittedQuestionIds.push(s.questionId);
        }
        result.totalScore += s.scoreEarned;
      }
    });
  } catch (err) {
    console.warn('Error fetching student stage submissions:', err);
  }

  return result;
}

export async function submitStudentAnswer(payload: {
  studentId: string;
  stageId: StageId;
  questionId: string;
  answer: any;
}): Promise<{
  success: boolean;
  isCorrect: boolean;
  scoreEarned: number;
  totalScore: number;
  currentRank: number;
  totalParticipants: number;
  topLeaderboard: LeaderboardRank[];
}> {
  let question = cachedDb.questions.find(q => q.id === payload.questionId);
  if (!question) {
    question = initialQuestions.find(q => q.id === payload.questionId);
  }
  if (!question) {
    try {
      const qDoc = await getDoc(doc(db, 'questions', payload.questionId));
      if (qDoc.exists()) question = qDoc.data() as Question;
    } catch {
      // fallback
    }
  }

  let student = cachedDb.students.find(s => s.id === payload.studentId);
  if (!student) {
    student = initialStudents.find(s => s.id === payload.studentId);
  }
  if (!student) {
    try {
      const sDoc = await getDoc(doc(db, 'students', payload.studentId));
      if (sDoc.exists()) student = sDoc.data() as Student;
    } catch {
      // fallback
    }
  }

  if (!question || !student) {
    throw new Error('Soal atau Siswa tidak ditemukan');
  }

  // Evaluate answer
  let isCorrect = false;
  let scoreEarned = 0;
  const maxPoints = question.points || 10;

  if (question.type === 'pg_single') {
    const correct = question.correctOptionIds?.[0];
    if (payload.answer === correct) {
      isCorrect = true;
      scoreEarned = maxPoints;
    }
  } else if (question.type === 'pg_complex') {
    const studentSelected: string[] = Array.isArray(payload.answer) ? payload.answer : [];
    const correctIds: string[] = question.correctOptionIds || [];
    const correctCount = studentSelected.filter(id => correctIds.includes(id)).length;
    const wrongCount = studentSelected.filter(id => !correctIds.includes(id)).length;

    if (wrongCount === 0 && correctCount === correctIds.length) {
      isCorrect = true;
      scoreEarned = maxPoints;
    } else if (correctCount > 0 && wrongCount <= 1) {
      const ratio = Math.max(0, (correctCount - wrongCount * 0.5) / correctIds.length);
      scoreEarned = Math.round(ratio * maxPoints * 10) / 10;
      isCorrect = scoreEarned >= (maxPoints * 0.6);
    }
  } else if (question.type === 'true_false') {
    const statements = question.trueFalseStatements || [];
    let matchCount = 0;
    statements.forEach(st => {
      if (payload.answer && payload.answer[st.id] === st.correctAnswer) {
        matchCount++;
      }
    });
    if (statements.length > 0) {
      const ratio = matchCount / statements.length;
      scoreEarned = Math.round(ratio * maxPoints * 10) / 10;
      isCorrect = matchCount === statements.length;
    }
  } else if (question.type === 'matching') {
    const pairs = question.matchingPairs || [];
    let matchCount = 0;
    pairs.forEach(p => {
      if (payload.answer && payload.answer[p.id] === p.response) {
        matchCount++;
      }
    });
    if (pairs.length > 0) {
      const ratio = matchCount / pairs.length;
      scoreEarned = Math.round(ratio * maxPoints * 10) / 10;
      isCorrect = matchCount === pairs.length;
    }
  }

  // Create submission object with deterministic ID per question to allow updates
  const submissionId = `${payload.studentId}_${payload.stageId}_${payload.questionId}`;
  const submission: AnswerSubmission = {
    id: submissionId,
    studentId: payload.studentId,
    stageId: payload.stageId,
    questionId: payload.questionId,
    type: question.type,
    answer: payload.answer,
    isCorrect,
    scoreEarned,
    submittedAt: Date.now()
  };

  // Update in-memory cache
  const existingSubIdx = cachedDb.submissions.findIndex(s => s.id === submissionId);
  if (existingSubIdx >= 0) {
    cachedDb.submissions[existingSubIdx] = submission;
  } else {
    cachedDb.submissions.push(submission);
  }

  // Write to Firebase Firestore in real-time
  try {
    await setDoc(doc(db, 'submissions', submissionId), submission);
    
    // Also update progress document
    const progressId = `${payload.studentId}_${payload.stageId}`;
    const studentSubmissions = cachedDb.submissions.filter(
      s => s.studentId === payload.studentId && s.stageId === payload.stageId
    );
    const totalScore = studentSubmissions.reduce((sum, s) => sum + s.scoreEarned, 0);
    const completedQuestionIds = Array.from(new Set(studentSubmissions.map(s => s.questionId)));

    await setDoc(doc(db, 'student_progress', progressId), {
      studentId: payload.studentId,
      stageId: payload.stageId,
      completedQuestionIds,
      totalScore,
      isFinished: false,
      lastUpdatedAt: Date.now()
    }, { merge: true });
  } catch (err) {
    console.warn('Error syncing submission to Firestore:', err);
  }

  // Compute live ranks
  const updatedLeaderboard = computeLeaderboard(cachedDb.students, cachedDb.submissions, payload.stageId);
  const myRankEntry = updatedLeaderboard.find(r => r.studentId === payload.studentId);
  const currentRank = myRankEntry ? myRankEntry.rank : 1;
  const studentTotalScore = myRankEntry ? myRankEntry.totalScore : scoreEarned;

  return {
    success: true,
    isCorrect,
    scoreEarned,
    totalScore: studentTotalScore,
    currentRank,
    totalParticipants: updatedLeaderboard.length,
    topLeaderboard: updatedLeaderboard.slice(0, 5)
  };
}

export async function finishStudentStage(studentId: string, stageId: StageId): Promise<{
  success: boolean;
  myRank?: LeaderboardRank;
  leaderboard: LeaderboardRank[];
}> {
  const progressId = `${studentId}_${stageId}`;
  try {
    await setDoc(doc(db, 'student_progress', progressId), {
      isFinished: true,
      finishedAt: Date.now()
    }, { merge: true });
  } catch (err) {
    console.warn('Error updating finish stage in Firestore:', err);
  }

  const finalLeaderboard = computeLeaderboard(cachedDb.students, cachedDb.submissions, stageId);
  const myRank = finalLeaderboard.find(r => r.studentId === studentId);

  return {
    success: true,
    myRank,
    leaderboard: finalLeaderboard
  };
}

export async function fetchLeaderboard(stageId: StageId): Promise<LeaderboardRank[]> {
  return computeLeaderboard(cachedDb.students, cachedDb.submissions, stageId);
}

// ====================================================
// PANITIA (ADMIN) OPERATIONS WITH FIRESTORE REALTIME SYNC
// ====================================================

export async function adminActivateStage(stageId: StageId) {
  // Update local stages config
  const newStages = { ...cachedDb.stages };
  Object.keys(newStages).forEach(k => {
    newStages[k as StageId] = {
      ...newStages[k as StageId],
      isActive: (k === stageId)
    };
  });

  cachedDb.activeStageId = stageId;
  cachedDb.stages = newStages;

  // Sync to Firestore in real-time -> triggers onSnapshot on all student phones!
  try {
    await setDoc(doc(db, 'app_state', 'main'), {
      activeStageId: stageId,
      stages: newStages,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore update stage error:', err);
  }

  return { success: true, activeStageId: stageId, stages: newStages };
}

export async function adminPromoteStudents(fromStageId: StageId, toStageId: StageId, quota?: number) {
  const ranked = computeLeaderboard(cachedDb.students, cachedDb.submissions, fromStageId);
  const passingCount = quota || (toStageId === 'top30' ? 30 : toStageId === 'semifinal' ? 10 : 3);
  const promotedStudents = ranked.slice(0, passingCount);
  const promotedIds = promotedStudents.map(s => s.studentId);

  cachedDb.students.forEach(st => {
    if (promotedIds.includes(st.id)) {
      st.qualifiedStage = toStageId;
      st.status = 'lolos';
    } else if (st.qualifiedStage === fromStageId) {
      st.status = 'gugur';
    }
  });

  // Batch update students in Firestore
  try {
    const batch = writeBatch(db);
    cachedDb.students.forEach(st => {
      batch.set(doc(db, 'students', st.id), st, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.warn('Firestore promote students batch error:', err);
  }

  return { success: true, promotedCount: promotedIds.length, promotedStudents };
}

export async function adminSaveQuestion(question: Partial<Question>) {
  const isEdit = !!question.id && !question.id.startsWith('new_');
  const targetId = question.id || `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const qData: Question = {
    ...(question as Question),
    id: targetId
  };

  if (isEdit) {
    const idx = cachedDb.questions.findIndex(q => q.id === targetId);
    if (idx >= 0) cachedDb.questions[idx] = qData;
  } else {
    cachedDb.questions.push(qData);
  }

  try {
    await setDoc(doc(db, 'questions', targetId), qData);
  } catch (err) {
    console.warn('Firestore save question error:', err);
  }

  return { success: true, question: qData };
}

export async function adminDeleteQuestion(id: string) {
  cachedDb.questions = cachedDb.questions.filter(q => q.id !== id);
  try {
    await deleteDoc(doc(db, 'questions', id));
  } catch (err) {
    console.warn('Firestore delete question error:', err);
  }
  return { success: true };
}

export async function adminSaveStudent(student: Partial<Student>) {
  const isEdit = !!student.id && !student.id.startsWith('new_');
  const targetId = student.id || `std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const sData: Student = {
    ...(student as Student),
    id: targetId,
    qualifiedStage: student.qualifiedStage || 'penyisihan',
    status: student.status || 'aktif'
  };

  if (isEdit) {
    const idx = cachedDb.students.findIndex(s => s.id === targetId);
    if (idx >= 0) cachedDb.students[idx] = sData;
  } else {
    cachedDb.students.push(sData);
  }

  try {
    // 1. Write student document to Firestore
    await setDoc(doc(db, 'students', targetId), sData);

    // 2. Also touch app_state/main to guarantee instant dual real-time broadcast to all mobile & desktop clients
    await setDoc(doc(db, 'app_state', 'main'), {
      updatedAt: Date.now(),
      studentCount: cachedDb.students.length
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore save student error:', err);
  }

  return { success: true, student: sData };
}

export async function adminDeleteStudent(id: string) {
  cachedDb.students = cachedDb.students.filter(s => s.id !== id);
  cachedDb.submissions = cachedDb.submissions.filter(sub => sub.studentId !== id);

  try {
    await deleteDoc(doc(db, 'students', id));
    await setDoc(doc(db, 'app_state', 'main'), {
      updatedAt: Date.now(),
      studentCount: cachedDb.students.length
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore delete student error:', err);
  }

  return { success: true };
}

export async function adminBulkSeedStudents() {
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
    const num = cachedDb.students.length + i + 1;
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

  cachedDb.students.push(...newGenerated);

  try {
    const batch = writeBatch(db);
    newGenerated.forEach(st => {
      batch.set(doc(db, 'students', st.id), st);
    });
    await batch.commit();

    await setDoc(doc(db, 'app_state', 'main'), {
      updatedAt: Date.now(),
      studentCount: cachedDb.students.length
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore bulk seed error:', err);
  }

  return { success: true, addedCount: newGenerated.length, total: cachedDb.students.length };
}

export async function adminResetProgress(stageId: string = 'all') {
  if (stageId && stageId !== 'all') {
    cachedDb.submissions = cachedDb.submissions.filter(s => s.stageId !== stageId);
  } else {
    cachedDb.submissions = [];
    cachedDb.students.forEach(st => {
      st.qualifiedStage = 'penyisihan';
      st.status = 'aktif';
    });
  }

  // Clear submissions in Firestore
  try {
    const subSnaps = await getDocs(collection(db, 'submissions'));
    const batch = writeBatch(db);
    subSnaps.forEach(docSnap => {
      const data = docSnap.data();
      if (stageId === 'all' || data.stageId === stageId) {
        batch.delete(docSnap.ref);
      }
    });
    await batch.commit();

    // Reset student qualified stage in Firestore if full reset
    if (stageId === 'all') {
      const studentBatch = writeBatch(db);
      cachedDb.students.forEach(st => {
        studentBatch.update(doc(db, 'students', st.id), { qualifiedStage: 'penyisihan', status: 'aktif' });
      });
      await studentBatch.commit();
    }
  } catch (err) {
    console.warn('Firestore reset progress error:', err);
  }

  return { success: true };
}

// Backup & Restore utilities
export function exportDatabaseBackup(): string {
  return JSON.stringify(cachedDb, null, 2);
}

export async function importDatabaseBackup(jsonString: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed.stages || !parsed.students || !parsed.questions) {
      throw new Error('Format database backup tidak valid.');
    }
    cachedDb = parsed;

    // Push imported data to Firestore
    const batch = writeBatch(db);
    batch.set(doc(db, 'app_state', 'main'), {
      activeStageId: parsed.activeStageId || 'penyisihan',
      stages: parsed.stages,
      updatedAt: Date.now()
    });

    for (const st of parsed.students) {
      batch.set(doc(db, 'students', st.id), st);
    }
    for (const q of parsed.questions) {
      batch.set(doc(db, 'questions', q.id), q);
    }
    await batch.commit();

    return true;
  } catch (err: any) {
    console.error('Import failed', err);
    throw new Error(err.message || 'File JSON tidak valid.');
  }
}

// Legacy helpers for backwards compatibility
export function getCustomServerUrl(): string {
  return '';
}
export function setCustomServerUrl(url: string): void {}
export function getServerStatus(): boolean {
  return isFirestoreConnected;
}

// ====================================================
// REALTIME SUBSCRIPTION (FIREBASE FIRESTORE LISTENERS)
// This powers the instantaneous real-time sync between Panitia laptop & Student phones!
// ====================================================

// Ping test for real-time latency verification
export async function sendRealtimePing(): Promise<number> {
  const timestamp = Date.now();
  await setDoc(doc(db, 'app_state', 'main'), {
    lastPing: timestamp
  }, { merge: true });
  return timestamp;
}

export function subscribeToRealtimeUpdates(onEvent: (event: { type: string; data: any }) => void) {
  const unsubscribers: (() => void)[] = [];

  try {
    // 1. Listen to global app_state (stage changes, active stage) in REAL-TIME
    const unsubAppState = onSnapshot(doc(db, 'app_state', 'main'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        isFirestoreConnected = true;
        if (data.activeStageId) {
          cachedDb.activeStageId = data.activeStageId;
        }
        if (data.stages) {
          cachedDb.stages = data.stages;
        }
        if (data.announcement) {
          cachedDb.announcement = data.announcement;
        }

        const currentLeaderboard = computeLeaderboard(
          cachedDb.students,
          cachedDb.submissions,
          cachedDb.activeStageId
        );

        onEvent({
          type: 'STAGE_ACTIVATED',
          data: {
            activeStageId: cachedDb.activeStageId,
            stages: cachedDb.stages,
            announcement: cachedDb.announcement,
            leaderboard: currentLeaderboard,
            lastPing: data.lastPing
          }
        });
      }
    }, (error) => {
      console.warn('Firestore app_state snapshot error:', error);
    });
    unsubscribers.push(unsubAppState);

    // 2. Listen to submissions in REAL-TIME
    // Whenever ANY student answers a question on their phone, this triggers on the Panitia laptop!
    const unsubSubmissions = onSnapshot(collection(db, 'submissions'), (snapshot) => {
      isFirestoreConnected = true;
      const submissions: AnswerSubmission[] = [];
      snapshot.forEach(docSnap => {
        submissions.push(docSnap.data() as AnswerSubmission);
      });
      cachedDb.submissions = submissions;

      const currentLeaderboard = computeLeaderboard(
        cachedDb.students,
        submissions,
        cachedDb.activeStageId
      );

      onEvent({
        type: 'SUBMISSION_RECEIVED',
        data: {
          submissions,
          leaderboard: currentLeaderboard
        }
      });
    }, (error) => {
      console.warn('Firestore submissions snapshot error:', error);
    });
    unsubscribers.push(unsubSubmissions);

    // 3. Listen to students collection in REAL-TIME
    const unsubStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      const students: Student[] = [];
      snapshot.forEach(docSnap => {
        students.push(docSnap.data() as Student);
      });
      if (students.length > 0) {
        cachedDb.students = students;
        const currentLeaderboard = computeLeaderboard(
          students,
          cachedDb.submissions,
          cachedDb.activeStageId
        );
        onEvent({
          type: 'STUDENTS_UPDATED',
          data: {
            students,
            leaderboard: currentLeaderboard
          }
        });
      }
    }, (error) => {
      console.warn('Firestore students snapshot error:', error);
    });
    unsubscribers.push(unsubStudents);

    // 4. Listen to questions collection in REAL-TIME
    const unsubQuestions = onSnapshot(collection(db, 'questions'), (snapshot) => {
      const questions: Question[] = [];
      snapshot.forEach(docSnap => {
        questions.push(docSnap.data() as Question);
      });
      if (questions.length > 0) {
        cachedDb.questions = questions;
        onEvent({
          type: 'STATE_UPDATED',
          data: { questions }
        });
      }
    }, (error) => {
      console.warn('Firestore questions snapshot error:', error);
    });
    unsubscribers.push(unsubQuestions);

  } catch (err) {
    console.warn('Error setting up Firestore realtime listeners:', err);
  }

  return () => {
    unsubscribers.forEach(unsub => {
      try {
        unsub();
      } catch {
        // ignore
      }
    });
  };
}
