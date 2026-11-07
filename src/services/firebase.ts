import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { initialQuestions, initialStages, initialStudents } from '../seedData';
import { AnswerSubmission, AppDatabaseState, Question, StageId, Student } from '../types';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// CRITICAL: Connect to specified firestoreDatabaseId
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Test connection
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'app_state', 'main'));
    return true;
  } catch (err) {
    console.warn('Firestore connection check:', err);
    return false;
  }
}

// Initial bootstrap/seed: Populates Firestore with seed data on first run
let isBootstrapping = false;
export async function bootstrapFirestoreIfEmpty(): Promise<void> {
  if (isBootstrapping) return;
  isBootstrapping = true;

  try {
    const mainDocRef = doc(db, 'app_state', 'main');
    const mainSnap = await getDoc(mainDocRef);

    if (!mainSnap.exists()) {
      // 1. Initialize app_state/main
      await setDoc(mainDocRef, {
        activeStageId: 'penyisihan',
        stages: initialStages,
        announcement: 'Selamat datang di Lomba Literasi dan Numerasi GELORA 26 SMPN 26 Sijunjung! Junjung tinggi kejujuran dan sportivitas.',
        updatedAt: Date.now()
      });

      // 2. Initialize students
      for (const st of initialStudents) {
        await setDoc(doc(db, 'students', st.id), st);
      }

      // 3. Initialize questions
      for (const q of initialQuestions) {
        await setDoc(doc(db, 'questions', q.id), q);
      }
      console.log('Firebase Firestore initialized with GELORA 26 seed data.');
    }
  } catch (err) {
    console.warn('Bootstrap check encountered error (may already be seeded):', err);
  } finally {
    isBootstrapping = false;
  }
}
