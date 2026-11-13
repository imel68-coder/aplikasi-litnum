import { collection as collectionFull, doc as docFull, onSnapshot } from 'firebase/firestore';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  where
} from 'firebase/firestore/lite';
import {
  db,
  dbLite,
  bootstrapFirestoreIfEmpty,
  classifyFirestoreError,
  CloudErrorKind,
  firebaseConfig,
  OperationType,
  testFirestoreConnection
} from './firebase';
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

// Lightweight local cache keys (NEVER store thousands of submissions in localStorage)
const LOCAL_CACHE_KEY = 'gelora26_cache_v4';
const LEGACY_LOCAL_DB_KEY = 'gelora26_offline_db_v3';

interface LocalAppCache {
  activeStageId: StageId;
  stages: Record<StageId, any>;
  students: Student[];
  questions: Question[];
  announcement?: string;
  studentsVersion: number;
  questionsVersion: number;
  leaderboard?: LeaderboardRank[];
  savedAt: number;
}

// Track Cloud status & error kind for honest UI reporting
let isFirestoreConnected = false;
let lastCloudError: CloudErrorKind = null;
let lastCloudErrorMessage = '';
let cachedStudentsVersion = 0;
let cachedQuestionsVersion = 0;
let cachedAppStateUpdatedAt = 0;
let cachedProgressMap: Record<string, StudentProgress> = {};
let cachedLeaderboard: LeaderboardRank[] = [];
let hasBootCheckedServer = false;

