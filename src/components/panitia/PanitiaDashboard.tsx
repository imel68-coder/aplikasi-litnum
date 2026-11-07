import React, { useState } from 'react';
import { 
  Users, BookOpen, Trophy, Play, CheckCircle, RefreshCw, Plus, 
  Trash2, Edit, Award, ExternalLink, ShieldCheck, LogOut, Download, 
  Radio, Sparkles, Filter, AlertCircle, FileText, Check, ChevronRight,
  Maximize2, Eye, Flame, Rocket, Globe, UploadCloud, DownloadCloud,
  Server, Copy, FileCheck, HelpCircle, HardDrive, Smartphone, CheckCheck
} from 'lucide-react';
import { Question, StageId, Student, LeaderboardRank } from '../../types';
import { 
  adminActivateStage, adminPromoteStudents, adminDeleteQuestion, 
  adminDeleteStudent, adminBulkSeedStudents, adminResetProgress,
  adminSaveQuestion, adminSaveStudent,
  exportDatabaseBackup, importDatabaseBackup, getCustomServerUrl,
  setCustomServerUrl, getServerStatus, sendRealtimePing
} from '../../services/api';
import { QuestionEditorModal } from './QuestionEditorModal';
import { StudentEditorModal } from './StudentEditorModal';

interface PanitiaDashboardProps {
  onLogout: () => void;
  activeStageId: StageId;
  stages: Record<StageId, any>;
  students: Student[];
  questions: Question[];
  leaderboard: LeaderboardRank[];
  onRefreshState: () => void;
}

