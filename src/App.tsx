import React, { useState, useEffect, useCallback } from 'react';
import { LoginPage } from './components/LoginPage';
import { PanitiaDashboard } from './components/panitia/PanitiaDashboard';
import { SiswaExamView } from './components/siswa/SiswaExamView';
import { fetchAppState, subscribeToRealtimeUpdates } from './services/api';
import { LeaderboardRank, Question, StageId, Student, UserRole } from './types';
import { initialStages, initialStudents, initialQuestions } from './seedData';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('gelora26_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [userRole, setUserRole] = useState<UserRole | null>(() => {
    try {
      return (localStorage.getItem('gelora26_role') as UserRole) || null;
    } catch {
      return null;
    }
  });

  const [activeStageId, setActiveStageId] = useState<StageId>('penyisihan');
  const [stages, setStages] = useState<Record<StageId, any>>(initialStages);
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRank[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  // Load state from cloud server
  const loadState = useCallback(async () => {
    try {
      const data = await fetchAppState();
      setActiveStageId(data.activeStageId);
      setStages(data.stages);
      setStudents(data.students);
      setQuestions(data.questions);
      setLeaderboard(data.leaderboard);
      setIsOnline(true);
    } catch (err) {
      console.warn('Could not fetch state from server, falling back to local defaults', err);
      setIsOnline(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();

    // Subscribe to realtime Firestore sync
    const unsubscribe = subscribeToRealtimeUpdates((event) => {
      setIsOnline(true);
      if (event.type === 'CONNECTED') {
        // Connected to Cloud
      } else if (event.type === 'STAGE_ACTIVATED') {
        // Realtime stage activation from Panitia laptop -> changes immediately on Student phones!
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
        // Realtime score & rank update from Student phones -> updates Panitia leaderboard immediately!
        if (event.data?.leaderboard) {
          setLeaderboard(event.data.leaderboard);
        }
      } else if (event.type === 'STUDENTS_UPDATED' || event.type === 'STUDENTS_PROMOTED') {
        if (event.data?.students) {
          setStudents(event.data.students);
          // Update current student if their profile changed
          setCurrentUser((prevUser: any) => {
            if (prevUser?.id) {
              const updatedMe = event.data.students.find((s: Student) => s.id === prevUser.id);
              if (updatedMe) {
                try {
                  localStorage.setItem('gelora26_user', JSON.stringify(updatedMe));
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
        if (event.data?.questions) {
          setQuestions(event.data.questions);
        }
      } else if (event.type === 'STATE_RESET') {
        loadState();
      } else if (event.type === 'POLL_SYNC' && event.data) {
        if (event.data.activeStageId) setActiveStageId(event.data.activeStageId);
        if (event.data.stages) setStages(event.data.stages);
        if (event.data.students) setStudents(event.data.students);
        if (event.data.questions) setQuestions(event.data.questions);
        if (event.data.leaderboard) setLeaderboard(event.data.leaderboard);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [loadState]);

  // Login handler
  const handleLoginSuccess = (user: any, role: UserRole) => {
    setCurrentUser(user);
    setUserRole(role);
    try {
      localStorage.setItem('gelora26_user', JSON.stringify(user));
      localStorage.setItem('gelora26_role', role);
    } catch (e) {
      console.error(e);
    }
  };

  // Logout handler
  const handleLogout = () => {
    setCurrentUser(null);
    setUserRole(null);
    try {
      localStorage.removeItem('gelora26_user');
      localStorage.removeItem('gelora26_role');
    } catch (e) {
      console.error(e);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 rounded-2xl overflow-hidden mb-4 shadow-xl border-2 border-amber-400 animate-pulse">
          <img 
            src="/assets/aistudio/WhatsApp_Image_2026-11-04_at_10.53.59_691c768a.jpeg" 
            alt="GELORA 26" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="text-white font-bold text-lg">Memuat Aplikasi GELORA 26...</div>
        <p className="text-xs text-sky-200 mt-1">Menghubungkan ke Cloud Database SMPN 26 Sijunjung</p>
      </div>
    );
  }

  // Not logged in: Show Login Page
  if (!currentUser || !userRole) {
    return (
      <LoginPage
        onLoginSuccess={handleLoginSuccess}
        students={students}
        activeStageName={stages[activeStageId]?.name || 'Babak Penyisihan'}
      />
    );
  }

  // Panitia (Admin) view
  if (userRole === 'admin') {
    return (
      <PanitiaDashboard
        onLogout={handleLogout}
        activeStageId={activeStageId}
        stages={stages}
        students={students}
        questions={questions}
        leaderboard={leaderboard}
        onRefreshState={loadState}
      />
    );
  }

  // Siswa (Student) view
  return (
    <SiswaExamView
      student={currentUser}
      activeStageId={activeStageId}
      stages={stages}
      questions={questions}
      students={students}
      leaderboard={leaderboard}
      onLogout={handleLogout}
      onRefreshState={loadState}
    />
  );
}
