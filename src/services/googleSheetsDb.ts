import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore/lite';
import { auth, dbLite, firebaseConfig, FIRESTORE_DATABASE_ID } from './firebase';
import {
  LeaderboardRank,
  Question,
  QuestionType,
  StageConfig,
  StageId,
  Student,
  StudentProgress
} from '../types';

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
];

export const SHEET_TABS = {
  STAGES: 'Babak',
  STUDENTS: 'Siswa',
  QUESTIONS: 'Soal',
  PROGRESS: 'Progres_Siswa',
  LEADERBOARD: 'Peringkat_Live',
  SUBMISSIONS: 'Jawaban_Detail',
  SETTINGS: 'Pengaturan'
} as const;

export interface LinkedSpreadsheetConfig {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  bridgeWebAppUrl?: string;
  connectionMode?: 'oauth' | 'apps_script';
  useSheetsAsPrimaryDb?: boolean;
  lastSyncedAt?: number;
  updatedAt?: number;
}

export interface DriveSpreadsheetFile {
  id: string;
  name: string;
  webViewLink?: string;
  modifiedTime?: string;
}

export interface InspectedSpreadsheet {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  sheets: Array<{ sheetId: number; title: string }>;
}

const SHEETS_META_LOCAL_KEY = 'gelora26_sheets_meta_v1';

// Strictly in-memory OAuth access token cache (NEVER persisted in localStorage/sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let memoryRuntimeBridgeConfig: LinkedSpreadsheetConfig | null = null;

function readLocalSheetsMeta(): LinkedSpreadsheetConfig | null {
  if (memoryRuntimeBridgeConfig) return memoryRuntimeBridgeConfig;
  try {
    const raw = localStorage.getItem(SHEETS_META_LOCAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LinkedSpreadsheetConfig;
      memoryRuntimeBridgeConfig = parsed;
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function readEmbeddedWindowConfig(): LinkedSpreadsheetConfig | null {
  try {
    if (typeof window !== 'undefined') {
      const embedded = (window as any).__GELORA_SHEETS_CONFIG__;
      if (embedded && typeof embedded === 'object' && embedded.bridgeWebAppUrl) {
        return embedded as LinkedSpreadsheetConfig;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function getActiveGoogleSheetsBridgeUrl(): string | null {
  // 1. Check URL query parameter (?sheet=https://script.google.com/...)
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const sheetParam = (params.get('sheet') || '').trim();
      if (sheetParam.startsWith('https://script.google.com/')) {
        const existing = readLocalSheetsMeta();
        if (!existing || existing.bridgeWebAppUrl !== sheetParam || !existing.useSheetsAsPrimaryDb) {
          const nextCfg: LinkedSpreadsheetConfig = {
            spreadsheetId: existing?.spreadsheetId || '',
            spreadsheetTitle: existing?.spreadsheetTitle || 'GELORA 26 - Google Sheets',
            spreadsheetUrl: existing?.spreadsheetUrl || '',
            bridgeWebAppUrl: sheetParam,
            connectionMode: 'apps_script',
            useSheetsAsPrimaryDb: true,
            updatedAt: Date.now()
          };
          memoryRuntimeBridgeConfig = nextCfg;
          try {
            localStorage.setItem(SHEETS_META_LOCAL_KEY, JSON.stringify(nextCfg));
          } catch {
            // ignore
          }
        }
        return sheetParam;
      }
    } catch {
      // ignore
    }
  }

  // 2. Check optional build-time env variable
  const envUrl = String((import.meta as any)?.env?.VITE_GOOGLE_SHEETS_WEBAPP_URL || '').trim();
  if (envUrl.startsWith('https://script.google.com/')) {
    return envUrl;
  }

  // 3. Check config embedded directly inside single-file index.html (<head>)
  const embedded = readEmbeddedWindowConfig();
  if (
    embedded?.useSheetsAsPrimaryDb &&
    embedded.bridgeWebAppUrl &&
    embedded.bridgeWebAppUrl.startsWith('https://script.google.com/')
  ) {
    return embedded.bridgeWebAppUrl;
  }

  // 4. Check persisted config when Google Sheets Primary DB mode is turned ON
  const cfg = readLocalSheetsMeta();
  if (cfg?.useSheetsAsPrimaryDb && cfg.bridgeWebAppUrl && cfg.bridgeWebAppUrl.startsWith('https://script.google.com/')) {
    return cfg.bridgeWebAppUrl;
  }

  return null;
}

export function isGoogleSheetsPrimaryActive(): boolean {
  return Boolean(getActiveGoogleSheetsBridgeUrl());
}

export function normalizeParticipantRaw(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, '');
}

export function matchesParticipantNumber(stored: string, input: string): boolean {
  const a = normalizeParticipantRaw(stored);
  const b = normalizeParticipantRaw(input);
  if (!a || !b) return false;
  if (a === b) return true;

  const stripA = a.replace(/[^A-Z0-9]/g, '');
  const stripB = b.replace(/[^A-Z0-9]/g, '');
  if (stripA === stripB) return true;

  // Match prefix + integer number regardless of leading-zero padding (e.g. G26-01 == G26-001)
  const mA = a.match(/^([A-Z0-9-]+?)[-\s]?0*(\d+)$/) || stripA.match(/^([A-Z]+?\d*?)[0]*(\d+)$/);
  const mB = b.match(/^([A-Z0-9-]+?)[-\s]?0*(\d+)$/) || stripB.match(/^([A-Z]+?\d*?)[0]*(\d+)$/);
  if (mA && mB) {
    const pA = mA[1].replace(/[^A-Z0-9]/g, '');
    const pB = mB[1].replace(/[^A-Z0-9]/g, '');
    if (pA === pB && Number(mA[2]) === Number(mB[2])) {
      return true;
    }
  }
  return false;
}

function createProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  SCOPES.forEach(scope => provider.addScope(scope));
  return provider;
}

export function formatGoogleAuthError(error: unknown): string {
  const code = String((error as any)?.code || '').toLowerCase();
  const msg = String((error as any)?.message || error || '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  if (code.includes('unauthorized-domain')) {
    return `Domain "${host}" belum didaftarkan di Firebase Authorized Domains. Anda bisa menambahkan "${host}" di Firebase Console (Authentication → Settings → Authorized domains), ATAU langsung gunakan Metode Web App Apps Script yang 100% tanpa popup domain.`;
  }
  if (code.includes('popup-blocked')) {
    return 'Popup login Google diblokir oleh browser / iframe. Izinkan popup di browser Anda, buka aplikasi di tab baru, atau gunakan Metode Web App Apps Script.';
  }
  if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) {
    return 'Jendela login Google ditutup sebelum selesai. Jika akun @belajar.id Anda diblokir oleh admin sekolah, gunakan Metode Web App Apps Script.';
  }
  if (msg.toLowerCase().includes('admin_policy') || msg.toLowerCase().includes('access_denied')) {
    return 'Akun Google Workspace / @belajar.id memblokir izin aplikasi eksternal. Gunakan Metode Web App Apps Script yang berjalan langsung di akun Google Anda sendiri.';
  }
  return msg || 'Gagal masuk dengan akun Google.';
}

export function initGoogleWorkspaceAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
}

export async function googleWorkspaceSignIn(): Promise<{ user: User; accessToken: string }> {
  try {
    isSigningIn = true;
    const provider = createProvider();
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Izin akses Google Sheets/Drive tidak diberikan. Pastikan Anda mencentang semua izin saat login Google.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err) {
    throw new Error(formatGoogleAuthError(err));
  } finally {
    isSigningIn = false;
  }
}

export async function getGoogleAccessToken(): Promise<string | null> {
  return cachedAccessToken;
}

export function getCurrentGoogleUser(): User | null {
  return auth.currentUser;
}

export async function googleWorkspaceSignOut(): Promise<void> {
  cachedAccessToken = null;
  await auth.signOut();
}

export class GoogleAuthExpiredError extends Error {
  constructor(message = 'Sesi login Google Anda telah berakhir. Silakan masuk kembali dengan Google.') {
    super(message);
    this.name = 'GoogleAuthExpiredError';
  }
}

function parseGoogleApiError(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const msg = String(parsed?.error?.message || raw);
    if (msg.includes('has not been used in project') || msg.includes('it is disabled')) {
      return `${msg} — Aktifkan Google Sheets API & Google Drive API di Google Cloud Console, atau gunakan Metode Web App Apps Script.`;
    }
    if (msg.toLowerCase().includes('insufficient authentication scopes') || msg.toLowerCase().includes('insufficient permission')) {
      return 'Izin Google Sheets/Drive belum dicentang saat login. Silakan Keluar Akun Google lalu masuk kembali dan centang izin Spreadsheet/Drive.';
    }
    return msg;
  } catch {
    return raw || 'Terjadi kesalahan tidak diketahui';
  }
}