export function getFirestoreUpgradeUrl(): string {
  return `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;
}

export function getCloudErrorState(): {
  kind: CloudErrorKind;
  message: string;
  upgradeUrl: string;
  isConnected: boolean;
} {
  return {
    kind: lastCloudError,
    message: lastCloudErrorMessage,
    upgradeUrl: getFirestoreUpgradeUrl(),
    isConnected: isFirestoreConnected
  };
}

function recordCloudError(err: unknown, operationType: OperationType, path: string): CloudErrorKind {
  const kind = classifyFirestoreError(err);
  const rawMsg = err instanceof Error ? err.message : String(err);
  console.error('Firestore Error:', JSON.stringify({ error: rawMsg, operationType, path, kind }));
  isFirestoreConnected = false;
  lastCloudError = kind;
  if (kind === 'quota_exceeded') {
    lastCloudErrorMessage =
      'Kuota harian baca/tulis gratis Firebase Firestore telah tercapai. Data Anda tetap aman di server dan tidak terhapus.';
  } else if (kind === 'permission_denied') {
    lastCloudErrorMessage =
      'Izin akses database Firestore ditolak (Permission Denied). Hubungi Panitia untuk cek aturan keamanan Firestore.';
  } else if (kind === 'offline') {
    lastCloudErrorMessage =
      'Perangkat sedang offline atau koneksi internet tidak stabil. Menggunakan cache lokal sementara.';
  } else {
    lastCloudErrorMessage = rawMsg;
  }
  return kind;
}

function clearCloudError() {
  isFirestoreConnected = true;
  lastCloudError = null;
  lastCloudErrorMessage = '';
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const clean: Record<string, any> = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] !== undefined) {
      clean[key] = obj[key];
    }
  });
  return clean as T;
}

function loadLocalCache(): LocalAppCache | null {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalAppCache;
      if (parsed && Array.isArray(parsed.students) && Array.isArray(parsed.questions)) {
        return parsed;
      }
    }
    const legacyRaw = localStorage.getItem(LEGACY_LOCAL_DB_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (legacy && Array.isArray(legacy.students) && Array.isArray(legacy.questions)) {
        return {
          activeStageId: legacy.activeStageId || 'penyisihan',
          stages: legacy.stages || initialStages,
          students: legacy.students,
          questions: legacy.questions,
          announcement: legacy.announcement,
          studentsVersion: 0,
          questionsVersion: 0,
          savedAt: Date.now()
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function saveLocalCache(cache: LocalAppCache) {
  try {
    localStorage.removeItem(LEGACY_LOCAL_DB_KEY);
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

const initialLocal = loadLocalCache();
let cachedDb: AppDatabaseState = {
  stages: initialLocal?.stages || initialStages,
  students: initialLocal?.students?.length ? initialLocal.students : initialStudents,
  questions: initialLocal?.questions?.length ? initialLocal.questions : initialQuestions,
  submissions: [],
  studentProgress: {},
  adminPassword: 'admin',
  activeStageId: initialLocal?.activeStageId || 'penyisihan',
  announcement:
    initialLocal?.announcement ||
    'Selamat datang di Lomba Literasi dan Numerasi GELORA 26 SMPN 26 Sijunjung! Junjung tinggi kejujuran dan sportivitas.'
};
if (initialLocal) {
  cachedStudentsVersion = initialLocal.studentsVersion || 0;
  cachedQuestionsVersion = initialLocal.questionsVersion || 0;
  if (initialLocal.leaderboard) cachedLeaderboard = initialLocal.leaderboard;
}

export function getFirestoreSyncStatus(): boolean {
  return isFirestoreConnected;
}

export function computeLeaderboard(
  students: Student[],
  submissions: AnswerSubmission[],
  stageId: StageId,
  progressList: StudentProgress[] = []
): LeaderboardRank[] {
  const hierarchy: StageId[] = ['penyisihan', 'top30', 'semifinal', 'final'];
  const targetStageIndex = hierarchy.indexOf(stageId);

  const validStudents = students.filter(s => {
    const studentStageIndex = hierarchy.indexOf(s.qualifiedStage);
    return studentStageIndex >= targetStageIndex;
  });

  const subStats: Record<string, { totalScore: number; totalAnswered: number; correctCount: number; lastSubmitTime: number }> = {};

  submissions
    .filter(sub => sub.stageId === stageId)
    .forEach(sub => {
      if (!subStats[sub.studentId]) {
        subStats[sub.studentId] = { totalScore: 0, totalAnswered: 0, correctCount: 0, lastSubmitTime: 0 };
      }
      subStats[sub.studentId].totalScore += sub.scoreEarned;
      subStats[sub.studentId].totalAnswered += 1;
      if (sub.isCorrect) subStats[sub.studentId].correctCount += 1;
      if (sub.submittedAt > subStats[sub.studentId].lastSubmitTime) {
        subStats[sub.studentId].lastSubmitTime = sub.submittedAt;
      }
    });

  const progStats: Record<string, { totalScore: number; totalAnswered: number; correctCount: number; lastSubmitTime: number }> = {};
  progressList
    .filter(p => p.stageId === stageId)
    .forEach(p => {
      progStats[p.studentId] = {
        totalScore: p.totalScore || 0,
        totalAnswered: p.totalAnswered ?? (p.completedQuestionIds?.length || 0),
        correctCount: p.correctCount ?? (p.correctQuestionIds?.length || 0),
        lastSubmitTime: p.lastSubmitTime || p.lastUpdatedAt || p.finishedAt || 0
      };
    });

  const ranked: LeaderboardRank[] = validStudents
    .map(st => {
      const sStat = subStats[st.id];
      const pStat = progStats[st.id];

      let stats = { totalScore: 0, totalAnswered: 0, correctCount: 0, lastSubmitTime: 0 };
      if (pStat && sStat) {
        if (pStat.totalAnswered >= sStat.totalAnswered || pStat.lastSubmitTime >= sStat.lastSubmitTime) {
          stats = {
            totalScore: pStat.totalScore,
            totalAnswered: pStat.totalAnswered,
            correctCount: Math.max(pStat.correctCount, sStat.correctCount),
            lastSubmitTime: Math.max(pStat.lastSubmitTime, sStat.lastSubmitTime)
          };
        } else {
          stats = sStat;
        }
      } else if (pStat) {
        stats = pStat;
      } else if (sStat) {
        stats = sStat;
      }

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
// BUNDLE HELPERS (via dbLite REST so writes never hang on Listen quota)
// ====================================================

async function syncStudentsBundle(students: Student[], version: number): Promise<void> {
  try {
    const cleanStudents = students.map(s => stripUndefined(s));
    const payload = { version, updatedAt: Date.now(), items: cleanStudents };
    const size = JSON.stringify(payload).length;
    if (size < 850000) {
      await setDoc(doc(dbLite, 'app_state', 'students_bundle'), payload);
    }
    const now = Date.now();
    await setDoc(
      doc(dbLite, 'app_state', 'main'),
      {
        studentsVersion: version,
        studentCount: cleanStudents.length,
        updatedAt: now
      },
      { merge: true }
    );
    cachedStudentsVersion = version;
    cachedAppStateUpdatedAt = now;
  } catch (err) {
    console.warn('Could not sync students bundle:', err);
  }
}

async function syncQuestionsBundle(questions: Question[], version: number): Promise<void> {
  try {
    const cleanQuestions = questions.map(q => stripUndefined(q));
    const payload = { version, updatedAt: Date.now(), items: cleanQuestions };
    const size = JSON.stringify(payload).length;
    if (size < 800000) {
      await setDoc(doc(dbLite, 'app_state', 'questions_bundle'), payload);
    }
    const now = Date.now();
    await setDoc(
      doc(dbLite, 'app_state', 'main'),
      {
        questionsVersion: version,
        questionCount: cleanQuestions.length,
        updatedAt: now
      },
      { merge: true }
    );
    cachedQuestionsVersion = version;
    cachedAppStateUpdatedAt = now;
  } catch (err) {
    console.warn('Could not sync questions bundle:', err);
  }
}

let leaderboardSyncTimer: any = null;
function scheduleLeaderboardSummarySync(stageId: StageId, rankings: LeaderboardRank[]) {
  if (leaderboardSyncTimer) clearTimeout(leaderboardSyncTimer);
  leaderboardSyncTimer = setTimeout(async () => {
    try {
      await setDoc(doc(dbLite, 'app_state', `leaderboard_${stageId}`), {
        stageId,
        updatedAt: Date.now(),
        rankings: rankings.slice(0, 200)
      });
    } catch (err) {
      console.warn('Could not sync leaderboard summary:', err);
    }
  }, 2500);
}

export async function adminOptimizeCloudCache(): Promise<{ studentsCount: number; questionsCount: number }> {
  const now = Date.now();
  await syncStudentsBundle(cachedDb.students, now);
  await syncQuestionsBundle(cachedDb.questions, now);
  return {
    studentsCount: cachedDb.students.length,
    questionsCount: cachedDb.questions.length
  };
}

async function loadStudentsSmart(
  remoteVersion: number,
  userRole?: 'admin' | 'student' | null,
  forceCollection: boolean = false
): Promise<Student[]> {
  const local = loadLocalCache();
  if (
    !forceCollection &&
    remoteVersion > 0 &&
    local &&
    local.studentsVersion === remoteVersion &&
    local.students.length > 0
  ) {
    cachedStudentsVersion = remoteVersion;
    return local.students;
  }

  if (!forceCollection) {
    try {
      const bundleSnap = await getDoc(doc(dbLite, 'app_state', 'students_bundle'));
      if (bundleSnap.exists()) {
        const bData = bundleSnap.data();
        if (
          Array.isArray(bData.items) &&
          bData.items.length > 0 &&
          (remoteVersion === 0 || !bData.version || bData.version >= remoteVersion)
        ) {
          cachedStudentsVersion = bData.version || remoteVersion;
          return bData.items as Student[];
        }
      }
    } catch (err) {
      recordCloudError(err, OperationType.GET, 'app_state/students_bundle');
    }
  }

  const studentSnaps = await getDocs(collection(dbLite, 'students'));
  const students: Student[] = [];
  studentSnaps.forEach(docSnap => {
    students.push(docSnap.data() as Student);
  });

  if (students.length > 0) {
    const newVersion = remoteVersion || Date.now();
    cachedStudentsVersion = newVersion;
    if (userRole === 'admin') {
      syncStudentsBundle(students, newVersion);
    }
    return students;
  }

  return cachedDb.students;
}

async function loadQuestionsSmart(
  remoteVersion: number,
  userRole?: 'admin' | 'student' | null,
  forceCollection: boolean = false
): Promise<Question[]> {
  const local = loadLocalCache();
  if (
    !forceCollection &&
    remoteVersion > 0 &&
    local &&
    local.questionsVersion === remoteVersion &&
    local.questions.length > 0
  ) {
    cachedQuestionsVersion = remoteVersion;
    return local.questions;
  }

  if (!forceCollection) {
    try {
      const bundleSnap = await getDoc(doc(dbLite, 'app_state', 'questions_bundle'));
      if (bundleSnap.exists()) {
        const bData = bundleSnap.data();
        if (
          Array.isArray(bData.items) &&
          bData.items.length > 0 &&
          (remoteVersion === 0 || !bData.version || bData.version >= remoteVersion)
        ) {
          cachedQuestionsVersion = bData.version || remoteVersion;
          return bData.items as Question[];
        }
      }
    } catch (err) {
      recordCloudError(err, OperationType.GET, 'app_state/questions_bundle');
    }
  }

  const questionSnaps = await getDocs(collection(dbLite, 'questions'));
  const questions: Question[] = [];
  questionSnaps.forEach(docSnap => {
    questions.push(docSnap.data() as Question);
  });

  if (questions.length > 0) {
    const newVersion = remoteVersion || Date.now();
    cachedQuestionsVersion = newVersion;
    if (userRole === 'admin') {
      syncQuestionsBundle(questions, newVersion);
    }
    return questions;
  }

  return cachedDb.questions;
}

// ====================================================
// CORE APP STATE (uses dbLite REST SDK — immune to Listen quota!)
// ====================================================

export async function fetchAppState(userRole?: 'admin' | 'student' | null): Promise<{
  activeStageId: StageId;
  stages: Record<StageId, any>;
  students: Student[];
  questions: Question[];
  submissions: AnswerSubmission[];
  announcement?: string;
  leaderboard: LeaderboardRank[];
  cloudError: CloudErrorKind;
  cloudErrorMessage: string;
}> {
  let activeStageId: StageId = cachedDb.activeStageId || 'penyisihan';
  let stages = cachedDb.stages || initialStages;
  let announcement = cachedDb.announcement || 'Selamat datang di GELORA 26 SMPN 26 Sijunjung!';
  let remoteStudentsVersion = cachedStudentsVersion;
  let remoteQuestionsVersion = cachedQuestionsVersion;

  if (!hasBootCheckedServer) {
    hasBootCheckedServer = true;
    // Non-blocking boot connection check
    testFirestoreConnection().catch(() => {});
  }

  try {
    let stateDoc = await getDoc(doc(dbLite, 'app_state', 'main'));

    if (!stateDoc.exists()) {
      await bootstrapFirestoreIfEmpty(false);
      stateDoc = await getDoc(doc(dbLite, 'app_state', 'main'));
    }

    if (stateDoc.exists()) {
      const data = stateDoc.data();
      if (data.activeStageId) activeStageId = data.activeStageId;
      if (data.stages) stages = data.stages;
      if (data.announcement) announcement = data.announcement;
      if (typeof data.studentsVersion === 'number') remoteStudentsVersion = data.studentsVersion;
      if (typeof data.questionsVersion === 'number') remoteQuestionsVersion = data.questionsVersion;
      if (typeof data.updatedAt === 'number') cachedAppStateUpdatedAt = data.updatedAt;
    }

    const students = await loadStudentsSmart(
      remoteStudentsVersion,
      userRole,
      userRole === 'admin' && remoteStudentsVersion === 0
    );

    const questions = await loadQuestionsSmart(
      remoteQuestionsVersion,
      userRole,
      userRole === 'admin' && remoteQuestionsVersion === 0
    );

    let submissions: AnswerSubmission[] = cachedDb.submissions;
    let progressList: StudentProgress[] = Object.values(cachedProgressMap);
    let activeLeaderboard: LeaderboardRank[] = cachedLeaderboard;

    if (userRole === 'admin') {
      try {
        const progSnaps = await getDocs(collection(dbLite, 'student_progress'));
        const loadedProg: StudentProgress[] = [];
        cachedProgressMap = {};
        progSnaps.forEach(docSnap => {
          const p = docSnap.data() as StudentProgress;
          cachedProgressMap[docSnap.id] = p;
          loadedProg.push(p);
        });
        progressList = loadedProg;
      } catch (err) {
        recordCloudError(err, OperationType.LIST, 'student_progress');
      }

      try {
        const subSnaps = await getDocs(collection(dbLite, 'submissions'));
        const loadedSubs: AnswerSubmission[] = [];
        subSnaps.forEach(docSnap => {
          loadedSubs.push(docSnap.data() as AnswerSubmission);
        });
        submissions = loadedSubs;
      } catch (err) {
        console.warn('Could not load raw submissions, using student_progress summary:', err);
      }

      activeLeaderboard = computeLeaderboard(students, submissions, activeStageId, progressList);
      cachedLeaderboard = activeLeaderboard;
      scheduleLeaderboardSummarySync(activeStageId, activeLeaderboard);
    } else {
      try {
        const lbSnap = await getDoc(doc(dbLite, 'app_state', `leaderboard_${activeStageId}`));
        if (lbSnap.exists() && Array.isArray(lbSnap.data().rankings)) {
          activeLeaderboard = lbSnap.data().rankings as LeaderboardRank[];
          cachedLeaderboard = activeLeaderboard;
        } else {
          activeLeaderboard = computeLeaderboard(students, [], activeStageId, []);
        }
      } catch {
        activeLeaderboard = computeLeaderboard(students, [], activeStageId, []);
      }
    }

    cachedDb = {
      stages: Object.keys(stages).length ? stages : cachedDb.stages,
      students: students.length ? students : cachedDb.students,
      questions: questions.length ? questions : cachedDb.questions,
      submissions,
      studentProgress: cachedProgressMap,
      adminPassword: 'admin',
      activeStageId,
      announcement
    };

    saveLocalCache({
      activeStageId,
      stages: cachedDb.stages,
      students: cachedDb.students,
      questions: cachedDb.questions,
      announcement,
      studentsVersion: cachedStudentsVersion,
      questionsVersion: cachedQuestionsVersion,
      leaderboard: activeLeaderboard.slice(0, 50),
      savedAt: Date.now()
    });

    clearCloudError();

    return {
      activeStageId,
      stages: cachedDb.stages,
      students: cachedDb.students,
      questions: cachedDb.questions,
      submissions: cachedDb.submissions,
      announcement: cachedDb.announcement,
      leaderboard: activeLeaderboard,
      cloudError: null,
      cloudErrorMessage: ''
    };
  } catch (err) {
    const kind = recordCloudError(err, OperationType.GET, 'app_state/main');
    const local = loadLocalCache();

    const safeStudents = local?.students?.length ? local.students : cachedDb.students;
    const safeQuestions = local?.questions?.length ? local.questions : cachedDb.questions;
    const safeStages = local?.stages || cachedDb.stages;
    const safeStageId = local?.activeStageId || cachedDb.activeStageId;
    const safeLeaderboard = local?.leaderboard?.length
      ? local.leaderboard
      : computeLeaderboard(safeStudents, cachedDb.submissions || [], safeStageId, Object.values(cachedProgressMap));

    return {
      activeStageId: safeStageId,
      stages: safeStages,
      students: safeStudents,
      questions: safeQuestions,
      submissions: cachedDb.submissions || [],
      announcement: local?.announcement || cachedDb.announcement,
      leaderboard: safeLeaderboard,
      cloudError: kind,
      cloudErrorMessage: lastCloudErrorMessage
    };
  }
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
    const rawInputNo = (payload.noPeserta || '').trim();
    const inputNo = rawInputNo.toUpperCase();
    const inputPin = (payload.pin || '').trim();

    let student = cachedDb.students.find(
      s => s.noPeserta.trim().toUpperCase() === inputNo
    );

    let firestoreLookupError: CloudErrorKind = null;

    if (!student) {
      try {
        const bundleSnap = await getDoc(doc(dbLite, 'app_state', 'students_bundle'));
        if (bundleSnap.exists() && Array.isArray(bundleSnap.data().items)) {
          const bundleStudents = bundleSnap.data().items as Student[];
          if (bundleStudents.length > 0) {
            cachedDb.students = bundleStudents;
            student = bundleStudents.find(s => s.noPeserta.trim().toUpperCase() === inputNo);
          }
        }
      } catch (err) {
        firestoreLookupError = recordCloudError(err, OperationType.GET, 'app_state/students_bundle');
      }
    }

    if (!student) {
      try {
        const qUpper = query(collection(dbLite, 'students'), where('noPeserta', '==', inputNo));
        const snapUpper = await getDocs(qUpper);
        snapUpper.forEach(docSnap => {
          student = docSnap.data() as Student;
        });

        if (!student && rawInputNo !== inputNo) {
          const qRaw = query(collection(dbLite, 'students'), where('noPeserta', '==', rawInputNo));
          const snapRaw = await getDocs(qRaw);
          snapRaw.forEach(docSnap => {
            student = docSnap.data() as Student;
          });
        }
      } catch (err) {
        firestoreLookupError = recordCloudError(err, OperationType.LIST, 'students');
      }
    }

    if (!student) {
      if (firestoreLookupError === 'quota_exceeded') {
        throw new Error(
          'Kuota harian server Firebase sedang penuh untuk sementara. Data Anda TIDAK hilang — tunggu beberapa saat atau hubungi Panitia.'
        );
      }
      if (firestoreLookupError === 'permission_denied') {
        throw new Error(
          'Akses ke server database ditolak. Mohon hubungi Panitia untuk sinkronisasi aturan database.'
        );
      }
      if (firestoreLookupError === 'offline') {
        throw new Error(
          'Koneksi internet terputus saat mencari Nomor Peserta. Periksa jaringan HP kamu dan coba lagi.'
        );
      }
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
// STUDENT SUBMISSION & PROGRESS
// ====================================================

function getDraftKey(studentId: string, stageId: StageId): string {
  return `gelora26_draft_${studentId}_${stageId}`;
}

export function saveLocalStudentDraft(
  studentId: string,
  stageId: StageId,
  draft: { answers: Record<string, any>; submittedQuestionIds: string[]; questionScores?: Record<string, number>; totalScore: number }
) {
  try {
    localStorage.setItem(getDraftKey(studentId, stageId), JSON.stringify(draft));
  } catch {
    // ignore
  }
}

export function loadLocalStudentDraft(studentId: string, stageId: StageId): {
  answers: Record<string, any>;
  submittedQuestionIds: string[];
  questionScores: Record<string, number>;
  totalScore: number;
} | null {
  try {
    const raw = localStorage.getItem(getDraftKey(studentId, stageId));
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

export async function getStudentStageSubmissions(studentId: string, stageId: StageId): Promise<{
  answers: Record<string, any>;
  submittedQuestionIds: string[];
  questionScores: Record<string, number>;
  totalScore: number;
}> {
  const localDraft = loadLocalStudentDraft(studentId, stageId);
  const result = {
    answers: { ...(localDraft?.answers || {}) },
    submittedQuestionIds: [...(localDraft?.submittedQuestionIds || [])],
    questionScores: { ...(localDraft?.questionScores || {}) },
    totalScore: localDraft?.totalScore || 0
  };

  const progressId = `${studentId}_${stageId}`;
  try {
    const progSnap = await getDoc(doc(dbLite, 'student_progress', progressId));
    if (progSnap.exists()) {
      const p = progSnap.data() as StudentProgress;
      cachedProgressMap[progressId] = p;
      if (p.answers) {
        result.answers = { ...result.answers, ...p.answers };
      }
      if (p.questionScores) {
        result.questionScores = { ...result.questionScores, ...p.questionScores };
      }
      if (Array.isArray(p.completedQuestionIds)) {
        result.submittedQuestionIds = Array.from(new Set([...result.submittedQuestionIds, ...p.completedQuestionIds]));
      }
      if (typeof p.totalScore === 'number') {
        result.totalScore = Math.max(result.totalScore, p.totalScore);
      }

      if (p.answers && Object.keys(p.answers).length > 0) {
        saveLocalStudentDraft(studentId, stageId, result);
        return result;
      }
    }

    const qSubs = query(collection(dbLite, 'submissions'), where('studentId', '==', studentId));
    const subSnaps = await getDocs(qSubs);
    let scoreSum = 0;
    let foundCloudSubs = false;
    subSnaps.forEach(docSnap => {
      const s = docSnap.data() as AnswerSubmission;
      if (s.stageId === stageId) {
        foundCloudSubs = true;
        result.answers[s.questionId] = s.answer;
        result.questionScores[s.questionId] = s.scoreEarned;
        if (!result.submittedQuestionIds.includes(s.questionId)) {
          result.submittedQuestionIds.push(s.questionId);
        }
        scoreSum += s.scoreEarned;
      }
    });

    if (foundCloudSubs) {
      result.totalScore = Math.max(scoreSum, result.totalScore);
      saveLocalStudentDraft(studentId, stageId, result);
    }
  } catch (err) {
    recordCloudError(err, OperationType.GET, `student_progress/${progressId}`);
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
  cloudSynced: boolean;
}> {
  let question = cachedDb.questions.find(q => q.id === payload.questionId);
  if (!question) {
    try {
      const qDoc = await getDoc(doc(dbLite, 'questions', payload.questionId));
      if (qDoc.exists()) question = qDoc.data() as Question;
    } catch {
      // fallback
    }
  }
  if (!question) {
    question = initialQuestions.find(q => q.id === payload.questionId);
  }

  let student = cachedDb.students.find(s => s.id === payload.studentId);
  if (!student) {
    try {
      const sDoc = await getDoc(doc(dbLite, 'students', payload.studentId));
      if (sDoc.exists()) student = sDoc.data() as Student;
    } catch {
      // fallback
    }
  }
  if (!student) {
    student = initialStudents.find(s => s.id === payload.studentId);
  }

  if (!question || !student) {
    throw new Error('Soal atau Siswa tidak ditemukan');
  }

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
    } else if (correctCount > 0 && wrongCount <= 1 && correctIds.length > 0) {
      const ratio = Math.max(0, (correctCount - wrongCount * 0.5) / correctIds.length);
      scoreEarned = Math.round(ratio * maxPoints * 10) / 10;
      isCorrect = scoreEarned >= maxPoints * 0.6;
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

  const now = Date.now();
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
    submittedAt: now
  };

  const existingSubIdx = cachedDb.submissions.findIndex(s => s.id === submissionId);
  if (existingSubIdx >= 0) {
    cachedDb.submissions[existingSubIdx] = submission;
  } else {
    cachedDb.submissions.push(submission);
  }

  const progressId = `${payload.studentId}_${payload.stageId}`;
  let existingProg = cachedProgressMap[progressId];
  const localDraft = loadLocalStudentDraft(payload.studentId, payload.stageId);

  if (!existingProg) {
    try {
      const snap = await getDoc(doc(dbLite, 'student_progress', progressId));
      if (snap.exists()) {
        existingProg = snap.data() as StudentProgress;
      }
    } catch {
      // fallback to local draft
    }
  }

  const mergedAnswers: Record<string, any> = {
    ...(localDraft?.answers || {}),
    ...(existingProg?.answers || {}),
    [payload.questionId]: payload.answer
  };

  const mergedScores: Record<string, number> = {
    ...(localDraft?.questionScores || {}),
    ...(existingProg?.questionScores || {}),
    [payload.questionId]: scoreEarned
  };

  cachedDb.submissions
    .filter(s => s.studentId === payload.studentId && s.stageId === payload.stageId)
    .forEach(s => {
      if (mergedScores[s.questionId] === undefined) {
        mergedScores[s.questionId] = s.scoreEarned;
      }
      if (mergedAnswers[s.questionId] === undefined) {
        mergedAnswers[s.questionId] = s.answer;
      }
    });

  const completedQuestionIds = Array.from(
    new Set([
      ...(localDraft?.submittedQuestionIds || []),
      ...(existingProg?.completedQuestionIds || []),
      payload.questionId
    ])
  );

  const prevCorrectIds = existingProg?.correctQuestionIds || [];
  const correctQuestionIds = isCorrect
    ? Array.from(new Set([...prevCorrectIds, payload.questionId]))
    : prevCorrectIds.filter(id => id !== payload.questionId);

  const computedSum = Object.values(mergedScores).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const previousUnmappedScore =
    existingProg && !existingProg.questionScores && typeof existingProg.totalScore === 'number'
      ? existingProg.totalScore
      : 0;
  const totalScore =
    Math.round(
      Math.max(
        computedSum,
        previousUnmappedScore + (existingProg?.completedQuestionIds?.includes(payload.questionId) ? 0 : scoreEarned)
      ) * 10
    ) / 10;

  const updatedProgress: StudentProgress = {
    studentId: payload.studentId,
    stageId: payload.stageId,
    completedQuestionIds,
    correctQuestionIds,
    answers: mergedAnswers,
    questionScores: mergedScores,
    totalScore,
    totalAnswered: completedQuestionIds.length,
    correctCount: correctQuestionIds.length,
    lastSubmitTime: now,
    lastUpdatedAt: now,
    isFinished: existingProg?.isFinished || false
  };

  cachedProgressMap[progressId] = updatedProgress;
  saveLocalStudentDraft(payload.studentId, payload.stageId, {
    answers: mergedAnswers,
    submittedQuestionIds: completedQuestionIds,
    questionScores: mergedScores,
    totalScore
  });

  let cloudSynced = false;
  try {
    const batch = writeBatch(dbLite);
    batch.set(doc(dbLite, 'submissions', submissionId), submission);
    batch.set(doc(dbLite, 'student_progress', progressId), updatedProgress, { merge: true });
    // Notify Panitia laptop signal doc (NOT app_state/main so 160 student phones don't wake up)
    batch.set(
      doc(dbLite, 'app_state', 'submission_signal'),
      {
        lastSubmissionAt: now,
        lastStageId: payload.stageId,
        lastStudentId: payload.studentId
      },
      { merge: true }
    );
    await batch.commit();
    cloudSynced = true;
    clearCloudError();
  } catch (err) {
    recordCloudError(err, OperationType.WRITE, `submissions/${submissionId}`);
  }

  let currentLeaderboard = cachedLeaderboard;
  try {
    const lbSnap = await getDoc(doc(dbLite, 'app_state', `leaderboard_${payload.stageId}`));
    if (lbSnap.exists() && Array.isArray(lbSnap.data().rankings)) {
      currentLeaderboard = lbSnap.data().rankings as LeaderboardRank[];
    }
  } catch {
    // use cachedLeaderboard
  }

  const updatedList = currentLeaderboard.length
    ? currentLeaderboard.map(r =>
        r.studentId === payload.studentId
          ? {
              ...r,
              totalScore,
              totalAnswered: completedQuestionIds.length,
              correctCount: correctQuestionIds.length,
              lastSubmitTime: now
            }
          : r
      )
    : computeLeaderboard(cachedDb.students, cachedDb.submissions, payload.stageId, Object.values(cachedProgressMap));

  if (!updatedList.some(r => r.studentId === payload.studentId)) {
    updatedList.push({
      rank: updatedList.length + 1,
      studentId: student.id,
      noPeserta: student.noPeserta,
      nama: student.nama,
      sekolah: student.sekolah,
      totalScore,
      totalAnswered: completedQuestionIds.length,
      correctCount: correctQuestionIds.length,
      lastSubmitTime: now
    });
  }

  updatedList.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    return (a.lastSubmitTime || 0) - (b.lastSubmitTime || 0);
  });
  updatedList.forEach((r, idx) => {
    r.rank = idx + 1;
  });

  cachedLeaderboard = updatedList;
  const myRankEntry = updatedList.find(r => r.studentId === payload.studentId);

  return {
    success: true,
    isCorrect,
    scoreEarned,
    totalScore,
    currentRank: myRankEntry ? myRankEntry.rank : 1,
    totalParticipants: updatedList.length || cachedDb.students.length,
    topLeaderboard: updatedList.slice(0, 5),
    cloudSynced
  };
}

export async function finishStudentStage(studentId: string, stageId: StageId): Promise<{
  success: boolean;
  myRank?: LeaderboardRank;
  leaderboard: LeaderboardRank[];
}> {
  const progressId = `${studentId}_${stageId}`;
  const existing = cachedProgressMap[progressId];
  const draft = loadLocalStudentDraft(studentId, stageId);
  const totalScore = existing?.totalScore ?? draft?.totalScore ?? 0;
  const now = Date.now();

  try {
    const batch = writeBatch(dbLite);
    batch.set(
      doc(dbLite, 'student_progress', progressId),
      {
        studentId,
        stageId,
        totalScore,
        isFinished: true,
        finishedAt: now,
        lastUpdatedAt: now
      },
      { merge: true }
    );
    batch.set(
      doc(dbLite, 'app_state', 'submission_signal'),
      {
        lastSubmissionAt: now,
        lastStageId: stageId,
        lastStudentId: studentId
      },
      { merge: true }
    );
    await batch.commit();
  } catch (err) {
    recordCloudError(err, OperationType.WRITE, `student_progress/${progressId}`);
  }

  let finalLeaderboard: LeaderboardRank[] = cachedLeaderboard;
  try {
    const qProg = query(collection(dbLite, 'student_progress'), where('stageId', '==', stageId));
    const snaps = await getDocs(qProg);
    const stageProgs: StudentProgress[] = [];
    snaps.forEach(d => stageProgs.push(d.data() as StudentProgress));
    if (stageProgs.length > 0) {
      finalLeaderboard = computeLeaderboard(cachedDb.students, [], stageId, stageProgs);
      cachedLeaderboard = finalLeaderboard;
    }
  } catch {
    // Fallback to cachedLeaderboard
  }

  const myRank = finalLeaderboard.find(r => r.studentId === studentId);

  return {
    success: true,
    myRank,
    leaderboard: finalLeaderboard
  };
}

export async function fetchLeaderboard(stageId: StageId): Promise<LeaderboardRank[]> {
  return computeLeaderboard(cachedDb.students, cachedDb.submissions, stageId, Object.values(cachedProgressMap));
}

// ====================================================
// PANITIA (ADMIN) OPERATIONS WITH FIRESTORE REALTIME SYNC
// ====================================================

export async function adminActivateStage(stageId: StageId) {
  const newStages = { ...cachedDb.stages };
  Object.keys(newStages).forEach(k => {
    newStages[k as StageId] = {
      ...newStages[k as StageId],
      isActive: k === stageId
    };
  });

  cachedDb.activeStageId = stageId;
  cachedDb.stages = newStages;
  const now = Date.now();

  try {
    await setDoc(
      doc(dbLite, 'app_state', 'main'),
      {
        activeStageId: stageId,
        stages: newStages,
        updatedAt: now
      },
      { merge: true }
    );
    cachedAppStateUpdatedAt = now;
    clearCloudError();
  } catch (err) {
    recordCloudError(err, OperationType.WRITE, 'app_state/main');
    throw new Error(lastCloudErrorMessage || 'Gagal mengaktifkan babak di server.');
  }

  return { success: true, activeStageId: stageId, stages: newStages };
}

export async function adminPromoteStudents(fromStageId: StageId, toStageId: StageId, quota?: number) {
  const ranked = computeLeaderboard(
    cachedDb.students,
    cachedDb.submissions,
    fromStageId,
    Object.values(cachedProgressMap)
  );
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

  try {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < cachedDb.students.length; i += CHUNK_SIZE) {
      const chunk = cachedDb.students.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(dbLite);
      chunk.forEach(st => {
        batch.set(doc(dbLite, 'students', st.id), stripUndefined(st), { merge: true });
      });
      await batch.commit();
    }
    await syncStudentsBundle(cachedDb.students, Date.now());
  } catch (err) {
    recordCloudError(err, OperationType.WRITE, 'students');
  }

  return { success: true, promotedCount: promotedIds.length, promotedStudents };
}

export async function adminSaveQuestion(question: Partial<Question>) {
  const isEdit = !!question.id && !question.id.startsWith('new_');
  const targetId = question.id || `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const qData: Question = stripUndefined({
    ...(question as Question),
    id: targetId
  });

  if (isEdit) {
    const idx = cachedDb.questions.findIndex(q => q.id === targetId);
    if (idx >= 0) cachedDb.questions[idx] = qData;
    else cachedDb.questions.push(qData);
  } else {
    cachedDb.questions.push(qData);
  }

  try {
    await setDoc(doc(dbLite, 'questions', targetId), qData);
    await syncQuestionsBundle(cachedDb.questions, Date.now());
    clearCloudError();
  } catch (err) {
    recordCloudError(err, OperationType.WRITE, `questions/${targetId}`);
    throw new Error(lastCloudErrorMessage || 'Gagal menyimpan soal ke server.');
  }

  return { success: true, question: qData };
}

