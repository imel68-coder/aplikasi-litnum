import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LoginPage } from './components/LoginPage';
import { PanitiaDashboard } from './components/panitia/PanitiaDashboard';
import { SiswaExamView } from './components/siswa/SiswaExamView';
import { fetchAppState, subscribeToRealtimeUpdates, getFirestoreUpgradeUrl } from './services/api';
import { CloudErrorKind } from './services/firebase';
import { LeaderboardRank, Question, StageId, Student, UserRole } from './types';
import { initialStages, initialStudents, initialQuestions } from './seedData';
import { AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';
import geloraBannerImg from './assets/banner';

function readStoredUser(): any {
  try {
    const saved = localStorage.getItem('gelora26_user') || sessionStorage.getItem('gelora26_user');
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function readStoredRole(): UserRole | null {
  try {
    return (
      (localStorage.getItem('gelora26_role') as UserRole) ||
      (sessionStorage.getItem('gelora26_role') as UserRole) ||
      null
    );
  } catch {
    return null;
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(() => readStoredUser());
  const [userRole, setUserRole] = useState<UserRole | null>(() => readStoredRole());

  const [activeStageId, setActiveStageId] = useState<StageId>('penyisihan');
  const [stages, setStages] = useState<Record<StageId, any>>(initialStages);
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRank[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cloudError, setCloudError] = useState<CloudErrorKind>(null);
  const [cloudErrorMessage, setCloudErrorMessage] = useState<string>('');
  const initialLoadedRef = useRef(false);
  const prevRoleRef = useRef<UserRole | null>(userRole);

  // Load state from cloud server (optimized by role)
  const loadState = useCallback(async (roleOverride?: UserRole | null) => {
    const effectiveRole = roleOverride !== undefined ? roleOverride : userRole;
    try {
      const data = await fetchAppState(effectiveRole);
      setActiveStageId(data.activeStageId);
      setStages(data.stages);
      if (data.students && data.students.length > 0) {
        setStudents(data.students);
      }
      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
      }
      setLeaderboard(data.leaderboard);
      setCloudError(data.cloudError);
      setCloudErrorMessage(data.cloudErrorMessage);
    } catch (err) {
      console.warn('Could not fetch state from server:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userRole]);

  // Initial load on mount + reload only if transitioning into 'admin' role
  useEffect(() => {
    if (!initialLoadedRef.current) {
      initialLoadedRef.current = true;
      loadState(userRole);
    } else if (userRole === 'admin' && prevRoleRef.current !== 'admin') {
      loadState('admin');
    }
    prevRoleRef.current = userRole;
  }, [userRole, loadState]);

  // Real-time Firestore listener (1-doc for students/login, student_progress for admin)
  useEffect(() => {
    const unsubscribe = subscribeToRealtimeUpdates((event) => {
      if (event.type === 'CLOUD_ERROR') {
        setCloudError(event.data?.kind || 'unknown');
        setCloudErrorMessage(event.data?.message || '');
        return;
      }

      setCloudError(null);
      setCloudErrorMessage('');

      if (event.type === 'STAGE_ACTIVATED') {
        if (event.data?.activeStageId) {
          setActiveStageId(event.data.activeStageId);
        }
        if (event.data?.stages) {
          setStages(event.data.stages);
        }
        if (event.data?.leaderboard) {
          setLeaderboard(event.data.leaderboard);
        }
      } else if (event.type === 'SUBMISSION_RECEIVED') {
        if (event.data?.leaderboard) {
          setLeaderboard(event.data.leaderboard);
        }
      } else if (event.type === 'STUDENTS_UPDATED' || event.type === 'STUDENTS_PROMOTED') {
        if (event.data?.students && event.data.students.length > 0) {
          setStudents(event.data.students);
          setCurrentUser((prevUser: any) => {
            if (prevUser?.id) {
              const updatedMe = event.data.students.find((s: Student) => s.id === prevUser.id);
              if (updatedMe) {
                try {
                  const raw = JSON.stringify(updatedMe);
                  localStorage.setItem('gelora26_user', raw);
                  sessionStorage.setItem('gelora26_user', raw);
                } catch {
                  // ignore
                }
                return updatedMe;
              }
            }
            return prevUser;
          });
        }
        if (event.data?.leaderboard) {
          setLeaderboard(event.data.leaderboard);
        }
      } else if (event.type === 'STATE_UPDATED') {
        if (event.data?.questions && event.data.questions.length > 0) {
          setQuestions(event.data.questions);
        }
      } else if (event.type === 'STATE_RESET') {
        loadState(userRole);
      }
    }, userRole);

    return () => {
      unsubscribe();
    };
  }, [userRole, loadState]);

  // Login handler (persist redundantly in localStorage + sessionStorage)
  const handleLoginSuccess = (user: any, role: UserRole) => {
    setCurrentUser(user);
    setUserRole(role);
    try {
      const serialized = JSON.stringify(user);
      localStorage.setItem('gelora26_user', serialized);
      localStorage.setItem('gelora26_role', role);
      sessionStorage.setItem('gelora26_user', serialized);
      sessionStorage.setItem('gelora26_role', role);
    } catch (e) {
      console.error(e);
    }
  };

  // Explicit Logout handler
  const handleLogout = () => {
    setCurrentUser(null);
    setUserRole(null);
    try {
      localStorage.removeItem('gelora26_user');
      localStorage.removeItem('gelora26_role');
      sessionStorage.removeItem('gelora26_user');
      sessionStorage.removeItem('gelora26_role');
    } catch (e) {
      console.error(e);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 rounded-2xl overflow-hidden mb-4 shadow-xl border-2 border-amber-400 animate-pulse">
          <img
            src={geloraBannerImg}
            alt="GELORA 26"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="text-white font-bold text-lg">Memuat Aplikasi GELORA 26...</div>
        <p className="text-xs text-sky-200 mt-1">Menghubungkan ke Cloud Database SMPN 26 Sijunjung</p>
      </div>
    );
  }

  const cloudBanner = cloudError ? (
    <div className="bg-amber-50 border-b-2 border-amber-300 px-4 py-2.5 text-amber-950 text-xs flex flex-wrap items-center justify-between gap-2 z-50">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <span>
          {cloudError === 'quota_exceeded'
            ? 'Kuota harian gratis Firestore tercapai sementara — Data 100% aman di cloud & tidak terhapus. Sistem tetap berjalan dengan cache lokal.'
            : cloudErrorMessage || 'Koneksi ke Cloud Database sedang terganggu. Menggunakan cache lokal sementara.'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {cloudError === 'quota_exceeded' && userRole === 'admin' && (
          <a
            href={getFirestoreUpgradeUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold inline-flex items-center gap-1"
          >
            <span>Cek Kuota / Upgrade Firebase</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        <button
          type="button"
          onClick={() => loadState(userRole)}
          className="px-2.5 py-1 bg-white border border-amber-300 hover:bg-amber-100 rounded-lg font-bold inline-flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Coba Hubungkan Ulang</span>
        </button>
      </div>
    </div>
  ) : null;

  // Not logged in: Show Login Page
  if (!currentUser || !userRole) {
    return (
      <div className="min-h-screen flex flex-col">
        {cloudBanner}
        <div className="flex-1">
          <LoginPage
            onLoginSuccess={handleLoginSuccess}
            students={students}
            activeStageName={stages[activeStageId]?.name || 'Babak Penyisihan'}
            onRefreshStudents={() => loadState(null)}
          />
        </div>
      </div>
    );
  }

  // Panitia (Admin) view
  if (userRole === 'admin') {
    return (
      <div className="min-h-screen flex flex-col">
        {cloudBanner}
        <div className="flex-1">
          <PanitiaDashboard
            onLogout={handleLogout}
            activeStageId={activeStageId}
            stages={stages}
            students={students}
            questions={questions}
            leaderboard={leaderboard}
            onRefreshState={() => loadState('admin')}
          />
        </div>
      </div>
    );
  }

  // Siswa (Student) view
  return (
    <div className="min-h-screen flex flex-col">
      {cloudBanner}
      <div className="flex-1">
        <SiswaExamView
          student={currentUser}
          activeStageId={activeStageId}
          stages={stages}
          questions={questions}
          students={students}
          leaderboard={leaderboard}
          onLogout={handleLogout}
          onRefreshState={() => loadState('student')}
        />
      </div>
    </div>
  );
}