async function googleApiFetch(url: string, options: RequestInit = {}): Promise<any> {
  const token = await getGoogleAccessToken();
  if (!token) {
    throw new GoogleAuthExpiredError('Silakan masuk dengan akun Google Anda terlebih dahulu.');
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...((options.headers as Record<string, string>) || {})
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...options,
    headers
  });

  if (res.status === 401 || res.status === 403) {
    const errText = await res.text().catch(() => '');
    if (res.status === 401 || errText.toLowerCase().includes('invalid credentials') || errText.toLowerCase().includes('unauthenticated')) {
      cachedAccessToken = null;
      throw new GoogleAuthExpiredError();
    }
    throw new Error(`Akses Google Drive / Sheets ditolak (${res.status}): ${parseGoogleApiError(errText)}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gagal menghubungi Google Sheets/Drive (${res.status}): ${parseGoogleApiError(errText)}`);
  }

  return res.json();
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return trimmed.replace(/[^a-zA-Z0-9-_]/g, '');
}

// ====================================================
// SPREADSHEET METADATA PERSISTENCE (NO ACCESS TOKENS)
// ====================================================

function parseFirestoreStringField(fields: any, key: string): string {
  return String(fields?.[key]?.stringValue || '');
}

function parseFirestoreNumberField(fields: any, key: string): number {
  const raw = fields?.[key]?.integerValue ?? fields?.[key]?.doubleValue ?? 0;
  return Number(raw) || 0;
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 3500): Promise<any | null> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      method: 'GET',
      ...(controller ? { signal: controller.signal } : {})
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function loadLinkedSpreadsheetConfig(): Promise<LinkedSpreadsheetConfig | null> {
  let bakedCfg: LinkedSpreadsheetConfig | null = readEmbeddedWindowConfig();
  if (!bakedCfg) {
    try {
      if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
        const baked = await fetchJsonWithTimeout(`/sheets-config.json?_ts=${Date.now()}`, 1800);
        if (baked && typeof baked === 'object' && baked.bridgeWebAppUrl) {
          bakedCfg = baked as LinkedSpreadsheetConfig;
        }
      }
    } catch {
      // ignore
    }
  }

  try {
    const restUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${FIRESTORE_DATABASE_ID}/documents/app_state/sheets_config`;
    const docJson = await fetchJsonWithTimeout(restUrl, 4000);
    const fields = docJson?.fields;
    if (fields) {
      const data: LinkedSpreadsheetConfig = {
        spreadsheetId: parseFirestoreStringField(fields, 'spreadsheetId'),
        spreadsheetTitle: parseFirestoreStringField(fields, 'spreadsheetTitle') || 'GELORA 26 Database',
        spreadsheetUrl: parseFirestoreStringField(fields, 'spreadsheetUrl'),
        bridgeWebAppUrl: parseFirestoreStringField(fields, 'bridgeWebAppUrl'),
        connectionMode: (parseFirestoreStringField(fields, 'connectionMode') as 'oauth' | 'apps_script') || 'apps_script',
        useSheetsAsPrimaryDb: Boolean(fields.useSheetsAsPrimaryDb?.booleanValue),
        lastSyncedAt: parseFirestoreNumberField(fields, 'lastSyncedAt'),
        updatedAt: parseFirestoreNumberField(fields, 'updatedAt')
      };

      if (data.spreadsheetId || data.bridgeWebAppUrl || data.useSheetsAsPrimaryDb === false) {
        const resolved =
          !data.bridgeWebAppUrl && bakedCfg?.bridgeWebAppUrl
            ? bakedCfg
            : data;
        memoryRuntimeBridgeConfig = resolved;
        try {
          localStorage.setItem(SHEETS_META_LOCAL_KEY, JSON.stringify(resolved));
        } catch {
          // ignore
        }
        return resolved;
      }
    }
  } catch {
    // fallback to baked/embedded config or local cache
  }

  if (bakedCfg && bakedCfg.bridgeWebAppUrl) {
    memoryRuntimeBridgeConfig = bakedCfg;
    try {
      localStorage.setItem(SHEETS_META_LOCAL_KEY, JSON.stringify(bakedCfg));
    } catch {
      // ignore
    }
    return bakedCfg;
  }

  return readLocalSheetsMeta();
}

export async function saveLinkedSpreadsheetConfig(config: LinkedSpreadsheetConfig): Promise<void> {
  const clean: LinkedSpreadsheetConfig = {
    spreadsheetId: config.spreadsheetId || '',
    spreadsheetTitle: config.spreadsheetTitle || 'GELORA 26 Database',
    spreadsheetUrl: config.spreadsheetUrl || '',
    bridgeWebAppUrl: config.bridgeWebAppUrl || '',
    connectionMode: config.connectionMode || (config.bridgeWebAppUrl ? 'apps_script' : 'oauth'),
    useSheetsAsPrimaryDb: Boolean(config.useSheetsAsPrimaryDb),
    lastSyncedAt: config.lastSyncedAt || Date.now(),
    updatedAt: Date.now()
  };

  memoryRuntimeBridgeConfig = clean;
  try {
    localStorage.setItem(SHEETS_META_LOCAL_KEY, JSON.stringify(clean));
  } catch {
    // ignore
  }

  try {
    await setDoc(doc(dbLite, 'app_state', 'sheets_config'), clean, { merge: true });
  } catch {
    // Firestore quota fallback: local metadata still saved
  }
}

export async function clearLinkedSpreadsheetConfig(): Promise<void> {
  memoryRuntimeBridgeConfig = null;
  try {
    localStorage.removeItem(SHEETS_META_LOCAL_KEY);
  } catch {
    // ignore
  }
  try {
    await setDoc(
      doc(dbLite, 'app_state', 'sheets_config'),
      {
        spreadsheetId: '',
        spreadsheetTitle: '',
        spreadsheetUrl: '',
        bridgeWebAppUrl: '',
        useSheetsAsPrimaryDb: false,
        updatedAt: Date.now()
      },
      { merge: true }
    );
  } catch {
    // ignore
  }
}

// ====================================================
// TABULAR PAYLOAD BUILDER & PARSER (SHARED BY OAUTH & APPS SCRIPT)
// ====================================================

function clampCell(value: unknown, fallbackIfTooLarge?: string): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (str.length <= 49000) return str;
  if (fallbackIfTooLarge) return fallbackIfTooLarge;
  return str.slice(0, 49000);
}

export function buildTabularSheetsPayload(payload: {
  activeStageId: StageId;
  stages: Record<StageId, StageConfig>;
  students: Student[];
  questions: Question[];
  progressList: StudentProgress[];
  leaderboard: LeaderboardRank[];
  announcement?: string;
}) {
  const stageRows = [
    ['stageId', 'name', 'subtitle', 'description', 'isActive', 'maxDurationMinutes', 'passingQuota'],
    ...Object.values(payload.stages).map(st => [
      st.id,
      st.name || st.id,
      st.subtitle || '',
      clampCell(st.description),
      st.id === payload.activeStageId || st.isActive ? 'TRUE' : 'FALSE',
      String(st.maxDurationMinutes ?? 60),
      String(st.passingQuota ?? 30)
    ])
  ];

  const studentRows = [
    ['id', 'noPeserta', 'nama', 'sekolah', 'kelas', 'pin', 'qualifiedStage', 'status'],
    ...payload.students.map(st => [
      st.id,
      st.noPeserta,
      st.nama,
      st.sekolah,
      st.kelas,
      st.pin || '1234',
      st.qualifiedStage || 'penyisihan',
      st.status || 'aktif'
    ])
  ];

  const questionRows = [
    [
      'id',
      'stageId',
      'order',
      'type',
      'category',
      'points',
      'stimulusText',
      'questionPrompt',
      'imageUrl',
      'optionsJson',
      'correctOptionIdsJson',
      'trueFalseJson',
      'matchingPairsJson'
    ],
    ...payload.questions
      .slice()
      .sort((a, b) => (a.stageId === b.stageId ? a.order - b.order : a.stageId.localeCompare(b.stageId)))
      .map(q => [
        q.id,
        q.stageId,
        String(q.order),
        q.type,
        q.category,
        String(q.points ?? 10),
        clampCell(q.stimulusText),
        clampCell(q.questionPrompt),
        clampCell(q.imageUrl, '[IMAGE_IN_FIRESTORE]'),
        clampCell(JSON.stringify(q.options || [])),
        clampCell(JSON.stringify(q.correctOptionIds || [])),
        clampCell(JSON.stringify(q.trueFalseStatements || [])),
        clampCell(JSON.stringify(q.matchingPairs || []))
      ])
  ];

  const studentLookup = new Map(payload.students.map(s => [s.id, s]));
  const progressRows = [
    [
      'progressId',
      'studentId',
      'noPeserta',
      'nama',
      'sekolah',
      'stageId',
      'totalScore',
      'totalAnswered',
      'correctCount',
      'isFinished',
      'lastUpdatedAt',
      'completedQuestionIdsJson',
      'correctQuestionIdsJson',
      'answersJson',
      'questionScoresJson'
    ],
    ...payload.progressList.map(p => {
      const st = studentLookup.get(p.studentId);
      const ts = p.lastUpdatedAt || p.lastSubmitTime || 0;
      return [
        `${p.studentId}_${p.stageId}`,
        p.studentId,
        st?.noPeserta || '',
        st?.nama || '',
        st?.sekolah || '',
        p.stageId,
        String(p.totalScore ?? 0),
        String(p.totalAnswered ?? p.completedQuestionIds?.length ?? 0),
        String(p.correctCount ?? p.correctQuestionIds?.length ?? 0),
        p.isFinished ? 'TRUE' : 'FALSE',
        String(ts || Date.now()),
        clampCell(JSON.stringify(p.completedQuestionIds || [])),
        clampCell(JSON.stringify(p.correctQuestionIds || [])),
        clampCell(JSON.stringify(p.answers || {})),
        clampCell(JSON.stringify(p.questionScores || {}))
      ];
    })
  ];

  const leaderboardRows = [
    ['rank', 'stageId', 'studentId', 'noPeserta', 'nama', 'sekolah', 'totalScore', 'totalAnswered', 'correctCount', 'lastSubmitTime'],
    ...payload.leaderboard.map(r => [
      String(r.rank),
      payload.activeStageId,
      r.studentId,
      r.noPeserta,
      r.nama,
      r.sekolah,
      String(r.totalScore),
      String(r.totalAnswered),
      String(r.correctCount),
      String(r.lastSubmitTime || 0)
    ])
  ];

  const nowMs = String(Date.now());
  const settingsRows = [
    ['key', 'value', 'updatedAt'],
    ['activeStageId', payload.activeStageId, nowMs],
    ['announcement', clampCell(payload.announcement || ''), nowMs],
    ['totalStudents', String(payload.students.length), nowMs],
    ['totalQuestions', String(payload.questions.length), nowMs],
    ['studentsVersion', nowMs, nowMs],
    ['questionsVersion', nowMs, nowMs],
    ['lastSubmissionAt', nowMs, nowMs],
    ['updatedAt', nowMs, nowMs]
  ];

  return {
    stageRows,
    studentRows,
    questionRows,
    progressRows,
    leaderboardRows,
    settingsRows
  };
}

function safeJsonParse<T>(raw: any, fallback: T): T {
  if (raw === undefined || raw === null) return fallback;
  const str = String(raw).trim();
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

function normalizeStageId(raw: string | undefined): StageId {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'top30' || val === 'semifinal' || val === 'final') return val;
  return 'penyisihan';
}

function normalizeQuestionType(raw: string | undefined): QuestionType {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'pg_complex' || val === 'true_false' || val === 'matching') return val;
  return 'pg_single';
}

export function parseRowsIntoAppData(
  rowsByTab: Map<string, any[][]>,
  existingQuestions: Question[] = [],
  existingStages?: Record<StageId, StageConfig>
): {
  students: Student[];
  questions: Question[];
  activeStageId?: StageId;
  stages?: Record<StageId, StageConfig>;
  announcement?: string;
  studentsVersion?: number;
  questionsVersion?: number;
  updatedAt?: number;
  lastSubmissionAt?: number;
} {
  // 1. Parse Students
  const parsedStudents: Student[] = [];
  const rawStudentRows = rowsByTab.get(SHEET_TABS.STUDENTS) || [];
  if (rawStudentRows.length > 1) {
    const headers = rawStudentRows[0].map(h => String(h || '').trim().toLowerCase());
    const idx = (names: string[], fallback: number) => {
      const found = headers.findIndex(h => names.includes(h));
      return found >= 0 ? found : fallback;
    };
    const iId = idx(['id'], 0);
    const iNo = idx(['nopeserta', 'no_peserta', 'no peserta', 'no. peserta', 'nomor peserta', 'nomor_peserta'], 1);
    const iNama = idx(['nama', 'nama siswa', 'nama_siswa', 'nama lengkap'], 2);
    const iSekolah = idx(['sekolah', 'asal sekolah', 'asal_sekolah'], 3);
    const iKelas = idx(['kelas'], 4);
    const iPin = idx(['pin', 'pin masuk'], 5);
    const iStage = idx(['qualifiedstage', 'qualified_stage', 'babak'], 6);
    const iStatus = idx(['status'], 7);

    for (let r = 1; r < rawStudentRows.length; r++) {
      const row = rawStudentRows[r];
      const noPeserta = String(row[iNo] || '').trim().toUpperCase();
      const nama = String(row[iNama] || '').trim();
      if (!noPeserta || !nama) continue;

      const rawStatus = String(row[iStatus] || '').trim().toLowerCase();
      const status: Student['status'] =
        rawStatus === 'lolos' || rawStatus === 'gugur' || rawStatus === 'selesai' ? rawStatus : 'aktif';

      parsedStudents.push({
        id: String(row[iId] || '').trim() || `std_gs_${noPeserta.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        noPeserta,
        nama,
        sekolah: String(row[iSekolah] || 'SMPN 26 Sijunjung').trim(),
        kelas: String(row[iKelas] || 'VIII').trim(),
        pin: String(row[iPin] || '1234').trim() || '1234',
        qualifiedStage: normalizeStageId(String(row[iStage] || '')),
        status
      });
    }
  }

  // 2. Parse Questions
  const existingQMap = new Map(existingQuestions.map(q => [q.id, q]));
  const parsedQuestions: Question[] = [];
  const rawQuestionRows = rowsByTab.get(SHEET_TABS.QUESTIONS) || [];
  if (rawQuestionRows.length > 1) {
    const headers = rawQuestionRows[0].map(h => String(h || '').trim().toLowerCase());
    const idx = (names: string[], fallback: number) => {
      const found = headers.findIndex(h => names.includes(h));
      return found >= 0 ? found : fallback;
    };
    const iId = idx(['id'], 0);
    const iStage = idx(['stageid', 'stage_id', 'babak'], 1);
    const iOrder = idx(['order', 'urutan', 'no'], 2);
    const iType = idx(['type', 'tipe'], 3);
    const iCat = idx(['category', 'kategori'], 4);
    const iPoints = idx(['points', 'poin', 'skor'], 5);
    const iStimulus = idx(['stimulustext', 'stimulus'], 6);
    const iPrompt = idx(['questionprompt', 'pertanyaan', 'prompt'], 7);
    const iImg = idx(['imageurl', 'image_url', 'gambar'], 8);
    const iOpts = idx(['optionsjson', 'options_json'], 9);
    const iCorrect = idx(['correctoptionidsjson', 'correct_option_ids_json'], 10);
    const iTf = idx(['truefalsejson', 'true_false_json'], 11);
    const iMatch = idx(['matchingpairsjson', 'matching_pairs_json'], 12);

    for (let r = 1; r < rawQuestionRows.length; r++) {
      const row = rawQuestionRows[r];
      const qId = String(row[iId] || '').trim();
      const prompt = String(row[iPrompt] || '').trim();
      if (!qId && !prompt) continue;

      const resolvedId = qId || `q_gs_${r}_${Date.now()}`;
      const existing = existingQMap.get(resolvedId);
      const rawImage = String(row[iImg] || '').trim();
      const imageUrl =
        rawImage === '[IMAGE_IN_FIRESTORE]'
          ? existing?.imageUrl
          : rawImage || undefined;

      const catRaw = String(row[iCat] || '').trim().toLowerCase();
      const category: Question['category'] = catRaw === 'numerasi' ? 'numerasi' : 'literasi';
      const qType = normalizeQuestionType(String(row[iType] || ''));

      const options = safeJsonParse<Question['options']>(row[iOpts], existing?.options || []);
      const correctOptionIds = safeJsonParse<string[]>(row[iCorrect], existing?.correctOptionIds || []);
      const trueFalseStatements = safeJsonParse<Question['trueFalseStatements']>(row[iTf], existing?.trueFalseStatements || []);
      const matchingPairs = safeJsonParse<Question['matchingPairs']>(row[iMatch], existing?.matchingPairs || []);

      const qObj: Question = {
        id: resolvedId,
        stageId: normalizeStageId(String(row[iStage] || '')),
        order: Number(row[iOrder]) || r,
        type: qType,
        category,
        stimulusText: String(row[iStimulus] || ''),
        questionPrompt: prompt || existing?.questionPrompt || '',
        points: Number(row[iPoints]) >= 0 ? Number(row[iPoints]) : 10,
        ...(imageUrl ? { imageUrl } : {}),
        ...(options && options.length ? { options } : {}),
        ...(correctOptionIds && correctOptionIds.length ? { correctOptionIds } : {}),
        ...(trueFalseStatements && trueFalseStatements.length ? { trueFalseStatements } : {}),
        ...(matchingPairs && matchingPairs.length ? { matchingPairs } : {})
      };
      parsedQuestions.push(qObj);
    }
  }

  // 3. Parse Settings
  let activeStageId: StageId | undefined;
  let announcement: string | undefined;
  let studentsVersion: number | undefined;
  let questionsVersion: number | undefined;
  let updatedAt: number | undefined;
  let lastSubmissionAt: number | undefined;

  const rawSettingsRows = rowsByTab.get(SHEET_TABS.SETTINGS) || [];
  for (let r = 1; r < rawSettingsRows.length; r++) {
    const key = String(rawSettingsRows[r][0] || '').trim();
    const val = String(rawSettingsRows[r][1] || '').trim();
    if (key === 'activeStageId' && val) activeStageId = normalizeStageId(val);
    else if (key === 'announcement' && val) announcement = val;
    else if (key === 'studentsVersion' && Number(val)) studentsVersion = Number(val);
    else if (key === 'questionsVersion' && Number(val)) questionsVersion = Number(val);
    else if (key === 'updatedAt' && Number(val)) updatedAt = Number(val);
    else if (key === 'lastSubmissionAt' && Number(val)) lastSubmissionAt = Number(val);
  }

  // 4. Parse Stages
  let parsedStages: Record<StageId, StageConfig> | undefined = existingStages ? { ...existingStages } : undefined;
  const rawStageRows = rowsByTab.get(SHEET_TABS.STAGES) || [];
  if (rawStageRows.length > 1 && parsedStages) {
    for (let r = 1; r < rawStageRows.length; r++) {
      const row = rawStageRows[r];
      const sId = normalizeStageId(String(row[0] || ''));
      const base = parsedStages[sId];
      if (!base) continue;
      const isActiveFlag = String(row[4] || '').trim().toUpperCase() === 'TRUE';
      if (isActiveFlag && !activeStageId) {
        activeStageId = sId;
      }
      parsedStages[sId] = {
        ...base,
        name: String(row[1] || base.name).trim(),
        subtitle: String(row[2] ?? base.subtitle).trim(),
        description: String(row[3] ?? base.description).trim(),
        isActive: activeStageId ? sId === activeStageId : isActiveFlag,
        maxDurationMinutes: Number(row[5]) || base.maxDurationMinutes,
        passingQuota: Number(row[6]) || base.passingQuota
      };
    }
  }

  return {
    students: parsedStudents,
    questions: parsedQuestions,
    activeStageId,
    stages: parsedStages,
    announcement,
    studentsVersion,
    questionsVersion,
    updatedAt,
    lastSubmissionAt
  };
}

