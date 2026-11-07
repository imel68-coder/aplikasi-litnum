import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { 
  Trophy, Award, BookOpen, Calculator, CheckCircle2, AlertCircle, 
  ChevronRight, ChevronLeft, LogOut, ZoomIn, X, Send, Sparkles, 
  HelpCircle, Check, Flame, Clock, RefreshCw, Star, Wifi, Bell
} from 'lucide-react';
import { Question, StageId, Student, LeaderboardRank } from '../../types';
import { submitStudentAnswer, finishStudentStage, fetchLeaderboard, getStudentStageSubmissions } from '../../services/api';

interface SiswaExamViewProps {
  student: Student;
  activeStageId: StageId;
  stages: Record<StageId, any>;
  questions: Question[];
  students?: Student[];
  leaderboard?: LeaderboardRank[];
  onLogout: () => void;
  onRefreshState: () => void;
}

export const SiswaExamView: React.FC<SiswaExamViewProps> = ({
  student,
  activeStageId,
  stages,
  questions,
  students = [],
  leaderboard = [],
  onLogout,
  onRefreshState,
}) => {
  // Filter questions for the active stage
  const stageQuestions = questions
    .filter(q => q.stageId === activeStageId)
    .sort((a, b) => a.order - b.order);

  const [currentIndex, setCurrentIndex] = useState(0);
  const currentQuestion: Question | undefined = stageQuestions[currentIndex];

  // Local student answers map: questionId -> answer
  const [answers, setAnswers] = useState<Record<string, any>>({});
  // Submitted question IDs in this session
  const [submittedQuestionIds, setSubmittedQuestionIds] = useState<string[]>([]);
  // Current accumulated score
  const [currentScore, setCurrentScore] = useState<number>(0);
  
  // Realtime Stage Change Notification
  const [stageChangeNotification, setStageChangeNotification] = useState<string | null>(null);
  const prevStageIdRef = useRef<StageId>(activeStageId);
  const prevStudentCountRef = useRef<number>(students.length);

  // Realtime Question Result Popup Modal (Requirement 6)
  const [showQuestionResultModal, setShowQuestionResultModal] = useState(false);
  const [lastSubmissionResult, setLastSubmissionResult] = useState<{
    isCorrect: boolean;
    scoreEarned: number;
    totalScore: number;
    currentRank: number;
    totalParticipants: number;
    topLeaderboard: LeaderboardRank[];
  } | null>(null);

  // Stage Completion Screen (Requirement 6)
  const [isStageFinished, setIsStageFinished] = useState(false);
  const [stageLeaderboard, setStageLeaderboard] = useState<LeaderboardRank[]>(leaderboard);
  const [myFinalRank, setMyFinalRank] = useState<LeaderboardRank | null>(null);

  // UI helpers
  const [submitting, setSubmitting] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'xlarge'>('normal');

  // Watch for new student additions in real-time
  useEffect(() => {
    if (prevStudentCountRef.current > 0 && students.length > prevStudentCountRef.current) {
      const newestStudent = students[students.length - 1];
      if (newestStudent && newestStudent.id !== student.id) {
        setStageChangeNotification(`Peserta baru terdaftar secara realtime: ${newestStudent.nama} (${newestStudent.noPeserta}) dari ${newestStudent.sekolah}!`);
      }
    }
    prevStudentCountRef.current = students.length;
  }, [students, student.id]);

  // Load submissions and calculate existing score on initial load & stage changes
  useEffect(() => {
    setCurrentIndex(0);
    setIsStageFinished(false);

    // Detect if stage changed live by Panitia
    if (prevStageIdRef.current !== activeStageId) {
      setStageChangeNotification(`Panitia telah mengaktifkan ${stages[activeStageId]?.name || activeStageId}! Lembar soal telah diperbarui.`);
      prevStageIdRef.current = activeStageId;
    }

    // Restore any existing submissions from Firestore for this student and stage
    getStudentStageSubmissions(student.id, activeStageId)
      .then(res => {
        if (res.submittedQuestionIds.length > 0) {
          setAnswers(prev => ({ ...prev, ...res.answers }));
          setSubmittedQuestionIds(res.submittedQuestionIds);
          setCurrentScore(res.totalScore);
        }
      })
      .catch(() => {});
  }, [activeStageId, student.id, stages]);

  // Real-time synchronization when leaderboard prop updates from Firestore
  useEffect(() => {
    if (leaderboard && leaderboard.length > 0) {
      setStageLeaderboard(leaderboard);
      const myRank = leaderboard.find(r => r.studentId === student.id);
      if (myRank) {
        setCurrentScore(myRank.totalScore);
        setMyFinalRank(myRank);
      }
    }
  }, [leaderboard, student.id]);

  // Trigger celebration confetti when stage finishes
  useEffect(() => {
    if (isStageFinished) {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }, [isStageFinished]);

  // Handle Answer Selection
  const handleAnswerChange = (questionId: string, val: any) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: val
    }));
  };

  // Submit Answer for Current Question
  const handleSubmitCurrentQuestion = async () => {
    if (!currentQuestion) return;
    const currentAnswer = answers[currentQuestion.id];

    if (currentAnswer === undefined || currentAnswer === null || (Array.isArray(currentAnswer) && currentAnswer.length === 0)) {
      alert('Silakan pilih atau isi jawaban terlebih dahulu sebelum mengirim.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitStudentAnswer({
        studentId: student.id,
        stageId: activeStageId,
        questionId: currentQuestion.id,
        answer: currentAnswer
      });

      setCurrentScore(res.totalScore);
      setSubmittedQuestionIds(prev => Array.from(new Set([...prev, currentQuestion.id])));
      setLastSubmissionResult(res);
      setShowQuestionResultModal(true);

      // Trigger small reward confetti on correct answer!
      if (res.isCorrect) {
        confetti({
          particleCount: 30,
          spread: 45,
          origin: { y: 0.7 }
        });
      }

      // Check if all questions are completed
      if (submittedQuestionIds.length + 1 >= stageQuestions.length) {
        // Can optionally auto-finish or prompt
      }
    } catch (err: any) {
      alert('Gagal mengirim jawaban: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Finalize stage submission
  const handleFinishStage = async () => {
    if (!window.confirm('Apakah kamu yakin ingin menyelesaikan babak ini dan melihat peringkat akhirmu?')) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await finishStudentStage(student.id, activeStageId);
      setStageLeaderboard(res.leaderboard);
      setMyFinalRank(res.myRank || null);
      setIsStageFinished(true);
      setShowQuestionResultModal(false);
      onRefreshState();
    } catch (err: any) {
      alert('Gagal menyelesaikan babak: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // If no questions in this stage
  if (stageQuestions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-slate-200">
          <BookOpen className="w-16 h-16 text-amber-500 mx-auto mb-4 animate-bounce" />
          <h2 className="text-xl font-black text-slate-900">Menunggu Soal dari Panitia</h2>
          <p className="text-sm text-slate-600 mt-2">
            Panitia sedang menyiapkan paket soal untuk <strong>{stages[activeStageId]?.name}</strong>.
            Layar akan otomatis diperbarui begitu soal diaktifkan.
          </p>
          <button
            onClick={onRefreshState}
            className="mt-6 px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Periksa Sekarang</span>
          </button>
          <button
            onClick={onLogout}
            className="mt-3 text-xs text-slate-400 hover:text-slate-600 font-semibold"
          >
            Kembali ke Halaman Login
          </button>
        </div>
      </div>
    );
  }

  // --- STAGE FINAL LEADERBOARD SCREEN (REQUIREMENT 6) ---
  if (isStageFinished) {
    const totalPossiblePoints = stageQuestions.reduce((sum, q) => sum + (q.points || 0), 0);
    const myRankPosition = myFinalRank?.rank || 1;
    const isTopThree = myRankPosition <= 3;

    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col selection:bg-amber-400 selection:text-slate-900">
        
        {/* Banner Graphic Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-sky-900 border-b border-white/10 px-4 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="/assets/aistudio/WhatsApp_Image_2026-11-04_at_10.53.59_691c768a.jpeg" 
                alt="Gelora 26" 
                className="w-10 h-10 object-cover rounded-xl border border-white/20"
              />
              <div>
                <h1 className="font-black text-base text-white tracking-wide">
                  GELORA 26 • <span className="text-amber-400">RAPOR AKHIR BABAK</span>
                </h1>
                <p className="text-xs text-sky-200">
                  SMP Negeri 26 Sijunjung • {stages[activeStageId]?.name}
                </p>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="max-w-4xl mx-auto w-full p-4 sm:p-6 space-y-6 flex-1">
          
          {/* Achievement Summary Card */}
          <div className="bg-gradient-to-b from-blue-950 to-indigo-950 rounded-3xl p-6 sm:p-8 border border-white/20 shadow-2xl text-center relative overflow-hidden">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-amber-400 to-yellow-300 text-slate-950 flex items-center justify-center font-black text-3xl shadow-xl shadow-amber-500/20 mb-4 animate-scaleIn">
              {isTopThree ? (myRankPosition === 1 ? '🥇' : myRankPosition === 2 ? '🥈' : '🥉') : '🏆'}
            </div>

            <span className="px-3 py-1 bg-amber-400 text-slate-950 text-xs font-black rounded-full uppercase tracking-wider">
              Peringkat Resmi {stages[activeStageId]?.name}
            </span>

            <h2 className="text-2xl sm:text-3xl font-black text-white mt-2">
              Peringkat ke-{myRankPosition} dari {stageLeaderboard.length} Peserta
            </h2>
            <p className="text-sm text-sky-200 mt-1">
              Selamat untuk <strong>{student.nama}</strong> ({student.noPeserta}) dari {student.sekolah}
            </p>

            {/* Score Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-md mx-auto mt-6">
              <div className="bg-white/10 rounded-2xl p-3 border border-white/10">
                <div className="text-[11px] text-white/70">Total Skor Diperoleh</div>
                <div className="text-xl font-black text-amber-300 mt-0.5">{myFinalRank?.totalScore || currentScore} Poin</div>
              </div>

              <div className="bg-white/10 rounded-2xl p-3 border border-white/10">
                <div className="text-[11px] text-white/70">Total Soal Terjawab</div>
                <div className="text-xl font-black text-sky-300 mt-0.5">{stageQuestions.length} Soal</div>
              </div>

              <div className="bg-white/10 rounded-2xl p-3 border border-white/10 col-span-2 sm:col-span-1">
                <div className="text-[11px] text-white/70">Status Babak</div>
                <div className="text-sm font-black text-emerald-300 mt-1">SELESAI</div>
              </div>
            </div>

            <div className="mt-5 p-3.5 bg-emerald-500/20 border border-emerald-400/30 rounded-2xl text-xs sm:text-sm text-emerald-200 max-w-lg mx-auto">
              🎉 Nilai dan peringkatmu telah tersimpan aman di Cloud Database GELORA 26! Mohon nantikan pengumuman kelolosan dari panitia lomba untuk babak berikutnya.
            </div>
          </div>

          {/* Full Stage Leaderboard Table */}
          <div className="bg-slate-800/90 rounded-3xl p-5 border border-slate-700 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div>
                <h3 className="font-bold text-base text-white">Daftar Peringkat Seluruh Peserta</h3>
                <p className="text-xs text-slate-400">Pembaruan skor otomatis secara realtime</p>
              </div>
              <button
                type="button"
                onClick={onRefreshState}
                className="p-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs text-white"
                title="Refresh peringkat"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-900/50 text-slate-400 uppercase font-bold text-[11px]">
                  <tr>
                    <th className="px-4 py-2.5">Peringkat</th>
                    <th className="px-4 py-2.5">No Peserta</th>
                    <th className="px-4 py-2.5">Nama Siswa</th>
                    <th className="px-4 py-2.5">Sekolah</th>
                    <th className="px-4 py-2.5 text-right">Skor Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {stageLeaderboard.map((r) => {
                    const isMe = r.studentId === student.id;
                    return (
                      <tr 
                        key={r.studentId}
                        className={`transition ${isMe ? 'bg-amber-500/20 font-bold border-l-4 border-amber-400' : 'hover:bg-slate-700/50'}`}
                      >
                        <td className="px-4 py-3">
                          <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-black ${
                            r.rank === 1 ? 'bg-amber-400 text-slate-950' :
                            r.rank === 2 ? 'bg-slate-300 text-slate-900' :
                            r.rank === 3 ? 'bg-amber-700 text-white' :
                            'bg-slate-700 text-slate-300'
                          }`}>
                            {r.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sky-300">
                          {r.noPeserta}
                        </td>
                        <td className="px-4 py-3 text-white">
                          {r.nama} {isMe && <span className="ml-1 text-[10px] bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded font-bold">KAMU</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-300 truncate max-w-[150px]">
                          {r.sekolah}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-amber-400">
                          {r.totalScore} Poin
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>

          <div className="text-center pt-2">
            <button
              onClick={() => setIsStageFinished(false)}
              className="text-xs text-sky-400 hover:underline"
            >
              Lihat Kembali Lembar Soal Babak Ini
            </button>
          </div>

        </div>

      </div>
    );
  }

  // --- EXAM SCREEN ---
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const isCurrentSubmitted = currentQuestion ? submittedQuestionIds.includes(currentQuestion.id) : false;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col selection:bg-amber-400 selection:text-slate-900">
      
      {/* TOP HEADER */}
      <header className="bg-gradient-to-r from-blue-900 via-indigo-900 to-sky-900 text-white shadow-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          
          {/* Logo & Student Info */}
          <div className="flex items-center gap-3">
            <img 
              src="/assets/aistudio/WhatsApp_Image_2026-11-04_at_10.53.59_691c768a.jpeg" 
              alt="Gelora 26" 
              className="w-10 h-10 object-cover rounded-xl border border-white/20 shrink-0"
            />
            <div className="min-w-0">
              <div className="font-extrabold text-sm text-white truncate flex items-center gap-1.5">
                <span>{student.nama}</span>
                <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded font-mono font-normal">
                  {student.noPeserta}
                </span>
              </div>
              <p className="text-xs text-sky-200 truncate">
                {student.sekolah} • {stages[activeStageId]?.name}
              </p>
            </div>
          </div>

          {/* Right: Live Score Badge & Actions */}
          <div className="flex items-center gap-2">
            <div className="bg-amber-400/90 text-slate-950 px-3 py-1.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-md">
              <Trophy className="w-4 h-4 text-slate-950" />
              <span>{currentScore} Poin</span>
            </div>

            <button
              onClick={onLogout}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition"
              title="Keluar"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* QUESTION NUMBER NAVIGATION BAR */}
        <div className="max-w-5xl mx-auto px-4 py-2 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <span className="text-[11px] text-sky-200 font-semibold mr-1 shrink-0">Soal:</span>
          {stageQuestions.map((q, idx) => {
            const isAnswered = submittedQuestionIds.includes(q.id);
            const isCurrent = idx === currentIndex;
            return (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(idx)}
                className={`w-8 h-8 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 transition-all ${
                  isCurrent
                    ? 'bg-amber-400 text-slate-950 ring-2 ring-white shadow-md'
                    : isAnswered
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-white/15 text-white hover:bg-white/30'
                }`}
              >
                {idx + 1}
              </button>
            );
          })}

          <button
            onClick={handleFinishStage}
            className="ml-auto px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg shrink-0 flex items-center gap-1 shadow"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Selesai Babak</span>
          </button>
        </div>
      </header>

      {/* QUESTION WORKSPACE */}
      <main className="max-w-4xl mx-auto w-full p-3 sm:p-6 flex-1 space-y-4">
        
        {/* Realtime Stage Change Notification from Panitia */}
        {stageChangeNotification && (
          <div className="bg-amber-400 text-slate-950 p-3.5 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-between gap-2 shadow-lg animate-fadeIn border-2 border-amber-300">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-slate-950 shrink-0 animate-bounce" />
              <span>{stageChangeNotification}</span>
            </div>
            <button
              onClick={() => setStageChangeNotification(null)}
              className="text-xs bg-black/10 hover:bg-black/20 px-2.5 py-1 rounded-lg shrink-0 font-extrabold"
            >
              OK, Mengerti
            </button>
          </div>
        )}

        {currentQuestion && (
          <div className="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden">
            
            {/* Question Card Header */}
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-blue-600 text-white font-black text-xs rounded-full">
                  SOAL NO. {currentIndex + 1} DARI {stageQuestions.length}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                  currentQuestion.category === 'literasi' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'
                }`}>
                  {currentQuestion.category}
                </span>
                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  +{currentQuestion.points} POIN
                </span>
              </div>

              {/* Text Size Controls for Reading Comfort */}
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <span>Ukuran Teks:</span>
                <button
                  type="button"
                  onClick={() => setFontSize('normal')}
                  className={`px-2 py-0.5 rounded font-bold ${fontSize === 'normal' ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}
                >
                  A
                </button>
                <button
                  type="button"
                  onClick={() => setFontSize('large')}
                  className={`px-2 py-0.5 rounded font-bold ${fontSize === 'large' ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}
                >
                  A+
                </button>
              </div>
            </div>

            {/* Stimulus Reading Panel (Requirement 5) */}
            <div className="p-5 sm:p-7 space-y-5">
              
              {currentQuestion.stimulusText && (
                <div className="p-4 sm:p-5 bg-sky-50/70 border border-sky-100 rounded-2xl">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-blue-800 mb-2">
                    <BookOpen className="w-4 h-4 text-blue-600" />
                    <span>Wacana / Stimulus Bacaan:</span>
                  </div>
                  <p className={`text-slate-800 whitespace-pre-line leading-relaxed font-sans ${
                    fontSize === 'large' ? 'text-base sm:text-lg leading-loose' : 'text-sm sm:text-base'
                  }`}>
                    {currentQuestion.stimulusText}
                  </p>
                </div>
              )}

              {/* Stimulus Image (Requirement 5) */}
              {currentQuestion.imageUrl && (
                <div className="relative group rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 max-h-80 flex items-center justify-center">
                  <img
                    src={currentQuestion.imageUrl}
                    alt="Stimulus Soal"
                    className="max-h-80 w-auto object-contain cursor-pointer hover:scale-102 transition duration-300"
                    onClick={() => setZoomedImage(currentQuestion.imageUrl || null)}
                  />
                  <button
                    type="button"
                    onClick={() => setZoomedImage(currentQuestion.imageUrl || null)}
                    className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white p-2 rounded-xl text-xs flex items-center gap-1 backdrop-blur"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>Perbesar Gambar</span>
                  </button>
                </div>
              )}

              {/* Main Question Statement (Pernyataan Soal - Requirement 5) */}
              <div className="pt-2">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Pertanyaan:
                </div>
                <h3 className={`font-black text-slate-900 ${
                  fontSize === 'large' ? 'text-lg sm:text-xl' : 'text-base sm:text-lg'
                }`}>
                  {currentQuestion.questionPrompt}
                </h3>
              </div>

              {/* ============================================================== */}
              {/* ANSWER SECTIONS ACCORDING TO 4 TYPES (REQUIREMENT 3) */}
              {/* ============================================================== */}

              {/* 1. PILIHAN GANDA TUNGGAL (1 Jawaban Benar) */}
              {currentQuestion.type === 'pg_single' && (
                <div className="space-y-2.5 pt-2">
                  <p className="text-xs text-slate-500 font-medium">
                    Pilih salah satu jawaban yang paling tepat:
                  </p>
                  {currentQuestion.options?.map((opt, i) => {
                    const isSelected = currentAnswer === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleAnswerChange(currentQuestion.id, opt.id)}
                        className={`w-full p-4 rounded-2xl border text-left flex items-start gap-3.5 transition-all ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-600 text-blue-950 shadow-md ring-2 ring-blue-500/20'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800 hover:bg-slate-50/60'
                        }`}
                      >
                        <span className={`w-8 h-8 rounded-xl font-black text-sm flex items-center justify-center shrink-0 transition ${
                          isSelected ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span className="text-sm sm:text-base pt-0.5 leading-snug">
                          {opt.text}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 2. PILIHAN GANDA KOMPLEKS (2 atau 3 Jawaban Benar) */}
              {currentQuestion.type === 'pg_complex' && (
                <div className="space-y-2.5 pt-2">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-semibold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Pilihan Ganda Kompleks: Centang 2 atau 3 jawaban yang menurutmu benar!</span>
                  </div>

                  {currentQuestion.options?.map((opt, i) => {
                    const selectedArray: string[] = Array.isArray(currentAnswer) ? currentAnswer : [];
                    const isChecked = selectedArray.includes(opt.id);

                    const toggleCheck = () => {
                      if (isChecked) {
                        handleAnswerChange(currentQuestion.id, selectedArray.filter(id => id !== opt.id));
                      } else {
                        handleAnswerChange(currentQuestion.id, [...selectedArray, opt.id]);
                      }
                    };

                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={toggleCheck}
                        className={`w-full p-4 rounded-2xl border text-left flex items-start gap-3.5 transition-all ${
                          isChecked
                            ? 'bg-indigo-50/80 border-indigo-600 text-indigo-950 shadow-md ring-2 ring-indigo-500/20'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800 hover:bg-slate-50/60'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition ${
                          isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                        }`}>
                          {isChecked && <Check className="w-4 h-4 stroke-[3]" />}
                        </div>
                        <span className="text-sm sm:text-base leading-snug">
                          {opt.text}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 3. BENAR ATAU SALAH */}
              {currentQuestion.type === 'true_false' && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-slate-500 font-medium">
                    Tentukan kebenaran dari masing-masing pernyataan berikut:
                  </p>
                  
                  <div className="space-y-2.5">
                    {currentQuestion.trueFalseStatements?.map((st, idx) => {
                      const curAnswers = currentAnswer || {};
                      const value = curAnswers[st.id];

                      const setVal = (boolVal: boolean) => {
                        handleAnswerChange(currentQuestion.id, {
                          ...curAnswers,
                          [st.id]: boolVal
                        });
                      };

                      return (
                        <div
                          key={st.id}
                          className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="text-sm text-slate-800 leading-relaxed font-medium">
                            <span className="font-bold text-blue-700 mr-2">{idx + 1}.</span>
                            {st.statement}
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => setVal(true)}
                              className={`px-4 py-2 rounded-xl text-xs font-black transition ${
                                value === true
                                  ? 'bg-emerald-600 text-white shadow-md'
                                  : 'bg-white border border-slate-300 text-slate-600 hover:bg-emerald-50'
                              }`}
                            >
                              ✓ BENAR
                            </button>
                            <button
                              type="button"
                              onClick={() => setVal(false)}
                              className={`px-4 py-2 rounded-xl text-xs font-black transition ${
                                value === false
                                  ? 'bg-red-600 text-white shadow-md'
                                  : 'bg-white border border-slate-300 text-slate-600 hover:bg-red-50'
                              }`}
                            >
                              ✗ SALAH
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. MENJODOHKAN (MATCHING) */}
              {currentQuestion.type === 'matching' && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-slate-500 font-medium">
                    Jodohkan premis di sebelah kiri dengan pilihan padanan yang tepat di sebelah kanan:
                  </p>

                  <div className="space-y-3">
                    {currentQuestion.matchingPairs?.map((pair, idx) => {
                      const curMap = currentAnswer || {};
                      const chosenResponse = curMap[pair.id] || '';

                      return (
                        <div
                          key={pair.id}
                          className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-3 items-center"
                        >
                          <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span>{pair.premise}</span>
                          </div>

                          <div>
                            <select
                              value={chosenResponse}
                              onChange={(e) => {
                                handleAnswerChange(currentQuestion.id, {
                                  ...curMap,
                                  [pair.id]: e.target.value
                                });
                              }}
                              className={`w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition ${
                                chosenResponse
                                  ? 'bg-blue-50 border-blue-400 text-blue-900'
                                  : 'bg-white border-slate-300 text-slate-600'
                              }`}
                            >
                              <option value="">-- Pilih Pasangan Jawaban --</option>
                              {currentQuestion.matchingPairs?.map((p) => (
                                <option key={p.id} value={p.response}>
                                  {p.response}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>

            {/* Bottom Card Action Bar */}
            <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex(prev => prev - 1)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition flex items-center gap-1 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Soal Sebelumnya</span>
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitCurrentQuestion}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl text-sm shadow-lg shadow-blue-500/20 flex items-center gap-2 transition disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? 'Memeriksa...' : isCurrentSubmitted ? 'Perbarui Jawaban Soal Ini' : 'Kirim Jawaban Soal Ini'}</span>
              </button>

              <button
                type="button"
                disabled={currentIndex === stageQuestions.length - 1}
                onClick={() => setCurrentIndex(prev => prev + 1)}
                className="px-4 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100 rounded-xl transition flex items-center gap-1 disabled:opacity-40"
              >
                <span>Soal Berikutnya</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        )}

      </main>

      {/* ============================================================== */}
      {/* REALTIME QUESTION SCORE & RANK POPUP MODAL (REQUIREMENT 6) */}
      {/* "di setiap akhir pengerjaan setiap soal maka akan muncul peringkat siswa" */}
      {/* ============================================================== */}
      {showQuestionResultModal && lastSubmissionResult && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-center space-y-4 animate-scaleIn">
            
            <div className={`w-16 h-16 mx-auto rounded-3xl flex items-center justify-center font-black text-2xl shadow-lg ${
              lastSubmissionResult.isCorrect 
                ? 'bg-gradient-to-tr from-emerald-500 to-green-400 text-white shadow-emerald-500/20' 
                : 'bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 shadow-amber-500/20'
            }`}>
              {lastSubmissionResult.isCorrect ? '✨' : '📝'}
            </div>

            <div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                lastSubmissionResult.isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {lastSubmissionResult.isCorrect ? 'Jawaban Tepat!' : 'Jawaban Disimpan'}
              </span>
              
              <h3 className="text-xl font-black text-slate-900 mt-2">
                +{lastSubmissionResult.scoreEarned} Poin Diperoleh!
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Total Akumulasi Skormu Saat Ini: <strong className="text-amber-600 font-bold">{lastSubmissionResult.totalScore} Poin</strong>
              </p>
            </div>

            {/* LIVE RANKING BOX (Requirement 6) */}
            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-4 shadow-inner space-y-2">
              <div className="text-[11px] uppercase tracking-wider font-bold text-sky-200">
                Peringkat Live Kamu Sekarang:
              </div>
              <div className="text-3xl font-black text-amber-300 flex items-center justify-center gap-2">
                <span>Peringkat ke-{lastSubmissionResult.currentRank}</span>
              </div>
              <p className="text-xs text-sky-100">
                dari total {lastSubmissionResult.totalParticipants} peserta di {stages[activeStageId]?.name}
              </p>
            </div>

            {/* Mini Top 3 Leaderboard */}
            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 text-left space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Top 3 Pemimpin Klasemen:
              </div>
              {lastSubmissionResult.topLeaderboard?.slice(0, 3).map((lead) => (
                <div key={lead.studentId} className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 truncate max-w-[200px]">
                    #{lead.rank} {lead.nama} {lead.studentId === student.id ? '(Kamu)' : ''}
                  </span>
                  <span className="font-bold text-amber-600">{lead.totalScore} Poin</span>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col gap-2">
              {currentIndex < stageQuestions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowQuestionResultModal(false);
                    setCurrentIndex(prev => prev + 1);
                  }}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 transition"
                >
                  <span>Lanjut ke Soal #{currentIndex + 2}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinishStage}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition"
                >
                  <Trophy className="w-4 h-4" />
                  <span>Lihat Rapor & Peringkat Akhir Babak</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowQuestionResultModal(false)}
                className="text-xs text-slate-400 hover:text-slate-600 py-1"
              >
                Tetap di Soal Ini
              </button>
            </div>

          </div>
        </div>
      )}

      {/* IMAGE ZOOM MODAL */}
      {zoomedImage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-hidden p-2">
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute top-4 right-4 bg-black/60 text-white p-2 rounded-full hover:bg-black transition z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={zoomedImage} alt="Zoom" className="max-h-[85vh] w-auto object-contain mx-auto" />
          </div>
        </div>
      )}

    </div>
  );
};