export async function adminDeleteQuestion(id: string) {
  cachedDb.questions = cachedDb.questions.filter(q => q.id !== id);
  try {
    await deleteDoc(doc(dbLite, 'questions', id));
    await syncQuestionsBundle(cachedDb.questions, Date.now());
  } catch (err) {
    recordCloudError(err, OperationType.DELETE, `questions/${id}`);
  }
  return { success: true };
}

export async function adminSaveStudent(student: Partial<Student>) {
  const isEdit = !!student.id && !student.id.startsWith('new_');
  const targetId = student.id || `std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const sData: Student = stripUndefined({
    ...(student as Student),
    id: targetId,
    qualifiedStage: student.qualifiedStage || 'penyisihan',
    status: student.status || 'aktif'
  });

  if (isEdit) {
    const idx = cachedDb.students.findIndex(s => s.id === targetId);
    if (idx >= 0) cachedDb.students[idx] = sData;
    else cachedDb.students.push(sData);
  } else {
    cachedDb.students.push(sData);
  }

  try {
    await setDoc(doc(dbLite, 'students', targetId), sData);
    await syncStudentsBundle(cachedDb.students, Date.now());
    clearCloudError();
  } catch (err) {
    recordCloudError(err, OperationType.WRITE, `students/${targetId}`);
    throw new Error(lastCloudErrorMessage || 'Gagal menyimpan data siswa ke server.');
  }

  return { success: true, student: sData };
}

export async function adminDeleteStudent(id: string) {
  cachedDb.students = cachedDb.students.filter(s => s.id !== id);
  cachedDb.submissions = cachedDb.submissions.filter(sub => sub.studentId !== id);

  try {
    await deleteDoc(doc(dbLite, 'students', id));
    await syncStudentsBundle(cachedDb.students, Date.now());
  } catch (err) {
    recordCloudError(err, OperationType.DELETE, `students/${id}`);
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
    const batch = writeBatch(dbLite);
    newGenerated.forEach(st => {
      batch.set(doc(dbLite, 'students', st.id), st);
    });
    await batch.commit();
    await syncStudentsBundle(cachedDb.students, Date.now());
  } catch (err) {
    recordCloudError(err, OperationType.WRITE, 'students');
  }

  return { success: true, addedCount: newGenerated.length, total: cachedDb.students.length };
}

export async function adminImportStudentsFromCSV(csvText: string): Promise<{ success: boolean; addedCount: number; total: number }> {
  const lines = csvText.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error('File CSV kosong.');
  }

  let startIndex = 0;
  const firstLine = lines[0].toLowerCase();
  if (firstLine.includes('peserta') || firstLine.includes('nama') || firstLine.includes('sekolah')) {
    startIndex = 1;
  }

  const parsedStudents: Student[] = [];
  for (let i = startIndex; i < lines.length; i++) {
    const rawLine = lines[i];
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let c = 0; c < rawLine.length; c++) {
      const char = rawLine[c];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === ',' || char === ';') && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current.trim());

    if (parts.length < 2) continue;

    const noPeserta = (parts[0] || '').replace(/^"|"$/g, '').trim().toUpperCase();
    const nama = (parts[1] || '').replace(/^"|"$/g, '').trim();
    const sekolah = (parts[2] || 'SMPN 26 Sijunjung').replace(/^"|"$/g, '').trim();
    const kelas = (parts[3] || 'VII / VIII').replace(/^"|"$/g, '').trim();
    const pin = (parts[6] || parts[4] || '1234').replace(/^"|"$/g, '').trim() || '1234';

    if (!noPeserta || !nama) continue;

    const existing = cachedDb.students.find(s => s.noPeserta.toUpperCase() === noPeserta);
    const studentId = existing?.id || `std_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;
    parsedStudents.push({
      id: studentId,
      noPeserta,
      nama,
      sekolah,
      kelas,
      pin,
      qualifiedStage: existing?.qualifiedStage || 'penyisihan',
      status: existing?.status || 'aktif'
    });
  }

  if (parsedStudents.length === 0) {
    throw new Error('Tidak ada data siswa yang valid ditemukan dalam file CSV.');
  }

  parsedStudents.forEach(st => {
    const existingIdx = cachedDb.students.findIndex(s => s.noPeserta.toUpperCase() === st.noPeserta.toUpperCase());
    if (existingIdx >= 0) {
      cachedDb.students[existingIdx] = { ...cachedDb.students[existingIdx], ...st };
    } else {
      cachedDb.students.push(st);
    }
  });

  try {
    const CHUNK_SIZE = 400;
    for (let c = 0; c < parsedStudents.length; c += CHUNK_SIZE) {
      const chunk = parsedStudents.slice(c, c + CHUNK_SIZE);
      const batch = writeBatch(dbLite);
      chunk.forEach(st => {
        batch.set(doc(dbLite, 'students', st.id), st, { merge: true });
      });
      await batch.commit();
    }

    await syncStudentsBundle(cachedDb.students, Date.now());
  } catch (err) {
    recordCloudError(err, OperationType.WRITE, 'students');
    throw new Error(lastCloudErrorMessage || 'Gagal mengimpor data CSV ke server.');
  }

  return { success: true, addedCount: parsedStudents.length, total: cachedDb.students.length };
}