export function parseProgressRowsFromSheet(rows: any[][]): StudentProgress[] {
  if (!Array.isArray(rows) || rows.length <= 1) return [];
  const list: StudentProgress[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const studentId = String(row[1] || '').trim();
    const stageId = normalizeStageId(String(row[5] || ''));
    if (!studentId) continue;

    const totalScore = Number(row[6]) || 0;
    const totalAnswered = Number(row[7]) || 0;
    const correctCount = Number(row[8]) || 0;
    const isFinished = String(row[9] || '').toUpperCase() === 'TRUE';
    const rawTs = row[10];
    const lastUpdatedAt =
      typeof rawTs === 'number'
        ? rawTs
        : Number(rawTs) || (rawTs ? Date.parse(String(rawTs)) || 0 : 0);

    const completedQuestionIds = safeJsonParse<string[]>(row[11], []);
    const correctQuestionIds = safeJsonParse<string[]>(row[12], []);
    const answers = safeJsonParse<Record<string, any>>(row[13], {});
    const questionScores = safeJsonParse<Record<string, number>>(row[14], {});

    list.push({
      studentId,
      stageId,
      completedQuestionIds,
      correctQuestionIds,
      answers,
      questionScores,
      totalScore,
      totalAnswered: totalAnswered || completedQuestionIds.length,
      correctCount: correctCount || correctQuestionIds.length,
      lastSubmitTime: lastUpdatedAt,
      lastUpdatedAt,
      isFinished
    });
  }
  return list;
}

