import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import {
  getFirestore as getFirestoreLite,
  collection,
  doc as docLite,
  getDoc,
  getDocs,
  setDoc,
  query,
  limit,
  writeBatch
} from 'firebase/firestore/lite';
import firebaseConfig from '../../firebase-applet-config.json';
import { initialQuestions, initialStages, initialStudents } from '../seedData';

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const FIRESTORE_DATABASE_ID =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-remixgelora26lom-27d71874-5d97-4641-9dcc-154ea1707e4d';

// CRITICAL: Connect both full SDK (realtime onSnapshot) & Lite REST SDK (resilient fallback) to specified firestoreDatabaseId
export const db = getFirestore(app, FIRESTORE_DATABASE_ID);
export const dbLite = getFirestoreLite(app, FIRESTORE_DATABASE_ID);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  code?: string;
}

export type CloudErrorKind = 'quota_exceeded' | 'permission_denied' | 'offline' | 'unknown' | null;

export function classifyFirestoreError(error: unknown): CloudErrorKind {
  if (!error) return null;
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const code = (error as any)?.code ? String((error as any).code).toLowerCase() : '';

  if (code.includes('resource-exhausted') || msg.includes('quota exceeded')) {
    return 'quota_exceeded';
  }
  if (code.includes('permission-denied') || msg.includes('missing or insufficient permissions')) {
    return 'permission_denied';
  }
  if (
    code.includes('unavailable') ||
    msg.includes('client is offline') ||
    msg.includes('network') ||
    msg.includes('failed to fetch')
  ) {
    return 'offline';
  }
  return 'unknown';
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    code: (error as any)?.code || undefined,
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw error instanceof Error ? error : new Error(JSON.stringify(errInfo));
}

// Non-blocking boot connection check using getDocFromServer
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'app_state', 'main'));
    return true;
  } catch (error) {
    const kind = classifyFirestoreError(error);
    console.warn('Firestore full-SDK connection check:', kind);
    return false;
  }
}

// Safe bootstrap/seed using REST Lite SDK: ONLY populates seed data if database is genuinely empty.
// Never overwrites existing students or questions!
let isBootstrapping = false;
export async function bootstrapFirestoreIfEmpty(existingMainExists?: boolean): Promise<void> {
  if (isBootstrapping || existingMainExists) return;
  isBootstrapping = true;

  try {
    const mainDocRef = docLite(dbLite, 'app_state', 'main');
    const mainSnap = await getDoc(mainDocRef);

    if (!mainSnap.exists()) {
      const now = Date.now();
      const existingStudentsSnap = await getDocs(query(collection(dbLite, 'students'), limit(1)));
      const existingQuestionsSnap = await getDocs(query(collection(dbLite, 'questions'), limit(1)));

      await setDoc(mainDocRef, {
        activeStageId: 'penyisihan',
        stages: initialStages,
        announcement: 'Selamat datang di Lomba Literasi dan Numerasi GELORA 26 SMPN 26 Sijunjung! Junjung tinggi kejujuran dan sportivitas.',
        updatedAt: now,
        studentsVersion: now,
        questionsVersion: now
      });

      if (existingStudentsSnap.empty) {
        const batch = writeBatch(dbLite);
        for (const st of initialStudents) {
          batch.set(docLite(dbLite, 'students', st.id), st);
        }
        await batch.commit();
      }

      if (existingQuestionsSnap.empty) {
        const batch = writeBatch(dbLite);
        for (const q of initialQuestions) {
          batch.set(docLite(dbLite, 'questions', q.id), q);
        }
        await batch.commit();
      }
      console.log('Firebase Firestore initialized safely.');
    }
  } catch (err) {
    console.warn('Bootstrap check encountered error:', err);
  } finally {
    isBootstrapping = false;
  }
}

export { firebaseConfig };