export async function adminResetProgress(stageId: string = 'all') {
  if (stageId && stageId !== 'all') {
    cachedDb.submissions = cachedDb.submissions.filter(s => s.stageId !== stageId);
    Object.keys(cachedProgressMap).forEach(k => {
      if (cachedProgressMap[k].stageId === stageId) delete cachedProgressMap[k];
    });
  } else {
    cachedDb.submissions = [];
    cachedProgressMap = {};
    cachedDb.students.forEach(st => {
      st.qualifiedStage = 'penyisihan';
      st.status = 'aktif';
    });
  }

  try {
    const subSnaps = await getDocs(collection(dbLite, 'submissions'));
    const deleteRefs: any[] = [];
    subSnaps.forEach(docSnap => {
      const data = docSnap.data();
      if (stageId === 'all' || data.stageId === stageId) {
        deleteRefs.push(docSnap.ref);
      }
    });

    const progSnaps = await getDocs(collection(dbLite, 'student_progress'));
    progSnaps.forEach(docSnap => {
      const data = docSnap.data();
      if (stageId === 'all' || data.stageId === stageId) {
        deleteRefs.push(docSnap.ref);
      }
    });

    const CHUNK_SIZE = 400;
    for (let i = 0; i < deleteRefs.length; i += CHUNK_SIZE) {
      const batch = writeBatch(dbLite);
      deleteRefs.slice(i, i + CHUNK_SIZE).forEach(ref => batch.delete(ref));
      await batch.commit();
    }

    if (stageId === 'all') {
      for (let i = 0; i < cachedDb.students.length; i += CHUNK_SIZE) {
        const studentBatch = writeBatch(dbLite);
        cachedDb.students.slice(i, i + CHUNK_SIZE).forEach(st => {
          studentBatch.set(
            doc(dbLite, 'students', st.id),
            stripUndefined({ ...st, qualifiedStage: 'penyisihan', status: 'aktif' }),
            { merge: true }
          );
        });
        await studentBatch.commit();
      }
      await syncStudentsBundle(cachedDb.students, Date.now());
    }
  } catch (err) {
    recordCloudError(err, OperationType.DELETE, 'submissions');
  }

  return { success: true };
}

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

    const now = Date.now();
    const docsToWrite: Array<{ ref: any; data: any }> = [
      {
        ref: doc(dbLite, 'app_state', 'main'),
        data: {
          activeStageId: parsed.activeStageId || 'penyisihan',
          stages: parsed.stages,
          updatedAt: now,
          studentsVersion: now,
          questionsVersion: now
        }
      }
    ];

    for (const st of parsed.students) {
      docsToWrite.push({ ref: doc(dbLite, 'students', st.id), data: stripUndefined(st) });
    }
    for (const q of parsed.questions) {
      docsToWrite.push({ ref: doc(dbLite, 'questions', q.id), data: stripUndefined(q) });
    }

    const CHUNK_SIZE = 400;
    for (let i = 0; i < docsToWrite.length; i += CHUNK_SIZE) {
      const batch = writeBatch(dbLite);
      docsToWrite.slice(i, i + CHUNK_SIZE).forEach(item => batch.set(item.ref, item.data));
      await batch.commit();
    }

    await syncStudentsBundle(parsed.students, now);
    await syncQuestionsBundle(parsed.questions, now);

    return true;
  } catch (err: any) {
    console.error('Import failed', err);
    throw new Error(err.message || 'File JSON tidak valid.');
  }
}