export function parseLeaderboardRowsFromSheet(rows: any[][]): LeaderboardRank[] {
  if (!Array.isArray(rows) || rows.length <= 1) return [];
  const list: LeaderboardRank[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const studentId = String(row[2] || '').trim();
    if (!studentId) continue;
    const rawTs = row[9];
    const lastSubmitTime =
      typeof rawTs === 'number'
        ? rawTs
        : Number(rawTs) || (rawTs ? Date.parse(String(rawTs)) || 0 : 0);

    list.push({
      rank: Number(row[0]) || list.length + 1,
      studentId,
      noPeserta: String(row[3] || '').trim(),
      nama: String(row[4] || '').trim(),
      sekolah: String(row[5] || '').trim(),
      totalScore: Number(row[6]) || 0,
      totalAnswered: Number(row[7]) || 0,
      correctCount: Number(row[8]) || 0,
      lastSubmitTime
    });
  }
  return list;
}

// ====================================================
// MODE 1: GOOGLE DRIVE & GOOGLE SHEETS DIRECT API (OAUTH)
// ====================================================

export async function listDriveSpreadsheets(): Promise<DriveSpreadsheetFile[]> {
  const q = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const fields = encodeURIComponent('files(id,name,webViewLink,modifiedTime)');
  const data = await googleApiFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=modifiedTime desc&pageSize=25`
  );
  return Array.isArray(data?.files) ? data.files : [];
}

export async function inspectSpreadsheet(spreadsheetIdOrUrl: string): Promise<InspectedSpreadsheet> {
  const id = extractSpreadsheetId(spreadsheetIdOrUrl);
  if (!id) {
    throw new Error('ID atau tautan Google Spreadsheet tidak valid.');
  }

  const fields = encodeURIComponent('spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title)');
  const data = await googleApiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=${fields}`);

  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
    title: data.properties?.title || 'GELORA 26 Database',
    sheets: Array.isArray(data.sheets)
      ? data.sheets.map((s: any) => ({
          sheetId: Number(s.properties?.sheetId || 0),
          title: String(s.properties?.title || '')
        }))
      : []
  };
}