export const PanitiaDashboard: React.FC<PanitiaDashboardProps> = ({
  onLogout,
  activeStageId,
  stages,
  students,
  questions,
  leaderboard,
  onRefreshState
}) => {
  const [activeTab, setActiveTab] = useState<'stages' | 'questions' | 'students' | 'leaderboard' | 'deploy'>('stages');
  
  // Filtering
  const [selectedStageFilter, setSelectedStageFilter] = useState<StageId | 'all'>('penyisihan');
  const [studentSearch, setStudentSearch] = useState('');
  
  // Modals & Deploy Settings
  const [editingQuestion, setEditingQuestion] = useState<Question | null | 'new'>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null | 'new'>(null);
  const [projectorMode, setProjectorMode] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [successToast, setSuccessToast] = useState('');
  const [customServerUrlInput, setCustomServerUrlInput] = useState(getCustomServerUrl());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [pingStatus, setPingStatus] = useState<string>('');
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
  } | null>(null);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(''), 3500);
  };

  const handleTestPing = async () => {
    setPingStatus('Mengirim sinyal cloud...');
    try {
      const t0 = performance.now();
      await sendRealtimePing();
      const latency = Math.round(performance.now() - t0);
      setPingStatus(`🟢 Cloud Terhubung! Latensi: ${latency}ms (Real-Time Aktif)`);
      showToast(`Ping Real-Time Berhasil! Latensi: ${latency}ms`);
    } catch (err: any) {
      setPingStatus('🔴 Gagal menghubungi cloud: ' + err.message);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
      showToast('Berhasil disalin ke clipboard!');
    } catch {
      showToast('Gagal menyalin teks');
    }
  };

  const handleExportDatabase = () => {
    try {
      const jsonStr = exportDatabaseBackup();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GELORA26_Database_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('File backup database berhasil diunduh!');
    } catch (err: any) {
      showToast('Gagal ekspor: ' + err.message);
    }
  };

  const handleImportDatabase = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        await importDatabaseBackup(content);
        showToast('Database berhasil dipulihkan dari file backup!');
        onRefreshState();
      } catch (err: any) {
        showToast('Gagal memulihkan database: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSaveServerUrl = () => {
    setCustomServerUrl(customServerUrlInput);
    if (customServerUrlInput.trim()) {
      showToast(`Server URL disimpan: ${customServerUrlInput.trim()}`);
    } else {
      showToast('Menggunakan mode Standalone / Netlify bawaan.');
    }
    onRefreshState();
  };

  const handleActivateStage = (stageId: StageId) => {
    setConfirmModal({
      isOpen: true,
      title: 'Konfirmasi Aktifkan Babak',
      message: `Aktifkan ${stages[stageId]?.name || stageId} sekarang? Siswa di seluruh perangkat akan langsung dapat mengerjakan babak ini.`,
      confirmText: 'Ya, Aktifkan Sekarang',
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await adminActivateStage(stageId);
          showToast(`Berhasil mengaktifkan ${stages[stageId]?.name}!`);
          onRefreshState();
        } catch (err: any) {
          showToast('Gagal mengaktifkan: ' + err.message);
        } finally {
          setActionLoading(false);
          setConfirmModal(null);
        }
      }
    });
  };

  const handlePromoteStudents = (fromStageId: StageId, toStageId: StageId, quota: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Loloskan Peserta Terbaik',
      message: `Loloskan Top ${quota} peserta terbaik dari ${stages[fromStageId]?.name} ke ${stages[toStageId]?.name}?`,
      confirmText: `Loloskan Top ${quota}`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          const res = await adminPromoteStudents(fromStageId, toStageId, quota);
          showToast(`Berhasil meloloskan ${res.promotedCount} peserta ke ${stages[toStageId]?.name}!`);
          onRefreshState();
        } catch (err: any) {
          showToast('Gagal memproses: ' + err.message);
        } finally {
          setActionLoading(false);
          setConfirmModal(null);
        }
      }
    });
  };

  const handleBulkSeed = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Generate Peserta Simulasi',
      message: 'Tambahkan 20 peserta uji coba otomatis untuk simulasi lomba akbar?',
      confirmText: 'Tambah 20 Peserta',
      onConfirm: async () => {
        setActionLoading(true);
        try {
          const res = await adminBulkSeedStudents();
          showToast(`Berhasil menambahkan ${res.addedCount} peserta baru! Total: ${res.total}`);
          onRefreshState();
        } catch (err: any) {
          showToast('Gagal generate: ' + err.message);
        } finally {
          setActionLoading(false);
          setConfirmModal(null);
        }
      }
    });
  };

  const handleReset = (stageId: string = 'all') => {
    const text = stageId === 'all' 
      ? 'PERINGATAN: Seluruh progres nilai dan pengerjaan siswa akan di-reset dari awal! Tindakan ini tidak dapat dibatalkan. Lanjutkan?'
      : `Reset seluruh progres jawaban untuk ${stageId}?`;

    setConfirmModal({
      isOpen: true,
      title: 'Reset Data Progres',
      message: text,
      confirmText: 'Ya, Reset Data',
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await adminResetProgress(stageId);
          showToast('Progres berhasil di-reset!');
          onRefreshState();
        } catch (err: any) {
          showToast('Gagal reset: ' + err.message);
        } finally {
          setActionLoading(false);
          setConfirmModal(null);
        }
      }
    });
  };

  const handleDeleteQuestion = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Soal',
      message: 'Apakah Anda yakin ingin menghapus soal ini dari bank soal?',
      confirmText: 'Hapus Soal',
      onConfirm: async () => {
        try {
          await adminDeleteQuestion(id);
          showToast('Soal berhasil dihapus');
          onRefreshState();
        } catch (err: any) {
          showToast('Gagal menghapus soal: ' + err.message);
        } finally {
          setConfirmModal(null);
        }
      }
    });
  };

  const handleDeleteStudent = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Data Siswa',
      message: 'Apakah Anda yakin ingin menghapus data siswa ini beserta riwayat jawabannya?',
      confirmText: 'Hapus Siswa',
      onConfirm: async () => {
        try {
          await adminDeleteStudent(id);
          showToast('Siswa berhasil dihapus');
          onRefreshState();
        } catch (err: any) {
          showToast('Gagal menghapus siswa: ' + err.message);
        } finally {
          setConfirmModal(null);
        }
      }
    });
  };

  // Filtered Questions
  const filteredQuestions = questions.filter(q => {
    if (selectedStageFilter === 'all') return true;
    return q.stageId === selectedStageFilter;
  });

  // Filtered Students
  const filteredStudents = students.filter(s => {
    const matchSearch = s.nama.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.noPeserta.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.sekolah.toLowerCase().includes(studentSearch.toLowerCase());
    return matchSearch;
  });

  const exportStudentsToCSV = () => {
    const headers = ['No Peserta', 'Nama Siswa', 'Asal Sekolah', 'Kelas', 'Babak Terdaftar', 'Status', 'PIN'];
    const rows = students.map(s => [
      `"${s.noPeserta}"`,
      `"${s.nama}"`,
      `"${s.sekolah}"`,
      `"${s.kelas}"`,
      `"${s.qualifiedStage}"`,
      `"${s.status}"`,
      `"${s.pin}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Daftar_Peserta_GELORA26_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col selection:bg-amber-400 selection:text-slate-900">
      
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-sm font-bold animate-bounce">
          <CheckCircle className="w-5 h-5" />
          <span>{successToast}</span>
        </div>
      )}

      {/* TOP HEADER */}
      <header className="bg-gradient-to-r from-blue-900 via-indigo-900 to-sky-900 text-white shadow-lg sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          
          {/* Logo & School Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/10 border border-white/20 p-0.5 shrink-0">
              <img 
                src="/assets/aistudio/WhatsApp_Image_2026-11-04_at_10.53.59_691c768a.jpeg" 
                alt="Logo GELORA 26" 
                className="w-full h-full object-cover rounded-lg"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black tracking-wide text-white">
                  GELORA 26 <span className="text-amber-400 font-extrabold text-sm sm:text-base">PANITIA</span>
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Cloud Online
                </span>
              </div>
              <p className="text-xs text-sky-200">
                SMP Negeri 26 Sijunjung • Panel Kontrol Lomba Literasi & Numerasi
              </p>
            </div>
          </div>

          {/* Right Header Status & Controls */}
          <div className="flex items-center gap-2.5">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-xl border border-white/10 text-xs">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Babak Aktif:</span>
              <strong className="text-amber-300 uppercase">{stages[activeStageId]?.name}</strong>
            </div>

            <button
              onClick={() => setActiveTab('deploy')}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow transition"
              title="Panduan & Pengaturan Publikasi Siswa Netlify"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>Publikasi Netlify</span>
            </button>

            <button
              onClick={() => setProjectorMode(true)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow transition"
              title="Tampilkan Layar Penuh untuk Proyektor Panggung"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Proyektor Papan Skor</span>
            </button>

            <button
              onClick={onRefreshState}
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs transition"
              title="Muat Ulang Data Terbaru"
            >
              <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onLogout}
              className="px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white font-semibold rounded-xl text-xs flex items-center gap-1 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>

        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex overflow-x-auto gap-2 border-t border-white/10 py-1">
          <button
            onClick={() => setActiveTab('stages')}
            className={`py-2 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition ${
              activeTab === 'stages'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'text-sky-100 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>1. Pengelolaan Babak Lomba</span>
          </button>

          <button
            onClick={() => setActiveTab('questions')}
            className={`py-2 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition ${
              activeTab === 'questions'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'text-sky-100 hover:bg-white/10 hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>2. Pengelolaan Soal ({questions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('students')}
            className={`py-2 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition ${
              activeTab === 'students'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'text-sky-100 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>3. Pengelolaan Data Siswa ({students.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`py-2 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition ${
              activeTab === 'leaderboard'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'text-sky-100 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>4. Live Monitor & Peringkat</span>
          </button>

          <button
            onClick={() => setActiveTab('deploy')}
            className={`py-2 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition ${
              activeTab === 'deploy'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'text-sky-100 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Rocket className="w-4 h-4 text-amber-300" />
            <span>5. Publikasi Netlify & Server</span>
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto w-full px-3 sm:px-6 py-6 flex-1">
        
        {/* TAB 1: PENGELOLAAN BABAK LOMBA */}
        {activeTab === 'stages' && (
          <div className="space-y-6">
            
            {/* Stage Control Overview Banner */}
            <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="relative z-10 max-w-2xl">
                <span className="px-3 py-1 bg-amber-400 text-slate-950 text-xs font-bold rounded-full uppercase tracking-wider">
                  Alur Kompetisi Bertingkat
                </span>
                <h2 className="text-xl sm:text-2xl font-black mt-2">
                  Aktivasi Babak Lomba & Kualifikasi Peserta
                </h2>
                <p className="text-xs sm:text-sm text-sky-100 mt-1 leading-relaxed">
                  Lomba Literasi dan Numerasi GELORA 26 terbagi dalam 4 babak: 
                  <span className="font-bold text-amber-300"> Babak Penyisihan ➔ Babak 30 Besar ➔ Babak Semifinal ➔ Babak Grand Final</span>. 
                  Panitia dapat mengaktifkan babak secara realtime kapan saja.
                </p>
              </div>
              <div className="absolute right-0 bottom-0 opacity-15 pointer-events-none transform translate-x-10 translate-y-10">
                <Trophy className="w-72 h-72 text-white" />
              </div>
            </div>

            {/* 4 STAGE CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(['penyisihan', 'top30', 'semifinal', 'final'] as StageId[]).map((stId, index) => {
                const stage = stages[stId];
                const isCurrentActive = activeStageId === stId;
                const stageQuestions = questions.filter(q => q.stageId === stId);
                const totalPoints = stageQuestions.reduce((sum, q) => sum + (q.points || 0), 0);

                return (
                  <div
                    key={stId}
                    className={`rounded-3xl p-5 border-2 transition-all flex flex-col justify-between ${
                      isCurrentActive
                        ? 'bg-white border-amber-500 shadow-xl shadow-amber-500/10 ring-4 ring-amber-500/20'
                        : 'bg-white/80 border-slate-200 hover:border-slate-300 shadow-sm'
                    }`}
                  >
                    <div>
                      {/* Badge Stage */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center">
                          {index + 1}
                        </span>
                        {isCurrentActive ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-500 text-slate-950 flex items-center gap-1 animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-slate-950" />
                            SEDANG AKTIF
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
                            Tidak Aktif
                          </span>
                        )}
                      </div>

                      <h3 className="font-extrabold text-base text-slate-900">{stage?.name}</h3>
                      <p className="text-xs font-semibold text-blue-600 mb-2">{stage?.subtitle}</p>
                      <p className="text-xs text-slate-500 mb-4 line-clamp-3 leading-relaxed">
                        {stage?.description}
                      </p>

                      <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 space-y-1.5 text-xs text-slate-600 mb-4">
                        <div className="flex justify-between">
                          <span>Jumlah Soal:</span>
                          <strong className="text-slate-900">{stageQuestions.length} Butir</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Total Skor Babak:</span>
                          <strong className="text-amber-600">{totalPoints} Poin</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Target Lolos:</span>
                          <strong className="text-blue-600">Top {stage?.passingQuota} Peserta</strong>
                        </div>
                      </div>
                    </div>

                    {/* Stage Buttons */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleActivateStage(stId)}
                        disabled={isCurrentActive || actionLoading}
                        className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                          isCurrentActive
                            ? 'bg-amber-100 text-amber-900 cursor-default'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{isCurrentActive ? 'Babak Ini Sedang Aktif' : `Aktifkan ${stage?.name}`}</span>
                      </button>

                      {/* Promotion action for stages */}
                      {stId === 'penyisihan' && (
                        <button
                          type="button"
                          onClick={() => handlePromoteStudents('penyisihan', 'top30', 30)}
                          className="w-full py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition"
                        >
                          <Award className="w-3.5 h-3.5" />
                          <span>Loloskan Top 30 Peserta</span>
                        </button>
                      )}

                      {stId === 'top30' && (
                        <button
                          type="button"
                          onClick={() => handlePromoteStudents('top30', 'semifinal', 10)}
                          className="w-full py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition"
                        >
                          <Award className="w-3.5 h-3.5" />
                          <span>Loloskan Top 10 ke Semifinal</span>
                        </button>
                      )}

                      {stId === 'semifinal' && (
                        <button
                          type="button"
                          onClick={() => handlePromoteStudents('semifinal', 'final', 3)}
                          className="w-full py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition"
                        >
                          <Award className="w-3.5 h-3.5" />
                          <span>Loloskan Top 3 ke Final</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleReset(stId)}
                        className="w-full py-1.5 text-center text-[11px] text-slate-400 hover:text-red-600 transition"
                      >
                        Reset Nilai Babak Ini
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>

            {/* Quick Master Tools */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-sm text-slate-800">Manajemen Ulang Kompetisi</h4>
                <p className="text-xs text-slate-500">
                  Gunakan tombol ini saat ingin mengosongkan seluruh jawaban peserta atau mengulang simulasi dari awal.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleReset('all')}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset Seluruh Progres Lomba</span>
                </button>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: PENGELOLAAN SOAL (REQUIREMENTS 3, 4, 5) */}
        {activeTab === 'questions' && (
          <div className="space-y-6">
            
            {/* Header with Filters & Add Button */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
              
              {/* Filter Babak */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" /> Filter Babak:
                </span>
                {(['penyisihan', 'top30', 'semifinal', 'final', 'all'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setSelectedStageFilter(f)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      selectedStageFilter === f
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f === 'all' ? 'Semua Babak' : stages[f]?.name}
                  </button>
                ))}
              </div>

              {/* Add Question Button */}
              <button
                type="button"
                onClick={() => setEditingQuestion('new')}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl text-xs sm:text-sm shadow-md shadow-blue-500/20 flex items-center gap-2 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Soal Baru</span>
              </button>

            </div>

            {/* Questions Table / Cards */}
            <div className="space-y-4">
              {filteredQuestions.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
                  <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h4 className="font-bold text-slate-700">Belum Ada Soal di Babak Ini</h4>
                  <p className="text-xs text-slate-400 mt-1 mb-4">
                    Silakan klik tombol "Tambah Soal Baru" untuk mulai memasukkan soal literasi atau numerasi.
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditingQuestion('new')}
                    className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl"
                  >
                    Tambah Soal Sekarang
                  </button>
                </div>
              ) : (
                filteredQuestions.map((q) => {
                  return (
                    <div
                      key={q.id}
                      className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 font-extrabold text-sm flex items-center justify-center border border-blue-200">
                            #{q.order}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                            {stages[q.stageId]?.name}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                            q.category === 'literasi' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'
                          }`}>
                            {q.category}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800">
                            Skor: {q.points} Poin
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 font-medium">
                            Tipe: <strong>
                              {q.type === 'pg_single' && 'Pilihan Ganda (1 Jawaban)'}
                              {q.type === 'pg_complex' && 'PG Kompleks (Multi Jawaban)'}
                              {q.type === 'true_false' && 'Benar atau Salah'}
                              {q.type === 'matching' && 'Menjodohkan'}
                            </strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingQuestion(q)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Sunting Soal"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"
                            title="Hapus Soal"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Stimulus & Image Display */}
                      {q.stimulusText && (
                        <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 border border-slate-200">
                          <span className="font-bold text-slate-500 block mb-1">Stimulus Wacana:</span>
                          <p className="line-clamp-3 leading-relaxed whitespace-pre-line">{q.stimulusText}</p>
                        </div>
                      )}

                      {q.imageUrl && (
                        <div className="flex items-center gap-2 text-xs text-blue-600">
                          <img src={q.imageUrl} alt="Thumbnail" className="w-12 h-12 object-cover rounded-lg border" />
                          <span className="truncate max-w-sm">{q.imageUrl}</span>
                        </div>
                      )}

                      {/* Question Prompt */}
                      <div className="font-bold text-sm text-slate-900">
                        {q.questionPrompt}
                      </div>

                      {/* Answer Breakdown Preview */}
                      <div className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        {q.type === 'pg_single' && (
                          <div>
                            Kunci Jawaban: <strong className="text-emerald-700">
                              {q.options?.find(o => q.correctOptionIds?.includes(o.id))?.text || '-'}
                            </strong>
                          </div>
                        )}
                        {q.type === 'pg_complex' && (
                          <div>
                            Kunci ({q.correctOptionIds?.length} opsi): <strong className="text-blue-700">
                              {q.options?.filter(o => q.correctOptionIds?.includes(o.id)).map(o => o.text).join('; ') || '-'}
                            </strong>
                          </div>
                        )}
                        {q.type === 'true_false' && (
                          <div>
                            Pernyataan ({q.trueFalseStatements?.length} butir): {q.trueFalseStatements?.map(s => `${s.statement.slice(0, 30)}... [${s.correctAnswer ? 'BENAR' : 'SALAH'}]`).join(' | ')}
                          </div>
                        )}
                        {q.type === 'matching' && (
                          <div>
                            Pasangan ({q.matchingPairs?.length} pasang): {q.matchingPairs?.map(m => `${m.premise} ➔ ${m.response}`).join('; ')}
                          </div>
                        )}
                      </div>

                    </div>
                  );
                })
              )}
            </div>

          </div>
        )}

        {/* TAB 3: PENGELOLAAN DATA SISWA (REQUIREMENTS 2 & 7) */}
        {activeTab === 'students' && (
          <div className="space-y-6">
            
            {/* Action Bar */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
              
              {/* Search Bar */}
              <div className="flex-1 min-w-[260px] max-w-md">
                <input
                  type="text"
                  placeholder="Cari siswa, no peserta, atau sekolah..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={exportStudentsToCSV}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Ekspor CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handleBulkSeed}
                  className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                  title="Generate 20 siswa dummy untuk tes akbar"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>+20 Peserta Demo Cepat</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditingStudent('new')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Siswa</span>
                </button>
              </div>

            </div>

            {/* Students Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-bold text-[11px] tracking-wider">
                    <tr>
                      <th className="px-5 py-3.5">No Peserta</th>
                      <th className="px-5 py-3.5">Nama Siswa</th>
                      <th className="px-5 py-3.5">Asal Sekolah</th>
                      <th className="px-5 py-3.5">Kelas</th>
                      <th className="px-5 py-3.5">Babak</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5">PIN Masuk</th>
                      <th className="px-5 py-3.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-5 py-3.5 font-mono font-bold text-blue-700">
                          {st.noPeserta}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-slate-900">
                          {st.nama}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">
                          {st.sekolah}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">
                          {st.kelas}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                            {stages[st.qualifiedStage]?.name || st.qualifiedStage}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            st.status === 'lolos' ? 'bg-emerald-100 text-emerald-800' :
                            st.status === 'aktif' ? 'bg-sky-100 text-sky-800' :
                            st.status === 'gugur' ? 'bg-red-100 text-red-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {st.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-slate-500">
                          {st.pin || '1234'}
                        </td>
                        <td className="px-5 py-3.5 text-right space-x-1">
                          <button
                            type="button"
                            onClick={() => setEditingStudent(st)}
                            className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition"
                            title="Sunting Siswa"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStudent(st.id)}
                            className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition"
                            title="Hapus Siswa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB 4: LIVE MONITOR & PERINGKAT REALTIME (REQUIREMENTS 6 & 7) */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-6">
            
            {/* Top Podium 3 Besar */}
            <div className="bg-gradient-to-b from-blue-900 to-indigo-950 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <span className="px-3 py-1 bg-amber-400 text-slate-950 font-black text-xs rounded-full uppercase">
                    Live Scoreboard Babak: {stages[activeStageId]?.name}
                  </span>
                  <h3 className="text-xl font-black mt-2">Papan Skor Real-Time Cloud Lomba</h3>
                  <p className="text-xs text-sky-200">
                    Nilai otomatis terhitung dan peringkat bergeser langsung saat siswa submit jawaban di HP/laptop
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setProjectorMode(true)}
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-lg flex items-center gap-1.5"
                >
                  <Maximize2 className="w-4 h-4" />
                  <span>Mode Panggung Proyektor</span>
                </button>
              </div>

              {/* Podium Visual */}
              <div className="grid grid-cols-3 gap-3 max-w-2xl mx-auto pt-6 text-center items-end">
                {/* Juara 2 (Perak) */}
                <div className="space-y-2">
                  <div className="w-14 h-14 mx-auto rounded-full bg-slate-300 border-4 border-slate-100 shadow-lg flex items-center justify-center text-slate-800 font-black text-lg">
                    🥈 2
                  </div>
                  <div className="bg-white/10 backdrop-blur rounded-2xl p-3 border border-white/10 h-28 flex flex-col justify-center">
                    <div className="font-bold text-xs truncate">{leaderboard[1]?.nama || 'Belum Ada'}</div>
                    <div className="text-[11px] text-sky-200 truncate">{leaderboard[1]?.sekolah || '-'}</div>
                    <div className="text-base font-black text-amber-300 mt-1">
                      {leaderboard[1]?.totalScore || 0} Poin
                    </div>
                  </div>
                </div>

                {/* Juara 1 (Emas) */}
                <div className="space-y-2">
                  <div className="w-18 h-18 mx-auto rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 border-4 border-amber-200 shadow-xl flex items-center justify-center text-slate-950 font-black text-2xl">
                    👑 1
                  </div>
                  <div className="bg-white/20 backdrop-blur rounded-2xl p-3 border border-amber-400/40 h-36 flex flex-col justify-center shadow-lg">
                    <div className="font-extrabold text-sm truncate">{leaderboard[0]?.nama || 'Belum Ada'}</div>
                    <div className="text-[11px] text-amber-200 truncate">{leaderboard[0]?.sekolah || '-'}</div>
                    <div className="text-xl font-black text-amber-300 mt-1">
                      {leaderboard[0]?.totalScore || 0} Poin
                    </div>
                  </div>
                </div>

                {/* Juara 3 (Perunggu) */}
                <div className="space-y-2">
                  <div className="w-14 h-14 mx-auto rounded-full bg-amber-700 border-4 border-amber-600 shadow-lg flex items-center justify-center text-white font-black text-lg">
                    🥉 3
                  </div>
                  <div className="bg-white/10 backdrop-blur rounded-2xl p-3 border border-white/10 h-24 flex flex-col justify-center">
                    <div className="font-bold text-xs truncate">{leaderboard[2]?.nama || 'Belum Ada'}</div>
                    <div className="text-[11px] text-sky-200 truncate">{leaderboard[2]?.sekolah || '-'}</div>
                    <div className="text-base font-black text-amber-300 mt-1">
                      {leaderboard[2]?.totalScore || 0} Poin
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Complete Ranking Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h4 className="font-bold text-sm text-slate-800">
                  Daftar Peringkat Lengkap ({leaderboard.length} Peserta)
                </h4>
                <span className="text-xs text-slate-500">
                  Diurutkan berdasarkan Skor Tertinggi & Waktu Selesai
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3">Peringkat</th>
                      <th className="px-5 py-3">No Peserta</th>
                      <th className="px-5 py-3">Nama Siswa</th>
                      <th className="px-5 py-3">Asal Sekolah</th>
                      <th className="px-5 py-3">Soal Terjawab</th>
                      <th className="px-5 py-3">Total Skor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leaderboard.map((r) => {
                      const isTop3 = r.rank <= 3;
                      return (
                        <tr
                          key={r.studentId}
                          className={`hover:bg-slate-50 transition ${
                            isTop3 ? 'bg-amber-50/40 font-semibold' : ''
                          }`}
                        >
                          <td className="px-5 py-3.5">
                            <span className={`w-7 h-7 rounded-full inline-flex items-center justify-center font-black text-xs ${
                              r.rank === 1 ? 'bg-amber-400 text-slate-950' :
                              r.rank === 2 ? 'bg-slate-300 text-slate-800' :
                              r.rank === 3 ? 'bg-amber-700 text-white' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {r.rank}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 font-mono text-blue-700 font-bold">
                            {r.noPeserta}
                          </td>
                          <td className="px-5 py-3.5 font-bold text-slate-900">
                            {r.nama}
                          </td>
                          <td className="px-5 py-3.5 text-slate-600">
                            {r.sekolah}
                          </td>
                          <td className="px-5 py-3.5 text-slate-600">
                            {r.totalAnswered} Soal
                          </td>
                          <td className="px-5 py-3.5 font-black text-base text-amber-600">
                            {r.totalScore} Poin
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB 5: PUBLIKASI NETLIFY & SINKRONISASI SERVER */}
        {activeTab === 'deploy' && (
          <div className="space-y-6">
            
            {/* Header Alert / Hero Card */}
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-sky-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
              <div className="relative z-10 max-w-3xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 mb-3">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Cloud Database Realtime Firebase Firestore Aktif</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black tracking-wide">
                  Pusat Sinkronisasi Realtime & Publikasi Netlify
                </h2>
                <p className="text-sm text-sky-100 mt-2 leading-relaxed">
                  Aplikasi telah terhubung ke <strong>Firebase Cloud Firestore</strong>! Sekarang perubahan babak di laptop panitia <strong>langsung berubah secara realtime di HP seluruh siswa</strong>, dan setiap jawaban/skor yang dikerjakan siswa di HP <strong>langsung muncul seketika di papan skor / proyektor laptop panitia</strong> tanpa perlu refresh!
                </p>
              </div>
              <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
            </div>

            {/* Status Koneksi & Jaringan Card */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
                <Server className="w-5 h-5 text-blue-600" />
                <span>Status Sinkronisasi Multi-Perangkat (Laptop & HP Siswa)</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">Database Cloud Realtime</div>
                  <div className="text-base font-black text-emerald-950 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Firebase Firestore Online</span>
                  </div>
                  <p className="text-[11px] text-emerald-700 mt-1">
                    Sinkronisasi otomatis antar-perangkat (Laptop Panitia ⟷ HP Siswa) via cloud stream.
                  </p>
                </div>

                <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl">
                  <div className="text-xs font-bold text-sky-800 uppercase tracking-wider mb-1">Hosting Netlify Siswa</div>
                  <div className="text-base font-black text-sky-950 flex items-center gap-1.5">
                    <Globe className="w-5 h-5 text-sky-600 shrink-0" />
                    <a 
                      href="https://elegant-piroshki-d8fe8a.netlify.app/" 
                      target="_blank" 
                      rel="noreferrer" 
                      className="truncate text-blue-700 underline hover:text-blue-900"
                    >
                      elegant-piroshki-d8fe8a.netlify.app
                    </a>
                  </div>
                  <p className="text-[11px] text-sky-700 mt-1">
                    URL publik resmi untuk HP & laptop siswa. Buka link ini di HP siswa untuk tes realtime!
                  </p>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">Live Cloud Stream</div>
                  <div className="text-base font-black text-amber-950 flex items-center gap-1.5">
                    <Radio className="w-4 h-4 text-amber-600 animate-pulse" />
                    <span>onSnapshot Active (0 Detik Delay)</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTestPing}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-bold shadow-sm transition"
                    >
                      Uji Ping Real-Time
                    </button>
                    {pingStatus && (
                      <span className="text-[11px] font-bold text-slate-800 animate-fadeIn">
                        {pingStatus}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 2 METODE DEPLOY KE NETLIFY */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* METODE 1: GITHUB (REKOMENDASI) */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-full">
                      Metode 1 (Sangat Disarankan)
                    </span>
                    <span className="text-xs text-slate-600 font-bold">Otomatis & Update Otomatis</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-600" />
                    <span>Deploy Otomatis via GitHub ke Netlify</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 mb-4">
                    Setiap kali Anda memperbarui soal atau kode di GitHub, Netlify akan otomatis memperbarui situs web siswa tanpa perlu upload ulang.
                  </p>

                  <div className="space-y-3 text-xs text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                      <div>
                        <strong>Push kode ke GitHub:</strong> Upload seluruh file proyek ini ke repositori baru di akun GitHub Anda (misal: <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">gelora26-sijunjung</code>).
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                      <div>
                        <strong>Buka Netlify:</strong> Masuk ke <a href="https://app.netlify.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold">app.netlify.com</a>, klik <em>Add new site</em> &rarr; <em>Import an existing project</em>.
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                      <div>
                        <strong>Pilih Repositori:</strong> Pilih repositori GitHub Anda. Netlify akan otomatis mendeteksi konfigurasi kami:
                        <ul className="list-disc pl-4 mt-1 font-mono text-[11px] text-slate-600 space-y-0.5">
                          <li>Build command: <span className="text-blue-700 font-bold">npm run build</span></li>
                          <li>Publish directory: <span className="text-blue-700 font-bold">dist</span></li>
                        </ul>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">4</span>
                      <div>
                        <strong>Klik "Deploy Site":</strong> Tunggu ~1 menit. Web akan langsung aktif dengan URL resmi (contoh: <span className="font-mono text-emerald-700 font-semibold">https://gelora26.netlify.app</span>) yang bisa langsung Anda bagikan ke siswa!
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`1. Upload kode ke repositori GitHub.
2. Di app.netlify.com: Add new site -> Import existing project -> GitHub.
3. Pilih repo. Netlify otomatis mendeteksi: Build command: npm run build, Publish dir: dist.
4. Klik Deploy! Dapatkan URL dan bagikan ke siswa.`, 'github_steps')}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs flex items-center gap-1.5 transition"
                  >
                    {copiedKey === 'github_steps' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedKey === 'github_steps' ? 'Tersalin!' : 'Salin Instruksi GitHub'}</span>
                  </button>
                  <a
                    href="https://app.netlify.com"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Buka Netlify.com</span>
                  </a>
                </div>
              </div>

              {/* METODE 2: NETLIFY DROP (MANUAL DOWNLOAD) */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">
                      Metode 2 (Tanpa GitHub)
                    </span>
                    <span className="text-xs text-slate-600 font-bold">Unggah Cepat via Browser</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <UploadCloud className="w-5 h-5 text-amber-600" />
                    <span>Deploy Cepat via Netlify Drop</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 mb-4">
                    Gunakan metode ini jika Anda mengunduh (download) kode ZIP dari AI Studio ke laptop Anda.
                  </p>

                  <div className="space-y-3 text-xs text-slate-700 bg-amber-50/50 p-4 rounded-xl border border-amber-200/80">
                    <div className="p-2.5 bg-amber-100/80 border border-amber-300 rounded-lg text-amber-950 font-bold text-[11px] flex items-start gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <span>PENYEBAB UTAMA GAGAL SEBELUMNYA: Jangan mengunggah file ZIP mentah atau folder utama ke Netlify Drop! Netlify Drop hanya menerima folder <code className="bg-amber-200 px-1 py-0.5 rounded font-mono">dist</code> hasil build!</span>
                    </div>

                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                      <div>
                        <strong>Ekstrak ZIP:</strong> Ekstrak file zip hasil download di laptop Anda.
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                      <div>
                        <strong>Jalankan Build:</strong> Buka terminal / command prompt di folder tersebut, lalu ketik:
                        <div className="bg-slate-900 text-amber-300 font-mono p-2 rounded-lg mt-1 text-[11px]">
                          npm install && npm run build
                        </div>
                        <em>(Perintah ini otomatis membuat folder baru bernama <strong>dist</strong>).</em>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                      <div>
                        <strong>Tarik Folder "dist" ke Netlify Deploys:</strong> Buka <a href="https://app.netlify.com/sites/elegant-piroshki-d8fe8a/deploys" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold">app.netlify.com/sites/elegant-piroshki-d8fe8a/deploys</a> (atau <a href="https://app.netlify.com/drop" target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold">app.netlify.com/drop</a>), lalu <strong>drag & drop folder dist</strong> ke kotak putus-putus di bagian bawah.
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">4</span>
                      <div>
                        <strong>Selesai (Update Live ~10 Detik)!</strong> Situs <code className="bg-amber-100 font-bold px-1 rounded text-emerald-800">elegant-piroshki-d8fe8a.netlify.app</code> langsung diperbarui dengan teknologi Firebase Cloud Realtime, tanpa mengubah link!
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`1. Ekstrak file zip di komputer.
2. Buka terminal di folder proyek, jalankan: npm install && npm run build
3. Buka app.netlify.com/drop di browser.
4. Drag & drop HANYA folder 'dist' ke kotak Netlify Drop.
5. Selesai! Web langsung live dan dapat link yang bisa dibuka siswa.`, 'drop_steps')}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs flex items-center gap-1.5 transition"
                  >
                    {copiedKey === 'drop_steps' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedKey === 'drop_steps' ? 'Tersalin!' : 'Salin Instruksi Netlify Drop'}</span>
                  </button>
                  <a
                    href="https://app.netlify.com/drop"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Buka Netlify Drop</span>
                  </a>
                </div>
              </div>

            </div>

            {/* BACKUP & SINKRONISASI DATABASE */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <HardDrive className="w-5 h-5 text-indigo-600" />
                    <span>Cadangkan & Pulihkan Database (Bank Soal & Siswa)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Simpan seluruh data soal ({questions.length} soal), siswa ({students.length} siswa), dan pengaturan babak ke dalam satu file JSON untuk dipindahkan antar perangkat atau dicadangkan sebelum ujian.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleExportDatabase}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition shadow"
                >
                  <DownloadCloud className="w-4 h-4" />
                  <span>Unduh File Backup Database (.json)</span>
                </button>

                <label className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-2 transition cursor-pointer border border-slate-300">
                  <UploadCloud className="w-4 h-4 text-blue-600" />
                  <span>Pulihkan / Impor Database (.json)</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportDatabase}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* PENGATURAN SERVER TERPUSAT (OPSIONAL) */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-1">
                <Server className="w-5 h-5 text-slate-700" />
                <span>Pengaturan Server Terpusat (Opsional untuk Proyektor Aula Sekolah)</span>
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Secara default, di Netlify siswa mengerjakan soal dengan penyimpanan browser super cepat. Jika panitia ingin nilai seluruh siswa di kelas/aula terkirim secara terpusat ke proyektor laptop guru, Anda bisa memasukkan URL / IP server backend di sini.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
                <input
                  type="text"
                  placeholder="Contoh: http://192.168.1.50:3000 atau https://backend-anda.run.app"
                  value={customServerUrlInput}
                  onChange={(e) => setCustomServerUrlInput(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSaveServerUrl}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition"
                >
                  Simpan Server URL
                </button>
                {customServerUrlInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomServerUrlInput('');
                      setCustomServerUrl('');
                      showToast('Kembali ke mode Netlify bawaan.');
                      onRefreshState();
                    }}
                    className="px-3 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition"
                  >
                    Reset Bawaan
                  </button>
                )}
              </div>
            </div>

            {/* CARA MEMBAGIKAN KE SISWA */}
            <div className="p-5 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 rounded-2xl border border-emerald-200/80">
              <div className="flex items-start gap-3">
                <Smartphone className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm text-emerald-950">
                    Cara Membagikan Aplikasi ke Siswa di Hari H:
                  </h4>
                  <p className="text-xs text-emerald-900 mt-1 leading-relaxed">
                    1. Salin link Netlify Anda (misal: <code className="bg-emerald-100 px-1.5 py-0.5 rounded font-mono font-bold">https://gelora26.netlify.app</code>).<br />
                    2. Bagikan link tersebut ke grup WhatsApp kelas atau tempel QR Code di meja ujian.<br />
                    3. Siswa cukup membuka link di Google Chrome / Safari HP masing-masing.<br />
                    4. Masukkan Nomor Peserta (contoh: <span className="font-mono font-bold">G26-001</span> s.d. <span className="font-mono font-bold">G26-020</span>) dan PIN <span className="font-mono font-bold">1234</span>.<br />
                    5. Siswa langsung mengerjakan soal babak aktif dengan penghitungan skor dan peringkat seketika!
                  </p>
                </div>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* FULLSCREEN PROJECTOR MODE OVERLAY */}
      {projectorMode && (
        <div className="fixed inset-0 z-50 bg-gradient-to-br from-blue-950 via-slate-950 to-indigo-950 text-white p-6 sm:p-10 flex flex-col justify-between overflow-y-auto animate-fadeIn">
          
          {/* Top Projector Bar */}
          <div className="flex items-center justify-between border-b border-white/20 pb-4">
            <div className="flex items-center gap-3">
              <img 
                src="/assets/aistudio/WhatsApp_Image_2026-11-04_at_10.53.59_691c768a.jpeg" 
                alt="Gelora 26" 
                className="w-14 h-14 object-cover rounded-2xl border-2 border-amber-400"
              />
              <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-wider text-white">
                  GELORA 26 <span className="text-amber-400">PAPAN SKOR LIVE</span>
                </h1>
                <p className="text-sm text-sky-200">
                  SMP Negeri 26 Sijunjung • Babak: {stages[activeStageId]?.name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-400/30 text-xs font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                Live Cloud Sync
              </span>
              <button
                type="button"
                onClick={() => setProjectorMode(false)}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition"
              >
                Tutup Mode Proyektor (ESC)
              </button>
            </div>
          </div>

          {/* Projector Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 my-6 flex-1">
            {leaderboard.slice(0, 10).map((r, i) => (
              <div
                key={r.studentId}
                className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
                  r.rank === 1
                    ? 'bg-gradient-to-r from-amber-500/30 to-amber-600/10 border-amber-400 scale-102 shadow-lg shadow-amber-500/20'
                    : r.rank === 2
                    ? 'bg-slate-500/20 border-slate-300'
                    : r.rank === 3
                    ? 'bg-amber-900/30 border-amber-600'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <span className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-base shadow ${
                    r.rank === 1 ? 'bg-amber-400 text-slate-950' :
                    r.rank === 2 ? 'bg-slate-300 text-slate-900' :
                    r.rank === 3 ? 'bg-amber-600 text-white' :
                    'bg-white/20 text-white'
                  }`}>
                    {r.rank}
                  </span>
                  <div>
                    <h3 className="font-extrabold text-base text-white">{r.nama}</h3>
                    <p className="text-xs text-sky-200">{r.sekolah} • {r.noPeserta}</p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-black text-amber-300">{r.totalScore}</div>
                  <div className="text-[10px] text-white/60 uppercase tracking-widest font-bold">POIN</div>
                </div>
              </div>
            ))}
          </div>

          {/* Projector Footer Marquee */}
          <div className="border-t border-white/10 pt-3 text-center text-xs text-sky-200">
            SMP Negeri 26 Sijunjung — Gebyar Literasi dan Numerasi GELORA 26
          </div>

        </div>
      )}

      {/* QUESTION EDITOR MODAL */}
      {editingQuestion && (
        <QuestionEditorModal
          question={editingQuestion === 'new' ? null : editingQuestion}
          defaultStageId={selectedStageFilter === 'all' ? 'penyisihan' : selectedStageFilter}
          onSave={async (q) => {
            await adminSaveQuestion(q);
            showToast('Soal berhasil disimpan!');
            onRefreshState();
          }}
          onClose={() => setEditingQuestion(null)}
        />
      )}

      {/* STUDENT EDITOR MODAL */}
      {editingStudent && (
        <StudentEditorModal
          student={editingStudent === 'new' ? null : editingStudent}
          onSave={async (s) => {
            await adminSaveStudent(s);
            showToast('Data siswa berhasil disimpan!');
            onRefreshState();
          }}
          onClose={() => setEditingStudent(null)}
        />
      )}

      {/* IN-APP CONFIRMATION DIALOG MODAL */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-scaleIn">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              {confirmModal.title}
            </h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-lg transition"
              >
                {confirmModal.confirmText || 'Konfirmasi'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