export function getCustomServerUrl(): string {
  return '';
}
export function setCustomServerUrl(_url: string): void {}
export function getServerStatus(): boolean {
  return isFirestoreConnected;
}

export async function sendRealtimePing(): Promise<number> {
  const timestamp = Date.now();
  await setDoc(
    doc(dbLite, 'app_state', 'main'),
    {
      lastPing: timestamp,
      updatedAt: timestamp
    },
    { merge: true }
  );
  cachedAppStateUpdatedAt = timestamp;
  return timestamp;
}

// ====================================================
// HYBRID REALTIME SUBSCRIPTION (onSnapshot Push + Resilient REST Sync Fallback)
// Works both when Listen streams are healthy AND when Listen streams hit Quota Exceeded!
// ====================================================

async function processAppStateData(
  data: any,
  onEvent: (event: { type: string; data: any }) => void,
  userRole?: 'admin' | 'student' | null
) {
  if (!data) return;
  clearCloudError();

  const stageChanged = data.activeStageId && data.activeStageId !== cachedDb.activeStageId;
  if (data.activeStageId) cachedDb.activeStageId = data.activeStageId;
  if (data.stages) cachedDb.stages = data.stages;
  if (data.announcement) cachedDb.announcement = data.announcement;
  if (typeof data.updatedAt === 'number') cachedAppStateUpdatedAt = data.updatedAt;

  // Detect student changes via studentsVersion OR studentCount mismatch
  const needsStudentsUpdate =
    (typeof data.studentsVersion === 'number' && data.studentsVersion > cachedStudentsVersion) ||
    (typeof data.studentCount === 'number' && data.studentCount !== cachedDb.students.length);

  if (needsStudentsUpdate) {
    try {
      const latestStudents = await loadStudentsSmart(
        data.studentsVersion || 0,
        userRole,
        typeof data.studentsVersion !== 'number'
      );
      if (latestStudents.length > 0) {
        cachedDb.students = latestStudents;
        saveLocalCache({
          activeStageId: cachedDb.activeStageId,
          stages: cachedDb.stages,
          students: cachedDb.students,
          questions: cachedDb.questions,
          announcement: cachedDb.announcement,
          studentsVersion: cachedStudentsVersion,
          questionsVersion: cachedQuestionsVersion,
          savedAt: Date.now()
        });

        let updatedLb: LeaderboardRank[] | undefined;
        if (userRole === 'admin') {
          updatedLb = computeLeaderboard(
            latestStudents,
            cachedDb.submissions,
            cachedDb.activeStageId,
            Object.values(cachedProgressMap)
          );
          cachedLeaderboard = updatedLb;
        }
        onEvent({
          type: 'STUDENTS_UPDATED',
          data: { students: latestStudents, leaderboard: updatedLb }
        });
      }
    } catch (err) {
      recordCloudError(err, OperationType.GET, 'app_state/students_bundle');
    }
  }

  // Detect question changes via questionsVersion OR questionCount mismatch
  const needsQuestionsUpdate =
    (typeof data.questionsVersion === 'number' && data.questionsVersion > cachedQuestionsVersion) ||
    (typeof data.questionCount === 'number' && data.questionCount !== cachedDb.questions.length);

  if (needsQuestionsUpdate) {
    try {
      const latestQuestions = await loadQuestionsSmart(
        data.questionsVersion || 0,
        userRole,
        typeof data.questionsVersion !== 'number'
      );
      if (latestQuestions.length > 0) {
        cachedDb.questions = latestQuestions;
        saveLocalCache({
          activeStageId: cachedDb.activeStageId,
          stages: cachedDb.stages,
          students: cachedDb.students,
          questions: cachedDb.questions,
          announcement: cachedDb.announcement,
          studentsVersion: cachedStudentsVersion,
          questionsVersion: cachedQuestionsVersion,
          savedAt: Date.now()
        });
        onEvent({
          type: 'STATE_UPDATED',
          data: { questions: latestQuestions }
        });
      }
    } catch (err) {
      recordCloudError(err, OperationType.GET, 'app_state/questions_bundle');
    }
  }

  // Only compute leaderboard in-memory for admin; for students keep/fetch summary so scores aren't zeroed out!
  let nextLeaderboard: LeaderboardRank[] | undefined;
  if (userRole === 'admin') {
    nextLeaderboard = computeLeaderboard(
      cachedDb.students,
      cachedDb.submissions,
      cachedDb.activeStageId,
      Object.values(cachedProgressMap)
    );
    cachedLeaderboard = nextLeaderboard;
  } else if (stageChanged) {
    try {
      const lbSnap = await getDoc(doc(dbLite, 'app_state', `leaderboard_${cachedDb.activeStageId}`));
      if (lbSnap.exists() && Array.isArray(lbSnap.data().rankings)) {
        nextLeaderboard = lbSnap.data().rankings as LeaderboardRank[];
        cachedLeaderboard = nextLeaderboard;
      }
    } catch {
      // ignore
    }
  }

  onEvent({
    type: 'STAGE_ACTIVATED',
    data: {
      activeStageId: cachedDb.activeStageId,
      stages: cachedDb.stages,
      announcement: cachedDb.announcement,
      leaderboard: nextLeaderboard,
      lastPing: data.lastPing
    }
  });
}