export async function createGeloraSpreadsheet(
  customTitle = 'GELORA 26 - Database Lomba (AppSheet Ready)'
): Promise<InspectedSpreadsheet> {
  const tabList = [
    SHEET_TABS.STAGES,
    SHEET_TABS.STUDENTS,
    SHEET_TABS.QUESTIONS,
    SHEET_TABS.PROGRESS,
    SHEET_TABS.LEADERBOARD,
    SHEET_TABS.SUBMISSIONS,
    SHEET_TABS.SETTINGS
  ];

  const created = await googleApiFetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        title: customTitle,
        locale: 'id_ID'
      },
      sheets: tabList.map(tabTitle => ({
        properties: {
          title: tabTitle,
          gridProperties: { frozenRowCount: 1 }
        }
      }))
    })
  });

  const createdSheets: Array<{ sheetId: number; title: string }> = Array.isArray(created.sheets)
    ? created.sheets.map((s: any) => ({
        sheetId: Number(s.properties?.sheetId || 0),
        title: String(s.properties?.title || '')
      }))
    : [];

  if (createdSheets.length > 0) {
    try {
      await googleApiFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          body: JSON.stringify({
            requests: createdSheets.map(s => ({
              repeatCell: {
                range: { sheetId: s.sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.12, green: 0.23, blue: 0.54 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            }))
          })
        }
      );
    } catch {
      // Non-fatal styling
    }
  }

  return {
    spreadsheetId: created.spreadsheetId,
    spreadsheetUrl: created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${created.spreadsheetId}/edit`,
    title: created.properties?.title || customTitle,
    sheets: createdSheets
  };
}

export async function syncDatabaseToSpreadsheet(
  spreadsheetId: string,
  payload: {
    activeStageId: StageId;
    stages: Record<StageId, StageConfig>;
    students: Student[];
    questions: Question[];
    progressList: StudentProgress[];
    leaderboard: LeaderboardRank[];
    announcement?: string;
  }
): Promise<LinkedSpreadsheetConfig> {
  const meta = await inspectSpreadsheet(spreadsheetId);
  const existingTitles = new Set(meta.sheets.map(s => s.title));
  const managedTabs = [
    SHEET_TABS.STAGES,
    SHEET_TABS.STUDENTS,
    SHEET_TABS.QUESTIONS,
    SHEET_TABS.PROGRESS,
    SHEET_TABS.LEADERBOARD,
    SHEET_TABS.SETTINGS
  ];
  const missingTabs = managedTabs.filter(t => !existingTitles.has(t));

  if (missingTabs.length > 0) {
    await googleApiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${meta.spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: missingTabs.map(title => ({
            addSheet: {
              properties: {
                title,
                gridProperties: { frozenRowCount: 1 }
              }
            }
          }))
        })
      }
    );
  }

  await googleApiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${meta.spreadsheetId}/values:batchClear`,
    {
      method: 'POST',
      body: JSON.stringify({
        ranges: managedTabs.map(t => `'${t}'!A:Z`)
      })
    }
  );

  const tabular = buildTabularSheetsPayload(payload);

  await googleApiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${meta.spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: [
          { range: `'${SHEET_TABS.STAGES}'!A1`, values: tabular.stageRows },
          { range: `'${SHEET_TABS.STUDENTS}'!A1`, values: tabular.studentRows },
          { range: `'${SHEET_TABS.QUESTIONS}'!A1`, values: tabular.questionRows },
          { range: `'${SHEET_TABS.PROGRESS}'!A1`, values: tabular.progressRows },
          { range: `'${SHEET_TABS.LEADERBOARD}'!A1`, values: tabular.leaderboardRows },
          { range: `'${SHEET_TABS.SETTINGS}'!A1`, values: tabular.settingsRows }
        ]
      })
    }
  );

  const existing = readLocalSheetsMeta();
  const savedConfig: LinkedSpreadsheetConfig = {
    spreadsheetId: meta.spreadsheetId,
    spreadsheetTitle: meta.title,
    spreadsheetUrl: meta.spreadsheetUrl,
    bridgeWebAppUrl: existing?.bridgeWebAppUrl || '',
    connectionMode: 'oauth',
    useSheetsAsPrimaryDb: existing?.useSheetsAsPrimaryDb || false,
    lastSyncedAt: Date.now()
  };
  await saveLinkedSpreadsheetConfig(savedConfig);
  return savedConfig;
}

export async function importDatabaseFromSpreadsheet(
  spreadsheetId: string,
  existingQuestions: Question[] = [],
  existingStages?: Record<StageId, StageConfig>
): Promise<{
  spreadsheet: InspectedSpreadsheet;
  students: Student[];
  questions: Question[];
  activeStageId?: StageId;
  stages?: Record<StageId, StageConfig>;
}> {
  const meta = await inspectSpreadsheet(spreadsheetId);
  const tabTitles = new Set(meta.sheets.map(s => s.title));

  const targetRanges: string[] = [];
  if (tabTitles.has(SHEET_TABS.STUDENTS)) targetRanges.push(`'${SHEET_TABS.STUDENTS}'!A:Z`);
  if (tabTitles.has(SHEET_TABS.QUESTIONS)) targetRanges.push(`'${SHEET_TABS.QUESTIONS}'!A:Z`);
  if (tabTitles.has(SHEET_TABS.STAGES)) targetRanges.push(`'${SHEET_TABS.STAGES}'!A:Z`);
  if (tabTitles.has(SHEET_TABS.SETTINGS)) targetRanges.push(`'${SHEET_TABS.SETTINGS}'!A:Z`);

  if (targetRanges.length === 0) {
    throw new Error(
      `Spreadsheet "${meta.title}" belum memiliki tab database GELORA 26 (${SHEET_TABS.STUDENTS} / ${SHEET_TABS.QUESTIONS}).`
    );
  }

  const queryParams = targetRanges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
  const batchRes = await googleApiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${meta.spreadsheetId}/values:batchGet?${queryParams}`
  );

  const valueRanges: Array<{ range: string; values?: string[][] }> = batchRes?.valueRanges || [];
  const rowsByTab = new Map<string, string[][]>();
  valueRanges.forEach(vr => {
    const tabName = (vr.range || '').split('!')[0].replace(/^'|'$/g, '');
    rowsByTab.set(tabName, vr.values || []);
  });

  const parsed = parseRowsIntoAppData(rowsByTab, existingQuestions, existingStages);
  return {
    spreadsheet: meta,
    ...parsed
  };
}

// ====================================================
// MODE 2: GOOGLE APPS SCRIPT WEB APP BRIDGE (FULL EXAM ENGINE)
// Supports 164 concurrent students via LockService + CacheService!
// ====================================================

export const APPS_SCRIPT_BRIDGE_CODE = `// ================================================================
// GELORA 26 - GOOGLE SHEETS FULL EXAM DATABASE ENGINE (Code.gs)
// Mendukung Ujian Siswa Realtime, LockService 164+ Peserta & AppSheet
// ================================================================

var CACHE_TTL_SEC = 45;
var TABS = {
  STAGES: 'Babak',
  STUDENTS: 'Siswa',
  QUESTIONS: 'Soal',
  PROGRESS: 'Progres_Siswa',
  LEADERBOARD: 'Peringkat_Live',
  SUBMISSIONS: 'Jawaban_Detail',
  SETTINGS: 'Pengaturan'
};

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = params.action || 'ping';
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (action === 'ping') {
    return jsonOut({
      ok: true,
      version: 5,
      spreadsheetId: ss.getId(),
      title: ss.getName(),
      url: ss.getUrl()
    });
  }

  if (action === 'poll') {
    var cache = CacheService.getScriptCache();
    var cachedPoll = cache.get('gelora_poll_v2');
    if (cachedPoll) return textJsonOut(cachedPoll);

    var settingsMap = readSettingsMap(ss);
    var resObj = {
      ok: true,
      activeStageId: settingsMap.activeStageId || 'penyisihan',
      studentsVersion: Number(settingsMap.studentsVersion || 0),
      questionsVersion: Number(settingsMap.questionsVersion || 0),
      lastSubmissionAt: Number(settingsMap.lastSubmissionAt || 0),
      updatedAt: Number(settingsMap.updatedAt || 0)
    };
    var str = JSON.stringify(resObj);
    try { cache.put('gelora_poll_v2', str, 2); } catch (err) {}
    return textJsonOut(str);
  }

  if (action === 'findStudent') {
    var rawQuery = String(params.noPeserta || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!rawQuery) return jsonOut({ ok: true, found: false });
    var sRows = readTabValues(ss, TABS.STUDENTS);
    if (sRows.length <= 1) return jsonOut({ ok: true, found: false });

    var normVal = function(s) {
      return String(s || '').trim().toUpperCase().replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, '');
    };
    var parsePrefixNum = function(val) {
      var m = val.match(/^([A-Z0-9-]+?)[-\s]?0*(\d+)$/);
      if (!m) return null;
      return { prefix: m[1].replace(/[^A-Z0-9]/g, ''), num: Number(m[2]) };
    };
    var targetNorm = normVal(rawQuery);
    var targetPN = parsePrefixNum(targetNorm);

    var headers = sRows[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
    var colIdx = function(names, fb) {
      for (var k = 0; k < headers.length; k++) {
        if (names.indexOf(headers[k]) >= 0) return k;
      }
      return fb;
    };
    var cId = colIdx(['id'], 0);
    var cNo = colIdx(['nopeserta', 'no_peserta', 'no peserta', 'no. peserta', 'nomor peserta'], 1);
    var cNama = colIdx(['nama', 'nama siswa', 'nama lengkap'], 2);
    var cSekolah = colIdx(['sekolah', 'asal sekolah'], 3);
    var cKelas = colIdx(['kelas'], 4);
    var cPin = colIdx(['pin'], 5);
    var cStage = colIdx(['qualifiedstage', 'qualified_stage', 'babak'], 6);
    var cStatus = colIdx(['status'], 7);

    for (var i = 1; i < sRows.length; i++) {
      var rowNo = normVal(sRows[i][cNo]);
      if (!rowNo) continue;
      var matched = (rowNo === targetNorm) || (rowNo.replace(/[^A-Z0-9]/g, '') === targetNorm.replace(/[^A-Z0-9]/g, ''));
      if (!matched && targetPN) {
        var rowPN = parsePrefixNum(rowNo);
        if (rowPN && rowPN.prefix === targetPN.prefix && rowPN.num === targetPN.num) {
          matched = true;
        }
      }
      if (matched) {
        return jsonOut({
          ok: true,
          found: true,
          student: {
            id: String(sRows[i][cId] || ('std_gs_' + rowNo)),
            noPeserta: String(sRows[i][cNo] || '').trim().toUpperCase(),
            nama: String(sRows[i][cNama] || '').trim(),
            sekolah: String(sRows[i][cSekolah] || 'SMP Negeri 26 Sijunjung').trim(),
            kelas: String(sRows[i][cKelas] || 'VIII').trim(),
            pin: String(sRows[i][cPin] || '1234').trim() || '1234',
            qualifiedStage: String(sRows[i][cStage] || 'penyisihan').trim().toLowerCase(),
            status: String(sRows[i][cStatus] || 'aktif').trim().toLowerCase()
          }
        });
      }
    }
    return jsonOut({ ok: true, found: false });
  }

  if (action === 'state') {
    var role = params.role || 'student';
    var cache = CacheService.getScriptCache();
    if (role !== 'admin') {
      var cachedState = getChunkedCache(cache, 'gelora_state_student_v3');
      if (cachedState) return textJsonOut(cachedState);
    }

    var stateObj = {
      ok: true,
      spreadsheetId: ss.getId(),
      title: ss.getName(),
      url: ss.getUrl(),
      tabs: {
        Babak: readTabValues(ss, TABS.STAGES),
        Siswa: readTabValues(ss, TABS.STUDENTS),
        Soal: readTabValues(ss, TABS.QUESTIONS),
        Peringkat_Live: readTabValues(ss, TABS.LEADERBOARD),
        Pengaturan: readTabValues(ss, TABS.SETTINGS)
      }
    };
    if (role === 'admin') {
      stateObj.tabs.Progres_Siswa = readTabValues(ss, TABS.PROGRESS);
    }

    var stateJson = JSON.stringify(stateObj);
    if (role !== 'admin') {
      putChunkedCache(cache, 'gelora_state_student_v3', stateJson, CACHE_TTL_SEC);
    }
    return textJsonOut(stateJson);
  }

  if (action === 'read') {
    return jsonOut({
      ok: true,
      spreadsheetId: ss.getId(),
      title: ss.getName(),
      url: ss.getUrl(),
      tabs: {
        Babak: readTabValues(ss, TABS.STAGES),
        Siswa: readTabValues(ss, TABS.STUDENTS),
        Soal: readTabValues(ss, TABS.QUESTIONS),
        Pengaturan: readTabValues(ss, TABS.SETTINGS)
      }
    });
  }

  if (action === 'studentProgress') {
    var studentId = String(params.studentId || '').trim();
    var stageId = String(params.stageId || 'penyisihan').trim();
    var targetId = studentId + '_' + stageId;
    var progSh = ss.getSheetByName(TABS.PROGRESS);
    if (!progSh || progSh.getLastRow() <= 1) {
      return jsonOut({ ok: true, found: false });
    }
    var vals = progSh.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0]) === targetId) {
        return jsonOut({
          ok: true,
          found: true,
          row: vals[i]
        });
      }
    }
    return jsonOut({ ok: true, found: false });
  }

  if (action === 'adminProgress') {
    return jsonOut({
      ok: true,
      rows: readTabValues(ss, TABS.PROGRESS)
    });
  }

  return jsonOut({ ok: false, error: 'Action GET tidak dikenali: ' + action });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var body = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = body.action || '';
    var now = Date.now();

    if (action === 'syncAll' && body.tabs) {
      var tabNames = ['Babak', 'Siswa', 'Soal', 'Progres_Siswa', 'Peringkat_Live', 'Pengaturan'];
      tabNames.forEach(function(name) {
        var rows = body.tabs[name];
        if (!rows || !rows.length) return;
        writeFullTab(ss, name, rows);
      });
      ensureSubmissionsHeader(ss);
      invalidateCaches();
      return jsonOut({
        ok: true,
        spreadsheetId: ss.getId(),
        title: ss.getName(),
        url: ss.getUrl()
      });
    }

    if (action === 'recordLogin') {
      var lStudentId = String(body.studentId || '').trim();
      var lStageId = String(body.stageId || 'penyisihan').trim();
      var lStudent = body.student || {};
      if (!lStudentId) {
        return jsonOut({ ok: false, error: 'studentId wajib diisi.' });
      }
      var lProgId = lStudentId + '_' + lStageId;
      var lProgSh = ensureProgressHeader(ss);
      var lVals = lProgSh.getDataRange().getValues();
      var lFoundRow = -1;
      for (var li = 1; li < lVals.length; li++) {
        if (String(lVals[li][0]) === lProgId) {
          lFoundRow = li + 1;
          break;
        }
      }
      if (lFoundRow > 0) {
        lProgSh.getRange(lFoundRow, 11).setValue(now);
      } else {
        lProgSh.appendRow([
          lProgId,
          lStudentId,
          lStudent.noPeserta || '',
          lStudent.nama || '',
          lStudent.sekolah || '',
          lStageId,
          0,
          0,
          0,
          'FALSE',
          now,
          '[]',
          '[]',
          '{}',
          '{}'
        ]);
      }
      setSettingValue(ss, 'lastSubmissionAt', String(now), now);
      invalidateCaches();
      return jsonOut({ ok: true, recordedAt: now });
    }

    if (action === 'submitAnswer') {
      var sub = body.submission || {};
      var prog = body.progress || {};
      var studentInfo = body.student || {};
      var stageId = String(prog.stageId || sub.stageId || 'penyisihan');

      // 1. Log/Upsert in Jawaban_Detail
      var subSh = ensureSubmissionsHeader(ss);
      upsertRowByKey(subSh, 0, String(sub.id), [
        sub.id,
        sub.studentId,
        studentInfo.noPeserta || '',
        studentInfo.nama || '',
        stageId,
        sub.questionId,
        sub.type || 'pg_single',
        JSON.stringify(sub.answer !== undefined ? sub.answer : ''),
        sub.isCorrect ? 'TRUE' : 'FALSE',
        Number(sub.scoreEarned || 0),
        Number(sub.submittedAt || now)
      ]);

      // 2. Upsert in Progres_Siswa
      var progSh = ensureProgressHeader(ss);
      var progressId = String(prog.studentId) + '_' + stageId;
      upsertRowByKey(progSh, 0, progressId, [
        progressId,
        prog.studentId,
        studentInfo.noPeserta || '',
        studentInfo.nama || '',
        studentInfo.sekolah || '',
        stageId,
        Number(prog.totalScore || 0),
        Number(prog.totalAnswered || 0),
        Number(prog.correctCount || 0),
        prog.isFinished ? 'TRUE' : 'FALSE',
        Number(prog.lastUpdatedAt || now),
        JSON.stringify(prog.completedQuestionIds || []),
        JSON.stringify(prog.correctQuestionIds || []),
        JSON.stringify(prog.answers || {}),
        JSON.stringify(prog.questionScores || {})
      ]);

      // 3. Recompute stage rankings from Progres_Siswa & Siswa
      var ranked = recomputeStageLeaderboard(ss, stageId);
      setSettingValue(ss, 'lastSubmissionAt', String(now), now);
      invalidateCaches();

      var myEntry = null;
      for (var r = 0; r < ranked.length; r++) {
        if (ranked[r].studentId === String(prog.studentId)) {
          myEntry = ranked[r];
          break;
        }
      }

      return jsonOut({
        ok: true,
        currentRank: myEntry ? myEntry.rank : 1,
        totalParticipants: ranked.length,
        topLeaderboard: ranked.slice(0, 5),
        totalScore: Number(prog.totalScore || 0)
      });
    }

    if (action === 'finishStage') {
      var fStudentId = String(body.studentId || '');
      var fStageId = String(body.stageId || 'penyisihan');
      var fStudent = body.student || {};
      var progId = fStudentId + '_' + fStageId;
      var pSh = ensureProgressHeader(ss);
      var pVals = pSh.getDataRange().getValues();
      var foundRow = -1;
      for (var i = 1; i < pVals.length; i++) {
        if (String(pVals[i][0]) === progId) {
          foundRow = i + 1;
          break;
        }
      }
      if (foundRow > 0) {
        pSh.getRange(foundRow, 10).setValue('TRUE');
        pSh.getRange(foundRow, 11).setValue(now);
      } else {
        pSh.appendRow([
          progId,
          fStudentId,
          fStudent.noPeserta || '',
          fStudent.nama || '',
          fStudent.sekolah || '',
          fStageId,
          Number(body.totalScore || 0),
          0,
          0,
          'TRUE',
          now,
          '[]',
          '[]',
          '{}',
          '{}'
        ]);
      }

      var lb = recomputeStageLeaderboard(ss, fStageId);
      setSettingValue(ss, 'lastSubmissionAt', String(now), now);
      invalidateCaches();

      var myRankObj = null;
      for (var j = 0; j < lb.length; j++) {
        if (lb[j].studentId === fStudentId) {
          myRankObj = lb[j];
          break;
        }
      }
      return jsonOut({ ok: true, leaderboard: lb, myRank: myRankObj });
    }

    if (action === 'activateStage') {
      var newStageId = String(body.stageId || 'penyisihan');
      if (body.stageRows) writeFullTab(ss, TABS.STAGES, body.stageRows);
      setSettingValue(ss, 'activeStageId', newStageId, now);
      setSettingValue(ss, 'updatedAt', String(now), now);
      recomputeStageLeaderboard(ss, newStageId);
      invalidateCaches();
      return jsonOut({ ok: true, activeStageId: newStageId });
    }

    if (action === 'saveStudents' && body.studentRows) {
      writeFullTab(ss, TABS.STUDENTS, body.studentRows);
      setSettingValue(ss, 'totalStudents', String(Math.max(0, body.studentRows.length - 1)), now);
      setSettingValue(ss, 'studentsVersion', String(now), now);
      setSettingValue(ss, 'updatedAt', String(now), now);
      invalidateCaches();
      return jsonOut({ ok: true, studentsVersion: now });
    }

    if (action === 'saveQuestions' && body.questionRows) {
      writeFullTab(ss, TABS.QUESTIONS, body.questionRows);
      setSettingValue(ss, 'totalQuestions', String(Math.max(0, body.questionRows.length - 1)), now);
      setSettingValue(ss, 'questionsVersion', String(now), now);
      setSettingValue(ss, 'updatedAt', String(now), now);
      invalidateCaches();
      return jsonOut({ ok: true, questionsVersion: now });
    }

    if (action === 'resetStudentScore') {
      var rStudentId = String(body.studentId || '').trim();
      var rStageId = String(body.stageId || 'all').trim();
      if (!rStudentId) {
        return jsonOut({ ok: false, error: 'studentId wajib diisi.' });
      }
      var pSheet = ensureProgressHeader(ss);
      var sSheet = ensureSubmissionsHeader(ss);
      var deletedProgress = deleteRowsWhere(pSheet, function(row) {
        var matchStudent = String(row[1]) === rStudentId;
        var matchStage = rStageId === 'all' || String(row[5]) === rStageId;
        return matchStudent && matchStage;
      });
      var deletedSubmissions = deleteRowsWhere(sSheet, function(row) {
        var matchStudent = String(row[1]) === rStudentId;
        var matchStage = rStageId === 'all' || String(row[4]) === rStageId;
        return matchStudent && matchStage;
      });
      var curActive = readSettingsMap(ss).activeStageId || 'penyisihan';
      var lbAfterStudentReset = recomputeStageLeaderboard(ss, curActive);
      setSettingValue(ss, 'lastSubmissionAt', String(now), now);
      setSettingValue(ss, 'updatedAt', String(now), now);
      invalidateCaches();
      return jsonOut({
        ok: true,
        deletedProgress: deletedProgress,
        deletedSubmissions: deletedSubmissions,
        leaderboard: lbAfterStudentReset
      });
    }

    if (action === 'resetProgress') {
      var targetStage = String(body.stageId || 'all');
      if (targetStage === 'all') {
        ensureProgressHeader(ss).clearContents();
        ensureProgressHeader(ss);
        ensureSubmissionsHeader(ss).clearContents();
        ensureSubmissionsHeader(ss);
        if (body.studentRows) writeFullTab(ss, TABS.STUDENTS, body.studentRows);
      } else {
        deleteRowsMatching(ensureProgressHeader(ss), 5, targetStage);
        deleteRowsMatching(ensureSubmissionsHeader(ss), 4, targetStage);
      }
      var curStage = readSettingsMap(ss).activeStageId || 'penyisihan';
      var lbAfterReset = recomputeStageLeaderboard(ss, curStage);
      setSettingValue(ss, 'lastSubmissionAt', String(now), now);
      setSettingValue(ss, 'updatedAt', String(now), now);
      invalidateCaches();
      return jsonOut({ ok: true, leaderboard: lbAfterReset });
    }

    if (action === 'ping') {
      setSettingValue(ss, 'updatedAt', String(now), now);
      invalidateCaches();
      return jsonOut({ ok: true, timestamp: now });
    }

    return jsonOut({ ok: false, error: 'Aksi POST tidak dikenali: ' + action });
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function putChunkedCache(cache, baseKey, str, ttl) {
  try {
    var chunkSize = 80000;
    var count = Math.ceil(str.length / chunkSize);
    if (count > 10) return;
    var map = {};
    map[baseKey + '_n'] = String(count);
    for (var i = 0; i < count; i++) {
      map[baseKey + '_' + i] = str.slice(i * chunkSize, (i + 1) * chunkSize);
    }
    cache.putAll(map, ttl);
  } catch (err) {}
}