export function subscribeToRealtimeUpdates(
  onEvent: (event: { type: string; data: any }) => void,
  userRole?: 'admin' | 'student' | null
) {
  const unsubscribers: (() => void)[] = [];
  let isDisposed = false;
  let snapshotHealthy = false;
  let lastKnownSubmissionSignal = 0;
  let lastAdminProgressSync = Object.values(cachedProgressMap).reduce(
    (max, p) => Math.max(max, p.lastUpdatedAt || p.lastSubmitTime || 0),
    0
  );

  // ====================================================
  // LAYER 1: Full-SDK onSnapshot (instant push when Listen streams are within quota)
  // ====================================================
  try {
    const unsubAppState = onSnapshot(
      docFull(db, 'app_state', 'main'),
      async docSnap => {
        if (isDisposed || !docSnap.exists()) return;
        snapshotHealthy = true;
        await processAppStateData(docSnap.data(), onEvent, userRole);
      },
      error => {
        snapshotHealthy = false;
        console.warn('onSnapshot(app_state/main) fallback to REST sync:', error?.message || error);
      }
    );
    unsubscribers.push(unsubAppState);

    if (userRole === 'admin') {
      const unsubProgress = onSnapshot(
        collectionFull(db, 'student_progress'),
        (snapshot: any) => {
          if (isDisposed) return;
          snapshotHealthy = true;
          clearCloudError();
          const progressList: StudentProgress[] = [];
          cachedProgressMap = {};
          snapshot.forEach((docSnap: any) => {
            const p = docSnap.data() as StudentProgress;
            cachedProgressMap[docSnap.id] = p;
            progressList.push(p);
          });

          const currentLeaderboard = computeLeaderboard(
            cachedDb.students,
            cachedDb.submissions,
            cachedDb.activeStageId,
            progressList
          );
          cachedLeaderboard = currentLeaderboard;
          scheduleLeaderboardSummarySync(cachedDb.activeStageId, currentLeaderboard);

          onEvent({
            type: 'SUBMISSION_RECEIVED',
            data: { leaderboard: currentLeaderboard }
          });
        },
        (error: any) => {
          snapshotHealthy = false;
          console.warn('onSnapshot(student_progress) fallback to REST sync:', error?.message || error);
        }
      );
      unsubscribers.push(unsubProgress);
    }
  } catch (err) {
    snapshotHealthy = false;
    console.warn('Could not attach full-SDK listeners, using REST sync:', err);
  }

  // ====================================================
  // LAYER 2: Resilient Adaptive REST Sync (dbLite)
  // Automatically runs fast when onSnapshot is blocked/disconnected!
  // ====================================================
  let pollInFlight = false;
  let pollTimer: any = null;
  let pollTick = 0;

  const runRestSync = async () => {
    if (isDisposed || pollInFlight) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    pollInFlight = true;
    pollTick += 1;

    try {
      // 1. Check app_state/main (1 read)
      const checkMain = userRole !== 'admin' || !snapshotHealthy || pollTick % 3 === 1;
      if (checkMain) {
        const mainSnap = await getDoc(doc(dbLite, 'app_state', 'main'));
        if (mainSnap.exists()) {
          const data = mainSnap.data();
          const hasChanged =
            (typeof data.updatedAt === 'number' && data.updatedAt !== cachedAppStateUpdatedAt) ||
            (data.activeStageId && data.activeStageId !== cachedDb.activeStageId) ||
            (typeof data.studentsVersion === 'number' && data.studentsVersion > cachedStudentsVersion) ||
            (typeof data.questionsVersion === 'number' && data.questionsVersion > cachedQuestionsVersion) ||
            (typeof data.studentCount === 'number' && data.studentCount !== cachedDb.students.length) ||
            (typeof data.questionCount === 'number' && data.questionCount !== cachedDb.questions.length);

          if (hasChanged) {
            await processAppStateData(data, onEvent, userRole);
          } else {
            clearCloudError();
          }
        }
      }

      // 2. For Panitia (Admin): poll tiny 1-doc submission_signal, then fetch ONLY changed progress docs!
      if (userRole === 'admin') {
        const sigSnap = await getDoc(doc(dbLite, 'app_state', 'submission_signal'));
        if (sigSnap.exists()) {
          const sigData = sigSnap.data();
          const sigTime = Number(sigData.lastSubmissionAt || 0);
          if (sigTime > lastKnownSubmissionSignal) {
            lastKnownSubmissionSignal = sigTime;
            // Fetch ONLY student_progress docs updated since lastAdminProgressSync (1-3 reads instead of 160+)
            const qUpdated =
              lastAdminProgressSync > 0
                ? query(collection(dbLite, 'student_progress'), where('lastUpdatedAt', '>', lastAdminProgressSync))
                : query(collection(dbLite, 'student_progress'), where('stageId', '==', cachedDb.activeStageId));

            const progSnaps = await getDocs(qUpdated);
            let updatedAny = false;
            progSnaps.forEach(docSnap => {
              const p = docSnap.data() as StudentProgress;
              cachedProgressMap[docSnap.id] = p;
              const ts = p.lastUpdatedAt || p.lastSubmitTime || 0;
              if (ts > lastAdminProgressSync) lastAdminProgressSync = ts;
              updatedAny = true;
            });

            if (updatedAny) {
              const currentLeaderboard = computeLeaderboard(
                cachedDb.students,
                cachedDb.submissions,
                cachedDb.activeStageId,
                Object.values(cachedProgressMap)
              );
              cachedLeaderboard = currentLeaderboard;
              scheduleLeaderboardSummarySync(cachedDb.activeStageId, currentLeaderboard);

              onEvent({
                type: 'SUBMISSION_RECEIVED',
                data: { leaderboard: currentLeaderboard }
              });
            }
          }
        }
      }
    } catch (err) {
      const kind = recordCloudError(err, OperationType.GET, 'app_state/main');
      onEvent({
        type: 'CLOUD_ERROR',
        data: { kind, message: lastCloudErrorMessage }
      });
    } finally {
      pollInFlight = false;
      if (!isDisposed) {
        // Admin polls faster (3s when fallback, 8s backup); Students poll 6s when fallback, 15s backup
        const nextDelay =
          userRole === 'admin'
            ? snapshotHealthy
              ? 8000
              : 3000
            : snapshotHealthy
            ? 15000
            : 6000;
        pollTimer = setTimeout(runRestSync, nextDelay);
      }
    }
  };

  // Start REST sync heartbeat after brief delay (3s)
  pollTimer = setTimeout(runRestSync, 3000);

  // Immediately sync when mobile user wakes screen or switches back to browser tab
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      runRestSync();
    }
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleVisibility);
  }

  return () => {
    isDisposed = true;
    if (pollTimer) clearTimeout(pollTimer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleVisibility);
    }
    unsubscribers.forEach(unsub => {
      try {
        unsub();
      } catch {
        // ignore
      }
    });
  };
}