function getChunkedCache(cache, baseKey) {
  try {
    var nRaw = cache.get(baseKey + '_n');
    if (!nRaw) return null;
    var count = Number(nRaw);
    if (!count || count < 1 || count > 10) return null;
    var keys = [];
    for (var i = 0; i < count; i++) keys.push(baseKey + '_' + i);
    var map = cache.getAll(keys);
    var out = '';
    for (var j = 0; j < count; j++) {
      if (!map[keys[j]]) return null;
      out += map[keys[j]];
    }
    return out;
  } catch (err) {
    return null;
  }
}

function invalidateCaches() {
  try {
    var keys = ['gelora_poll_v2', 'gelora_state_student_v2', 'gelora_state_student_v3_n'];
    for (var i = 0; i < 10; i++) keys.push('gelora_state_student_v3_' + i);
    CacheService.getScriptCache().removeAll(keys);
  } catch (err) {}
}

function readTabValues(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() === 0) return [];
  return sh.getDataRange().getValues();
}

function writeFullTab(ss, name, rows) {
  if (!rows || !rows.length) return;
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, rows[0].length)
    .setBackground('#1e3a8a')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
}

function ensureProgressHeader(ss) {
  var sh = ss.getSheetByName(TABS.PROGRESS) || ss.insertSheet(TABS.PROGRESS);
  if (sh.getLastRow() === 0) {
    writeFullTab(ss, TABS.PROGRESS, [[
      'progressId', 'studentId', 'noPeserta', 'nama', 'sekolah', 'stageId',
      'totalScore', 'totalAnswered', 'correctCount', 'isFinished', 'lastUpdatedAt',
      'completedQuestionIdsJson', 'correctQuestionIdsJson', 'answersJson', 'questionScoresJson'
    ]]);
  }
  return sh;
}

function ensureSubmissionsHeader(ss) {
  var sh = ss.getSheetByName(TABS.SUBMISSIONS) || ss.insertSheet(TABS.SUBMISSIONS);
  if (sh.getLastRow() === 0) {
    writeFullTab(ss, TABS.SUBMISSIONS, [[
      'submissionId', 'studentId', 'noPeserta', 'nama', 'stageId', 'questionId',
      'type', 'answerJson', 'isCorrect', 'scoreEarned', 'submittedAt'
    ]]);
  }
  return sh;
}

function upsertRowByKey(sh, keyColIndex, keyValue, rowValues) {
  var lastRow = sh.getLastRow();
  if (lastRow > 1) {
    var keys = sh.getRange(2, keyColIndex + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === keyValue) {
        sh.getRange(i + 2, 1, 1, rowValues.length).setValues([rowValues]);
        return;
      }
    }
  }
  sh.appendRow(rowValues);
}

function deleteRowsWhere(sh, shouldDeleteFn) {
  var vals = sh.getDataRange().getValues();
  if (vals.length <= 1) return 0;
  var kept = [vals[0]];
  var removedCount = 0;
  for (var i = 1; i < vals.length; i++) {
    if (shouldDeleteFn(vals[i])) {
      removedCount++;
    } else {
      kept.push(vals[i]);
    }
  }
  if (removedCount > 0) {
    sh.clearContents();
    sh.getRange(1, 1, kept.length, kept[0].length).setValues(kept);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, kept[0].length)
      .setBackground('#1e3a8a')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
  }
  return removedCount;
}

function deleteRowsMatching(sh, colIndex, matchValue) {
  return deleteRowsWhere(sh, function(row) {
    return String(row[colIndex]) === matchValue;
  });
}

function readSettingsMap(ss) {
  var map = {};
  var rows = readTabValues(ss, TABS.SETTINGS);
  for (var i = 1; i < rows.length; i++) {
    var k = String(rows[i][0] || '').trim();
    if (k) map[k] = String(rows[i][1] || '').trim();
  }
  return map;
}

function setSettingValue(ss, key, val, nowMs) {
  var sh = ss.getSheetByName(TABS.SETTINGS) || ss.insertSheet(TABS.SETTINGS);
  if (sh.getLastRow() === 0) {
    writeFullTab(ss, TABS.SETTINGS, [['key', 'value', 'updatedAt']]);
  }
  upsertRowByKey(sh, 0, key, [key, val, String(nowMs || Date.now())]);
}

function recomputeStageLeaderboard(ss, stageId) {
  var hierarchy = ['penyisihan', 'top30', 'semifinal', 'final'];
  var targetIdx = hierarchy.indexOf(stageId);
  var sRows = readTabValues(ss, TABS.STUDENTS);
  var pRows = readTabValues(ss, TABS.PROGRESS);

  var progMap = {};
  for (var p = 1; p < pRows.length; p++) {
    if (String(pRows[p][5]) === stageId) {
      progMap[String(pRows[p][1])] = {
        totalScore: Number(pRows[p][6]) || 0,
        totalAnswered: Number(pRows[p][7]) || 0,
        correctCount: Number(pRows[p][8]) || 0,
        lastSubmitTime: Number(pRows[p][10]) || 0
      };
    }
  }

  var ranked = [];
  for (var s = 1; s < sRows.length; s++) {
    var stStage = String(sRows[s][6] || 'penyisihan').toLowerCase();
    if (hierarchy.indexOf(stStage) < targetIdx) continue;
    var stId = String(sRows[s][0]);
    var stats = progMap[stId] || { totalScore: 0, totalAnswered: 0, correctCount: 0, lastSubmitTime: 0 };
    ranked.push({
      rank: 1,
      studentId: stId,
      noPeserta: String(sRows[s][1] || ''),
      nama: String(sRows[s][2] || ''),
      sekolah: String(sRows[s][3] || ''),
      totalScore: Math.round(stats.totalScore * 10) / 10,
      totalAnswered: stats.totalAnswered,
      correctCount: stats.correctCount,
      lastSubmitTime: stats.lastSubmitTime
    });
  }

  ranked.sort(function(a, b) {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    if (a.lastSubmitTime && b.lastSubmitTime) return a.lastSubmitTime - b.lastSubmitTime;
    return a.noPeserta.localeCompare(b.noPeserta);
  });

  var lbRows = [['rank', 'stageId', 'studentId', 'noPeserta', 'nama', 'sekolah', 'totalScore', 'totalAnswered', 'correctCount', 'lastSubmitTime']];
  for (var k = 0; k < ranked.length; k++) {
    ranked[k].rank = k + 1;
    lbRows.push([
      ranked[k].rank,
      stageId,
      ranked[k].studentId,
      ranked[k].noPeserta,
      ranked[k].nama,
      ranked[k].sekolah,
      ranked[k].totalScore,
      ranked[k].totalAnswered,
      ranked[k].correctCount,
      ranked[k].lastSubmitTime
    ]);
  }
  writeFullTab(ss, TABS.LEADERBOARD, lbRows);
  return ranked;
}

function jsonOut(obj) {
  return textJsonOut(JSON.stringify(obj));
}

function textJsonOut(str) {
  return ContentService
    .createTextOutput(str)
    .setMimeType(ContentService.MimeType.JSON);
}`;

export function validateAppsScriptUrl(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed.startsWith('https://script.google.com/')) {
    throw new Error('URL harus diawali https://script.google.com/macros/s/.../exec');
  }
  return trimmed;
}

export async function sheetsBridgeGet(
  webAppUrl: string,
  params: Record<string, string>,
  maxRetries = 1
): Promise<any> {
  const cleanUrl = validateAppsScriptUrl(webAppUrl);
  const qs = new URLSearchParams({ ...params, _ts: String(Date.now()) }).toString();
  let lastErr: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${cleanUrl}?${qs}`, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store'
      });
      if (!res.ok) {
        throw new Error(`Google Apps Script merespons HTTP ${res.status}.`);
      }
      const data = await res.json();
      if (!data?.ok) {
        throw new Error(data?.error || 'Google Apps Script mengembalikan error.');
      }
      return data;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function sheetsBridgePost(
  webAppUrl: string,
  body: Record<string, any>,
  maxRetries = 3
): Promise<any> {
  const cleanUrl = validateAppsScriptUrl(webAppUrl);
  let lastErr: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(cleanUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data?.ok) {
        throw new Error(data?.error || 'Apps Script gagal memproses permintaan.');
      }
      return data;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const waitMs = 350 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function testAppsScriptBridge(webAppUrl: string): Promise<{
  spreadsheetId: string;
  title: string;
  url: string;
  version?: number;
}> {
  const data = await sheetsBridgeGet(webAppUrl, { action: 'ping' });
  return {
    spreadsheetId: data.spreadsheetId || '',
    title: data.title || 'Google Sheets GELORA 26',
    url: data.url || '',
    version: data.version || 1
  };
}

export async function syncDatabaseViaAppsScript(
  webAppUrl: string,
  payload: {
    activeStageId: StageId;
    stages: Record<StageId, StageConfig>;
    students: Student[];
    questions: Question[];
    progressList: StudentProgress[];
    leaderboard: LeaderboardRank[];
    announcement?: string;
  },
  preservePrimaryFlag?: boolean
): Promise<LinkedSpreadsheetConfig> {
  const cleanUrl = validateAppsScriptUrl(webAppUrl);
  const tabular = buildTabularSheetsPayload(payload);

  const data = await sheetsBridgePost(cleanUrl, {
    action: 'syncAll',
    tabs: {
      [SHEET_TABS.STAGES]: tabular.stageRows,
      [SHEET_TABS.STUDENTS]: tabular.studentRows,
      [SHEET_TABS.QUESTIONS]: tabular.questionRows,
      [SHEET_TABS.PROGRESS]: tabular.progressRows,
      [SHEET_TABS.LEADERBOARD]: tabular.leaderboardRows,
      [SHEET_TABS.SETTINGS]: tabular.settingsRows
    }
  });

  const existing = readLocalSheetsMeta();
  const saved: LinkedSpreadsheetConfig = {
    spreadsheetId: data.spreadsheetId || existing?.spreadsheetId || '',
    spreadsheetTitle: data.title || existing?.spreadsheetTitle || 'GELORA 26 - Google Sheets',
    spreadsheetUrl: data.url || existing?.spreadsheetUrl || '',
    bridgeWebAppUrl: cleanUrl,
    connectionMode: 'apps_script',
    useSheetsAsPrimaryDb:
      preservePrimaryFlag !== undefined ? preservePrimaryFlag : Boolean(existing?.useSheetsAsPrimaryDb),
    lastSyncedAt: Date.now()
  };
  await saveLinkedSpreadsheetConfig(saved);
  return saved;
}

export async function importDatabaseViaAppsScript(
  webAppUrl: string,
  existingQuestions: Question[] = [],
  existingStages?: Record<StageId, StageConfig>
): Promise<{
  spreadsheet: { spreadsheetId: string; title: string; spreadsheetUrl: string };
  students: Student[];
  questions: Question[];
  activeStageId?: StageId;
  stages?: Record<StageId, StageConfig>;
}> {
  const data = await sheetsBridgeGet(webAppUrl, { action: 'read' });
  const rowsByTab = new Map<string, any[][]>();
  Object.keys(data.tabs || {}).forEach(tabName => {
    if (Array.isArray(data.tabs[tabName])) {
      rowsByTab.set(tabName, data.tabs[tabName]);
    }
  });

  const parsed = parseRowsIntoAppData(rowsByTab, existingQuestions, existingStages);
  return {
    spreadsheet: {
      spreadsheetId: data.spreadsheetId || '',
      title: data.title || 'GELORA 26 - Google Sheets',
      spreadsheetUrl: data.url || ''
    },
    ...parsed
  };
}
