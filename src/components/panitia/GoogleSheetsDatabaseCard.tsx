import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  DownloadCloud,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  Link2,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Unlink,
  UploadCloud
} from 'lucide-react';
import { LeaderboardRank, Question, StageConfig, StageId, Student } from '../../types';
import { adminSyncFromGoogleSheets, getAdminProgressSnapshot } from '../../services/api';
import {
  APPS_SCRIPT_BRIDGE_CODE,
  clearLinkedSpreadsheetConfig,
  createGeloraSpreadsheet,
  DriveSpreadsheetFile,
  GoogleAuthExpiredError,
  googleWorkspaceSignIn,
  googleWorkspaceSignOut,
  importDatabaseFromSpreadsheet,
  importDatabaseViaAppsScript,
  initGoogleWorkspaceAuth,
  inspectSpreadsheet,
  isGoogleSheetsPrimaryActive,
  LinkedSpreadsheetConfig,
  listDriveSpreadsheets,
  loadLinkedSpreadsheetConfig,
  saveLinkedSpreadsheetConfig,
  syncDatabaseToSpreadsheet,
  syncDatabaseViaAppsScript,
  testAppsScriptBridge
} from '../../services/googleSheetsDb';

interface ConfirmRequest {
  title: string;
  message: string;
  confirmText?: string;
  onConfirm: () => Promise<void> | void;
}

interface GoogleSheetsDatabaseCardProps {
  activeStageId: StageId;
  stages: Record<StageId, StageConfig>;
  students: Student[];
  questions: Question[];
  leaderboard: LeaderboardRank[];
  onRefreshState: () => void;
  showToast: (msg: string) => void;
  onRequestConfirm: (req: ConfirmRequest) => void;
}

export const GoogleSheetsDatabaseCard: React.FC<GoogleSheetsDatabaseCardProps> = ({
  activeStageId,
  stages,
  students,
  questions,
  leaderboard,
  onRefreshState,
  showToast,
  onRequestConfirm
}) => {
  const [connectionTab, setConnectionTab] = useState<'apps_script' | 'oauth'>('apps_script');
  const [needsAuth, setNeedsAuth] = useState(true);
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [linkedConfig, setLinkedConfig] = useState<LinkedSpreadsheetConfig | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveSpreadsheetFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [driveListNotice, setDriveListNotice] = useState<string | null>(null);

  const [newSheetTitle, setNewSheetTitle] = useState('GELORA 26 - Database Lomba (AppSheet Ready)');
  const [existingUrlInput, setExistingUrlInput] = useState('');
  const [webAppUrlInput, setWebAppUrlInput] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedStudentLink, setCopiedStudentLink] = useState<string | null>(null);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    loadLinkedSpreadsheetConfig().then(cfg => {
      if (cfg && (cfg.spreadsheetId || cfg.bridgeWebAppUrl)) {
        setLinkedConfig(cfg);
        if (cfg.bridgeWebAppUrl) {
          setWebAppUrlInput(cfg.bridgeWebAppUrl);
          setConnectionTab('apps_script');
        } else if (cfg.connectionMode === 'oauth') {
          setConnectionTab('oauth');
        }
      }
    });

    const unsub = initGoogleWorkspaceAuth(
      (user) => {
        setGoogleUser(user);
        setNeedsAuth(false);
        setErrorBanner(null);
      },
      () => {
        setNeedsAuth(true);
      }
    );

    return () => {
      unsub();
    };
  }, []);

  const refreshDriveFiles = async () => {
    setLoadingFiles(true);
    setDriveListNotice(null);
    try {
      const files = await listDriveSpreadsheets();
      setDriveFiles(files);
    } catch (err: any) {
      if (err instanceof GoogleAuthExpiredError) {
        setNeedsAuth(true);
      }
      setDriveListNotice(err.message || 'Daftar file Drive belum tersedia.');
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (!needsAuth && connectionTab === 'oauth') {
      refreshDriveFiles();
    }
  }, [needsAuth, connectionTab]);

  // ====================================================
  // MODE 1 HANDLERS: GOOGLE APPS SCRIPT BRIDGE
  // ====================================================

  const handleCopyAppsScript = () => {
    try {
      navigator.clipboard.writeText(APPS_SCRIPT_BRIDGE_CODE);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
      showToast('Kode Google Apps Script berhasil disalin!');
    } catch {
      showToast('Gagal menyalin otomatis. Silakan blok & salin kode secara manual.');
    }
  };

  const handleConnectAppsScript = async () => {
    const url = webAppUrlInput.trim();
    if (!url) return;
    setBusyAction('test_bridge');
    setErrorBanner(null);
    try {
      const info = await testAppsScriptBridge(url);
      if (!info.version || info.version < 2) {
        setErrorBanner(
          'Web App Apps Script Anda masih memakai kode versi 1 (lama). Untuk memindahkan seluruh aktivitas ujian siswa ke Google Sheets, silakan salin Kode Terbaru (v2) di sebelah kanan, tempel di Apps Script, lalu klik Deploy → Manage deployments → ikon Pensil → Version: New version → Deploy.'
        );
        return;
      }
      onRequestConfirm({
        title: 'Hubungkan Google Spreadsheet via Web App?',
        message: `Berhasil terhubung ke file Google Sheets "${info.title}" (Engine Ujian v${info.version} siap). Hubungkan aplikasi dengan Spreadsheet ini di Google Drive Anda?`,
        confirmText: 'Ya, Hubungkan Sekarang',
        onConfirm: async () => {
          const cfg: LinkedSpreadsheetConfig = {
            spreadsheetId: info.spreadsheetId,
            spreadsheetTitle: info.title,
            spreadsheetUrl: info.url,
            bridgeWebAppUrl: url,
            connectionMode: 'apps_script',
            useSheetsAsPrimaryDb: linkedConfig?.useSheetsAsPrimaryDb || false,
            lastSyncedAt: Date.now()
          };
          await saveLinkedSpreadsheetConfig(cfg);
          setLinkedConfig(cfg);
          showToast(`Berhasil terhubung ke Google Sheets "${info.title}"!`);
        }
      });
    } catch (err: any) {
      setErrorBanner(err.message || 'Gagal menghubungi Web App Google Apps Script.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleTogglePrimarySheetsMode = async () => {
    if (!linkedConfig?.bridgeWebAppUrl) return;
    const isCurrentlyActive = Boolean(linkedConfig.useSheetsAsPrimaryDb || isGoogleSheetsPrimaryActive());

    if (isCurrentlyActive) {
      onRequestConfirm({
        title: 'Nonaktifkan Mode Database Utama Google Sheets?',
        message:
          'Aktivitas ujian siswa akan dikembalikan ke Firebase Firestore. Semua data yang sudah tersimpan di Google Sheets dan Google Drive Anda tetap aman dan tidak terhapus.',
        confirmText: 'Ya, Kembalikan ke Firestore',
        onConfirm: async () => {
          setBusyAction('toggle_primary');
          try {
            const nextCfg: LinkedSpreadsheetConfig = {
              ...linkedConfig,
              useSheetsAsPrimaryDb: false,
              updatedAt: Date.now()
            };
            await saveLinkedSpreadsheetConfig(nextCfg);
            setLinkedConfig(nextCfg);
            showToast('Mode ujian dikembalikan ke Firebase Firestore.');
            onRefreshState();
          } finally {
            setBusyAction(null);
          }
        }
      });
      return;
    }

    setBusyAction('check_v2');
    setErrorBanner(null);
    try {
      const info = await testAppsScriptBridge(linkedConfig.bridgeWebAppUrl);
      if (!info.version || info.version < 2) {
        setConnectionTab('apps_script');
        setErrorBanner(
          'Web App Apps Script masih memakai kode versi 1 (hanya backup). Untuk memindahkan seluruh aktivitas ujian siswa ke Google Sheets, salin Kode Terbaru (v2) di bawah, tempel di Apps Script, klik Deploy → Manage deployments → ikon Pensil → pilih Version: New version → Deploy, lalu aktifkan kembali.'
        );
        return;
      }

      onRequestConfirm({
        title: 'Pindahkan Seluruh Aktivitas Ujian Siswa ke Google Sheets?',
        message: `Sistem akan menyinkronkan ${students.length} siswa, ${questions.length} soal, progres ujian, dan peringkat saat ini ke "${linkedConfig.spreadsheetTitle}" terlebih dahulu. Setelah aktif, seluruh login siswa, soal, penyimpanan jawaban (Jawaban_Detail), dan Peringkat Live akan berjalan langsung di Google Sheets.`,
        confirmText: 'Ya, Aktifkan Ujian di Google Sheets',
        onConfirm: async () => {
          setBusyAction('toggle_primary');
          setErrorBanner(null);
          try {
            const progressList = await getAdminProgressSnapshot();
            const saved = await syncDatabaseViaAppsScript(
              linkedConfig.bridgeWebAppUrl!,
              {
                activeStageId,
                stages,
                students,
                questions,
                progressList,
                leaderboard
              },
              true
            );
            setLinkedConfig(saved);
            showToast('Berhasil! Seluruh aktivitas ujian siswa kini berjalan langsung di Google Sheets.');
            onRefreshState();
          } catch (err: any) {
            setErrorBanner(err.message || 'Gagal mengaktifkan mode ujian Google Sheets.');
          } finally {
            setBusyAction(null);
          }
        }
      });
    } catch (err: any) {
      setErrorBanner(err.message || 'Gagal memverifikasi Web App Google Apps Script.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyStudentLink = (url: string, labelKey: string) => {
    try {
      navigator.clipboard.writeText(url);
      setCopiedStudentLink(labelKey);
      setTimeout(() => setCopiedStudentLink(null), 2500);
      showToast('Link ujian Google Sheets berhasil disalin!');
    } catch {
      showToast('Gagal menyalin link. Silakan blok & salin manual.');
    }
  };

  // ====================================================
  // MODE 2 HANDLERS: GOOGLE SIGN-IN OAUTH
  // ====================================================

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setErrorBanner(null);
    try {
      const res = await googleWorkspaceSignIn();
      setGoogleUser(res.user);
      setNeedsAuth(false);
      showToast(`Berhasil masuk dengan Google (${res.user.email || res.user.displayName})!`);
    } catch (err: any) {
      setErrorBanner(err.message || 'Gagal masuk dengan Google.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleSignOut = () => {
    onRequestConfirm({
      title: 'Putuskan Sesi Akun Google?',
      message: 'Sesi Google Drive / Sheets akan ditutup di browser ini. File Spreadsheet yang sudah tersimpan di Google Drive Anda tidak akan terhapus.',
      confirmText: 'Ya, Keluar Akun Google',
      onConfirm: async () => {
        await googleWorkspaceSignOut();
        setGoogleUser(null);
        setNeedsAuth(true);
        setDriveFiles([]);
        showToast('Berhasil keluar dari sesi Google Drive.');
      }
    });
  };

  const handleCreateNewSpreadsheet = () => {
    const title = newSheetTitle.trim() || 'GELORA 26 - Database Lomba (AppSheet Ready)';
    onRequestConfirm({
      title: 'Buat Database Spreadsheet Baru di Google Drive?',
      message: `Sistem akan membuat file Google Sheets baru berjudul "${title}" di Google Drive Anda dengan 6 tabel siap AppSheet (Babak, Siswa, Soal, Progres_Siswa, Peringkat_Live, Pengaturan) lalu mengisi ${students.length} data siswa, ${questions.length} soal, dan peringkat saat ini.`,
      confirmText: 'Buat & Simpan ke Drive',
      onConfirm: async () => {
        setBusyAction('create');
        setErrorBanner(null);
        try {
          const created = await createGeloraSpreadsheet(title);
          const progressList = await getAdminProgressSnapshot();
          const saved = await syncDatabaseToSpreadsheet(created.spreadsheetId, {
            activeStageId,
            stages,
            students,
            questions,
            progressList,
            leaderboard
          });
          setLinkedConfig(saved);
          await refreshDriveFiles();
          showToast(`Database Google Sheets "${saved.spreadsheetTitle}" berhasil dibuat & disinkronkan!`);
        } catch (err: any) {
          if (err instanceof GoogleAuthExpiredError) setNeedsAuth(true);
          setErrorBanner(err.message || 'Gagal membuat Google Spreadsheet.');
        } finally {
          setBusyAction(null);
        }
      }
    });
  };

  const handleLinkExistingSpreadsheet = async (idOrUrl: string) => {
    setBusyAction('inspect');
    setErrorBanner(null);
    try {
      const meta = await inspectSpreadsheet(idOrUrl);
      const tabNames = meta.sheets.map(s => s.title).join(', ') || '(kosong)';
      onRequestConfirm({
        title: 'Hubungkan ke Google Spreadsheet Ini?',
        message: `Hubungkan aplikasi dengan file "${meta.title}" (Tab saat ini: ${tabNames})?`,
        confirmText: 'Ya, Hubungkan File Ini',
        onConfirm: async () => {
          const cfg: LinkedSpreadsheetConfig = {
            spreadsheetId: meta.spreadsheetId,
            spreadsheetTitle: meta.title,
            spreadsheetUrl: meta.spreadsheetUrl,
            connectionMode: 'oauth',
            lastSyncedAt: Date.now()
          };
          await saveLinkedSpreadsheetConfig(cfg);
          setLinkedConfig(cfg);
          setExistingUrlInput('');
          showToast(`Terhubung ke "${meta.title}"!`);
        }
      });
    } catch (err: any) {
      if (err instanceof GoogleAuthExpiredError) setNeedsAuth(true);
      setErrorBanner(err.message || 'Gagal memeriksa Google Spreadsheet.');
    } finally {
      setBusyAction(null);
    }
  };

  // ====================================================
  // UNIFIED 2-WAY SYNC HANDLERS (BOTH MODES)
  // ====================================================

  const handleSyncToSheets = () => {
    if (!linkedConfig) return;
    const isBridge = linkedConfig.connectionMode === 'apps_script' && Boolean(linkedConfig.bridgeWebAppUrl);

    onRequestConfirm({
      title: 'Perbarui Data di Google Sheets?',
      message: `Aksi ini akan memperbarui isi 6 tab (Babak, Siswa, Soal, Progres_Siswa, Peringkat_Live, Pengaturan) pada Google Sheets "${linkedConfig.spreadsheetTitle}" dengan ${students.length} data siswa, ${questions.length} soal, dan peringkat terbaru.`,
      confirmText: 'Ya, Sinkron ke Google Sheets',
      onConfirm: async () => {
        setBusyAction('push');
        setErrorBanner(null);
        try {
          const progressList = await getAdminProgressSnapshot();
          const saved = isBridge
            ? await syncDatabaseViaAppsScript(linkedConfig.bridgeWebAppUrl!, {
                activeStageId,
                stages,
                students,
                questions,
                progressList,
                leaderboard
              })
            : await syncDatabaseToSpreadsheet(linkedConfig.spreadsheetId, {
                activeStageId,
                stages,
                students,
                questions,
                progressList,
                leaderboard
              });
          setLinkedConfig(saved);
          showToast(`Berhasil menyimpan ${students.length} siswa, ${questions.length} soal & nilai terbaru ke Google Sheets!`);
        } catch (err: any) {
          if (err instanceof GoogleAuthExpiredError) setNeedsAuth(true);
          setErrorBanner(err.message || 'Gagal menyinkronkan data ke Google Sheets.');
        } finally {
          setBusyAction(null);
        }
      }
    });
  };

  const handleImportFromSheets = async () => {
    if (!linkedConfig) return;
    const isBridge = linkedConfig.connectionMode === 'apps_script' && Boolean(linkedConfig.bridgeWebAppUrl);

    setBusyAction('pull_preview');
    setErrorBanner(null);
    try {
      const parsed = isBridge
        ? await importDatabaseViaAppsScript(linkedConfig.bridgeWebAppUrl!, questions, stages)
        : await importDatabaseFromSpreadsheet(linkedConfig.spreadsheetId, questions, stages);

      if (parsed.students.length === 0 && parsed.questions.length === 0 && !parsed.activeStageId) {
        showToast('Tidak ada data Siswa/Soal yang ditemukan di Spreadsheet tersebut.');
        return;
      }

      onRequestConfirm({
        title: 'Terapkan Data dari Google Sheets / AppSheet ke Aplikasi?',
        message: `Ditemukan ${parsed.students.length} data siswa dan ${parsed.questions.length} soal di "${parsed.spreadsheet.title}"${parsed.activeStageId ? ` (Babak aktif: ${parsed.activeStageId})` : ''}. Terapkan perubahan ini ke database cloud aplikasi? (Riwayat jawaban siswa tetap aman).`,
        confirmText: 'Ya, Terapkan dari Google Sheets',
        onConfirm: async () => {
          setBusyAction('pull_apply');
          try {
            const res = await adminSyncFromGoogleSheets({
              students: parsed.students,
              questions: parsed.questions,
              activeStageId: parsed.activeStageId,
              stages: parsed.stages
            });
            await saveLinkedSpreadsheetConfig({
              ...linkedConfig,
              spreadsheetId: parsed.spreadsheet.spreadsheetId || linkedConfig.spreadsheetId,
              spreadsheetTitle: parsed.spreadsheet.title || linkedConfig.spreadsheetTitle,
              spreadsheetUrl: parsed.spreadsheet.spreadsheetUrl || linkedConfig.spreadsheetUrl,
              lastSyncedAt: Date.now()
            });
            showToast(`Berhasil memuat ${res.studentsUpdated} siswa & ${res.questionsUpdated} soal dari Google Sheets!`);
            onRefreshState();
          } finally {
            setBusyAction(null);
          }
        }
      });
    } catch (err: any) {
      if (err instanceof GoogleAuthExpiredError) setNeedsAuth(true);
      setErrorBanner(err.message || 'Gagal membaca data dari Google Sheets.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDisconnectSpreadsheet = () => {
    if (!linkedConfig) return;
    onRequestConfirm({
      title: 'Putuskan Tautan Spreadsheet Ini?',
      message: `Lepaskan tautan dari "${linkedConfig.spreadsheetTitle}"? File spreadsheet dan data di Google Drive Anda tetap aman dan tidak akan dihapus.`,
      confirmText: 'Putuskan Tautan',
      onConfirm: async () => {
        await clearLinkedSpreadsheetConfig();
        setLinkedConfig(null);
        setWebAppUrlInput('');
        showToast('Tautan Google Spreadsheet dilepaskan.');
      }
    });
  };

  const isLinkedViaBridge = linkedConfig?.connectionMode === 'apps_script' && Boolean(linkedConfig?.bridgeWebAppUrl);
  const isLinkedViaOAuth = Boolean(linkedConfig?.spreadsheetId) && !isLinkedViaBridge;
  const isPrimarySheetsOn = Boolean(linkedConfig?.useSheetsAsPrimaryDb || isGoogleSheetsPrimaryActive());
  const netlifyBaseUrl = 'https://elegant-piroshki-d8fe8a.netlify.app';
  const currentOriginUrl = typeof window !== 'undefined' ? window.location.origin : netlifyBaseUrl;
  const studentNetlifySheetLink = linkedConfig?.bridgeWebAppUrl
    ? `${netlifyBaseUrl}/?sheet=${encodeURIComponent(linkedConfig.bridgeWebAppUrl)}`
    : '';
  const studentOriginSheetLink = linkedConfig?.bridgeWebAppUrl
    ? `${currentOriginUrl}/?sheet=${encodeURIComponent(linkedConfig.bridgeWebAppUrl)}`
    : '';

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-200 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold mb-2">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Database Google Drive • Google Sheets &amp; AppSheet</span>
          </div>
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-600" />
            <span>Simpan &amp; Kelola Database di Google Drive (Sheets / AppSheet)</span>
          </h3>
          <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
            Simpan seluruh bank soal ({questions.length}), data peserta ({students.length}), progres ujian, dan peringkat live langsung ke <strong>Google Spreadsheet</strong> di Google Drive Anda. Tersedia <strong>2 jalur koneksi</strong> agar lancar baik di akun <code className="bg-slate-100 px-1 rounded">@belajar.id</code>, Netlify, maupun Google pribadi.
          </p>
        </div>

        {!needsAuth && googleUser && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="text-xs">
              <div className="font-bold text-emerald-950 truncate max-w-[180px]">
                {googleUser.email || googleUser.displayName || 'Akun Google Terhubung'}
              </div>
              <div className="text-[10px] text-emerald-700">Google Drive &amp; Sheets Aktif</div>
            </div>
            <button
              type="button"
              onClick={handleGoogleSignOut}
              className="ml-2 p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
              title="Keluar Akun Google"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Error Notice */}
      {errorBanner && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span className="font-medium leading-relaxed">{errorBanner}</span>
          </div>
          {connectionTab === 'oauth' && (
            <button
              type="button"
              onClick={() => {
                setErrorBanner(null);
                setConnectionTab('apps_script');
              }}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] shrink-0 transition"
            >
              Pindah ke Cara 1 (Apps Script)
            </button>
          )}
        </div>
      )}

      {/* Active Linked Spreadsheet Panel (Shown for either mode!) */}
      {(isLinkedViaBridge || isLinkedViaOAuth) && linkedConfig && (
        <div className="bg-emerald-50/70 border border-emerald-300 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    Spreadsheet Database Terhubung
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 text-[10px] font-bold">
                    {isLinkedViaBridge ? 'Via Apps Script Web App' : 'Via Akun Google'}
                  </span>
                </div>
                <h4 className="font-black text-base text-slate-900">
                  {linkedConfig.spreadsheetTitle}
                </h4>
                <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                  {linkedConfig.spreadsheetId && <span>ID: {linkedConfig.spreadsheetId}</span>}
                  {linkedConfig.lastSyncedAt && (
                    <span className="ml-2 font-sans text-emerald-700 font-semibold">
                      • Sinkron terakhir: {new Date(linkedConfig.lastSyncedAt).toLocaleString('id-ID')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {linkedConfig.spreadsheetUrl && (
                <a
                  href={linkedConfig.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 transition shadow-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka di Google Sheets</span>
                </a>
              )}
              <button
                type="button"
                onClick={handleDisconnectSpreadsheet}
                className="px-3 py-2 bg-white hover:bg-red-50 text-slate-600 hover:text-red-700 border border-slate-200 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 transition"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>Lepas Tautan</span>
              </button>
            </div>
          </div>

          {isLinkedViaOAuth && needsAuth ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
              <span>Masuk dengan akun Google Anda di tab Cara 2 untuk menyinkronkan file ini, atau gunakan Cara 1 (Apps Script).</span>
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs"
              >
                Masuk Google
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-emerald-200">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleSyncToSheets}
                className="p-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-left transition shadow flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-bold text-xs sm:text-sm flex items-center gap-1.5">
                    <UploadCloud className="w-4 h-4" />
                    <span>
                      {busyAction === 'push'
                        ? 'Menyimpan ke Google Drive...'
                        : 'Simpan & Sinkron ke Google Sheets'}
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-100 mt-0.5">
                    Kirim {students.length} siswa, {questions.length} soal, progres &amp; peringkat ke Google Drive
                  </div>
                </div>
                <RefreshCw className={`w-4 h-4 shrink-0 ${busyAction === 'push' ? 'animate-spin' : ''}`} />
              </button>

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleImportFromSheets}
                className="p-3.5 bg-white hover:bg-blue-50 disabled:opacity-60 text-slate-900 border border-blue-300 rounded-xl text-left transition shadow-xs flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-bold text-xs sm:text-sm text-blue-800 flex items-center gap-1.5">
                    <DownloadCloud className="w-4 h-4" />
                    <span>
                      {busyAction?.startsWith('pull')
                        ? 'Membaca Google Sheets...'
                        : 'Muat Editan dari Google Sheets / AppSheet'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    Ambil perubahan Siswa / Soal yang diedit lewat Google Sheets atau AppSheet
                  </div>
                </div>
                <RefreshCw className={`w-4 h-4 text-blue-600 shrink-0 ${busyAction?.startsWith('pull') ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}

          {/* MODE DATABASE UTAMA UJIAN SISWA (GOOGLE SHEETS) */}
          {isLinkedViaBridge && linkedConfig.bridgeWebAppUrl ? (
            <div
              className={`rounded-2xl p-4 border-2 transition space-y-3 ${
                isPrimarySheetsOn
                  ? 'bg-emerald-900 text-white border-emerald-500 shadow-lg'
                  : 'bg-white text-slate-900 border-amber-300'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide ${
                        isPrimarySheetsOn
                          ? 'bg-emerald-400 text-slate-950'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {isPrimarySheetsOn
                        ? 'AKTIF: Seluruh Ujian Siswa di Google Sheets'
                        : 'BELUM AKTIF: Ujian Siswa Masih di Firebase Firestore'}
                    </span>
                  </div>
                  <h5 className={`font-black text-sm ${isPrimarySheetsOn ? 'text-white' : 'text-slate-900'}`}>
                    Mode Database Utama Ujian Siswa (Anti-Kuota Firebase)
                  </h5>
                  <p className={`text-xs leading-relaxed ${isPrimarySheetsOn ? 'text-emerald-100' : 'text-slate-600'}`}>
                    {isPrimarySheetsOn
                      ? 'Seluruh aktivitas ujian (login peserta, ambil soal, simpan tiap jawaban ke tab Jawaban_Detail, Progres_Siswa, dan Peringkat_Live) kini berjalan langsung ke Google Sheets Anda dengan LockService & Cache.'
                      : 'Aktifkan mode ini agar 164 siswa langsung login, memuat soal, menyimpan jawaban, dan memperbarui Peringkat Live langsung ke Google Spreadsheet tanpa terpengaruh kuota harian Firebase.'}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleTogglePrimarySheetsMode}
                  className={`px-4 py-2.5 rounded-xl font-black text-xs transition shrink-0 shadow ${
                    isPrimarySheetsOn
                      ? 'bg-white/15 hover:bg-white/25 text-white border border-white/30'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {busyAction === 'toggle_primary' || busyAction === 'check_v2'
                    ? 'Memverifikasi & Menyinkronkan...'
                    : isPrimarySheetsOn
                    ? 'Kembalikan Ujian ke Firestore'
                    : 'Aktifkan Google Sheets sebagai Database Utama Ujian'}
                </button>
              </div>

              {isPrimarySheetsOn && (
                <div className="bg-emerald-950/60 border border-emerald-400/40 rounded-xl p-3.5 space-y-2">
                  <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Link2 className="w-4 h-4 shrink-0" />
                    <span>Link Ujian Khusus Google Sheets untuk HP Siswa (100% Bebas Kuota Firebase):</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      readOnly
                      value={studentNetlifySheetLink}
                      className="flex-1 px-3 py-2 bg-slate-950/80 border border-emerald-500/40 rounded-lg text-[11px] font-mono text-emerald-200 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyStudentLink(studentNetlifySheetLink, 'netlify')}
                      className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-lg text-xs inline-flex items-center justify-center gap-1.5 shrink-0 transition"
                    >
                      {copiedStudentLink === 'netlify' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedStudentLink === 'netlify' ? 'Link Disalin!' : 'Salin Link Siswa (Netlify)'}</span>
                    </button>
                  </div>
                  {currentOriginUrl !== netlifyBaseUrl && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-emerald-200">
                      <span>Untuk uji coba di preview browser ini sekarang:</span>
                      <button
                        type="button"
                        onClick={() => handleCopyStudentLink(studentOriginSheetLink, 'origin')}
                        className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-lg font-bold inline-flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedStudentLink === 'origin' ? 'Link Uji Disalin!' : 'Salin Link Uji Browser Ini'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : isLinkedViaOAuth ? (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900">
              <strong>Info Mode Ujian Siswa Penuh:</strong> Tautan saat ini memakai Login Akun Google Panitia (OAuth), cocok untuk backup/ekspor. Agar <strong>164 HP siswa dapat mengerjakan ujian langsung ke Google Sheets tanpa harus login akun Google</strong>, hubungkan juga melalui <strong>Cara 1 (Apps Script Web App)</strong> di bawah.
            </div>
          ) : null}
        </div>
      )}

      {/* Mode Switcher */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-slate-100 p-1.5 rounded-2xl">
        <button
          type="button"
          onClick={() => {
            setErrorBanner(null);
            setConnectionTab('apps_script');
          }}
          className={`py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
            connectionTab === 'apps_script'
              ? 'bg-white text-emerald-800 shadow-sm border border-emerald-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Cara 1: Via Google Apps Script (Rekomendasi @belajar.id &amp; Netlify)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setErrorBanner(null);
            setConnectionTab('oauth');
          }}
          className={`py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
            connectionTab === 'oauth'
              ? 'bg-white text-blue-800 shadow-sm border border-blue-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-blue-600" />
          <span>Cara 2: Login Akun Google Langsung (Google OAuth)</span>
        </button>
      </div>

      {/* MODE 1: APPS SCRIPT WEB APP BRIDGE */}
      {connectionTab === 'apps_script' && (
        <div className="space-y-4">
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-5 space-y-4">
            <div>
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-600" />
                <span>Hubungkan Langsung ke Google Spreadsheet Anda (Bebas Blokir Akun Sekolah @belajar.id)</span>
              </h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Cara ini berjalan 100% di dalam akun Google Drive Anda sendiri sehingga tidak terblokir kebijakan domain sekolah (<code className="bg-white px-1 rounded">belajar.id</code>), tidak terkena popup block browser, dan tetap berfungsi penuh di Netlify.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Step-by-step */}
              <div className="bg-white rounded-xl p-4 border border-emerald-200 space-y-2.5 text-xs text-slate-700">
                <div className="font-bold text-emerald-900">Langkah Singkat (Cukup Sekali Saja):</div>
                <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
                  <li>
                    Buka Google Drive Anda &rarr; klik <strong>Baru (+) &rarr; Google Spreadsheet</strong> (beri nama misalnya: <em>GELORA 26 Database</em>).
                  </li>
                  <li>
                    Di dalam Spreadsheet tersebut, klik menu <strong>Ekstensi &rarr; Apps Script</strong>.
                  </li>
                  <li>
                    Hapus kode bawaan, lalu <strong>salin &amp; tempel kode terbaru (v5 Engine Ujian Cepat &amp; Live Login) di sebelah kanan</strong>, kemudian klik ikon <strong>Simpan (Ctrl+S)</strong>.
                  </li>
                  <li>
                    Klik tombol biru <strong>Deploy &rarr; New deployment</strong> &rarr; pilih jenis <strong>Web app</strong>:
                    <ul className="list-disc pl-4 mt-1 text-[11px] text-slate-600">
                      <li><em>Execute as</em>: <strong>Me (email Anda)</strong></li>
                      <li><em>Who has access</em>: <strong>Anyone (Siapa saja)</strong></li>
                    </ul>
                  </li>
                  <li>
                    Klik <strong>Deploy</strong>, salin <strong>Web app URL</strong> (<code className="bg-slate-100 px-1 rounded">https://script.google.com/macros/s/.../exec</code>) dan tempel di kolom bawah ini.
                  </li>
                </ol>
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-950 leading-relaxed">
                  <strong>Sudah pernah deploy Code.gs sebelumnya?</strong> Salin ulang kode v5 terbaru di sebelah kanan, tempel di Apps Script, klik Simpan, lalu klik <strong>Deploy &rarr; Manage deployments &rarr; ikon Pensil (Edit) &rarr; pilih Version: New version &rarr; Deploy</strong> (URL tetap sama, pencatatan login siswa live, hapus skor &amp; cache cepat langsung aktif).
                </div>
              </div>

              {/* Copy Script Box */}
              <div className="bg-slate-900 text-slate-100 rounded-xl p-4 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-300">Kode Google Apps Script (Code.gs v5 Engine Ujian Cepat + Live Login)</span>
                  <button
                    type="button"
                    onClick={handleCopyAppsScript}
                    className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-[11px] inline-flex items-center gap-1 transition"
                  >
                    {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedScript ? 'Tersalin!' : 'Salin Kode'}</span>
                  </button>
                </div>
                <pre className="text-[10px] font-mono text-sky-100 overflow-x-auto max-h-44 leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-white/10">
                  {APPS_SCRIPT_BRIDGE_CODE}
                </pre>
              </div>
            </div>

            {/* Paste Web App URL Input */}
            <div className="bg-white rounded-xl p-4 border border-emerald-200 space-y-2">
              <label className="block text-xs font-bold text-slate-800">
                Tempel URL Web App Google Apps Script Anda:
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  value={webAppUrlInput}
                  onChange={e => setWebAppUrlInput(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  disabled={!webAppUrlInput.trim() || busyAction !== null}
                  onClick={handleConnectAppsScript}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs inline-flex items-center justify-center gap-1.5 transition shrink-0 shadow"
                >
                  <Link2 className="w-4 h-4" />
                  <span>{busyAction === 'test_bridge' ? 'Menguji Koneksi...' : 'Tes & Hubungkan Google Sheet'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODE 2: DIRECT OAUTH SIGN-IN */}
      {connectionTab === 'oauth' && (
        <div className="space-y-4">
          {needsAuth ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <h4 className="font-bold text-sm text-slate-900">
                  Masuk dengan Akun Google Panitia untuk Mengakses Google Drive &amp; Sheets
                </h4>
                <p className="text-xs text-slate-600 max-w-xl">
                  Cocok untuk akun Gmail pribadi atau domain yang sudah terdaftar. Jika akun <code className="bg-white px-1 rounded">@belajar.id</code> Anda memblokir login pop-up atau Anda membuka dari Netlify, silakan pilih <strong>Cara 1: Via Google Apps Script</strong> di atas.
                </p>
              </div>

              <button
                type="button"
                disabled={isLoggingIn}
                onClick={handleGoogleLogin}
                className="gsi-material-button shrink-0"
              >
                <div className="gsi-material-button-state" />
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      xmlnsXlink="http://www.w3.org/1999/xlink"
                      style={{ display: 'block' }}
                    >
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">
                    {isLoggingIn ? 'Menghubungkan...' : 'Sign in with Google'}
                  </span>
                  <span style={{ display: 'none' }}>Sign in with Google</span>
                </div>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Option A: Create New AppSheet-Ready Spreadsheet */}
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-600 text-white rounded-full text-[10px] font-bold uppercase mb-2">
                    <Sparkles className="w-3 h-3" />
                    <span>Cara Termudah (1 Klik)</span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900">
                    Buat Database Spreadsheet Baru di Google Drive
                  </h4>
                  <p className="text-xs text-slate-600 mt-1">
                    Otomatis membuat file Spreadsheet baru lengkap dengan 6 tab tabel (<code className="bg-white px-1 rounded">Siswa</code>, <code className="bg-white px-1 rounded">Soal</code>, <code className="bg-white px-1 rounded">Babak</code>, <code className="bg-white px-1 rounded">Progres_Siswa</code>, <code className="bg-white px-1 rounded">Peringkat_Live</code>, <code className="bg-white px-1 rounded">Pengaturan</code>).
                  </p>
                  <div className="mt-3">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Nama File di Google Drive:
                    </label>
                    <input
                      type="text"
                      value={newSheetTitle}
                      onChange={e => setNewSheetTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleCreateNewSpreadsheet}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition shadow"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {busyAction === 'create'
                      ? 'Membuat & Mengisi Data...'
                      : 'Buat Spreadsheet Baru & Simpan Semua Data'}
                  </span>
                </button>
              </div>

              {/* Option B: Link Existing Spreadsheet */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[10px] font-bold uppercase mb-2">
                    <Link2 className="w-3 h-3" />
                    <span>Sudah Punya File?</span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900">
                    Hubungkan ke Spreadsheet / File AppSheet yang Ada
                  </h4>
                  <p className="text-xs text-slate-600 mt-1">
                    Tempel link Google Sheets atau pilih file yang pernah dibuat aplikasi dari Google Drive Anda.
                  </p>

                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      placeholder="Tempel link https://docs.google.com/spreadsheets/d/..."
                      value={existingUrlInput}
                      onChange={e => setExistingUrlInput(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      disabled={!existingUrlInput.trim() || busyAction !== null}
                      onClick={() => handleLinkExistingSpreadsheet(existingUrlInput)}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shrink-0"
                    >
                      Hubungkan
                    </button>
                  </div>

                  {/* Drive Files List */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1.5">
                      <span className="flex items-center gap-1">
                        <FolderOpen className="w-3.5 h-3.5 text-amber-600" />
                        <span>Spreadsheet Anda di Aplikasi Ini:</span>
                      </span>
                      <button
                        type="button"
                        onClick={refreshDriveFiles}
                        disabled={loadingFiles}
                        className="text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        <RefreshCw className={`w-3 h-3 ${loadingFiles ? 'animate-spin' : ''}`} />
                        <span>Segarkan</span>
                      </button>
                    </div>
                    {driveListNotice ? (
                      <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                        {driveListNotice}
                      </div>
                    ) : driveFiles.length === 0 ? (
                      <div className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-xl p-2.5">
                        {loadingFiles
                          ? 'Mencari file Google Sheets...'
                          : 'Belum ada file Google Sheets yang dibuat lewat aplikasi ini.'}
                      </div>
                    ) : (
                      <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                        {driveFiles.map(file => (
                          <button
                            key={file.id}
                            type="button"
                            onClick={() => handleLinkExistingSpreadsheet(file.id)}
                            className="w-full text-left px-3 py-2 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl text-xs flex items-center justify-between gap-2 transition"
                          >
                            <span className="font-semibold text-slate-800 truncate">{file.name}</span>
                            <span className="text-[10px] font-bold text-blue-600 shrink-0">Pilih</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AppSheet Setup Guide */}
      <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Smartphone className="w-5 h-5 text-indigo-700 shrink-0 mt-0.5" />
          <div className="text-xs text-indigo-950 space-y-1.5 leading-relaxed">
            <h5 className="font-bold text-indigo-900">
              Cara Mengubah Spreadsheet Ini Menjadi Aplikasi Database AppSheet (Tanpa Coding):
            </h5>
            <ol className="list-decimal pl-4 space-y-1 text-indigo-900">
              <li>
                Hubungkan Spreadsheet Anda melalui <strong>Cara 1 (Apps Script)</strong> atau <strong>Cara 2 (Login Google)</strong>, lalu klik <strong>Simpan &amp; Sinkron ke Google Sheets</strong>.
              </li>
              <li>
                Buka file Spreadsheet tersebut di Google Sheets, lalu klik menu <strong>Ekstensi (Extensions) &rarr; AppSheet &rarr; Buat aplikasi (Create an app)</strong>.
              </li>
              <li>
                AppSheet otomatis membaca ke-6 tabel (<code className="bg-white px-1 rounded font-mono">Siswa</code>, <code className="bg-white px-1 rounded font-mono">Soal</code>, <code className="bg-white px-1 rounded font-mono">Progres_Siswa</code>, <code className="bg-white px-1 rounded font-mono">Peringkat_Live</code>, <code className="bg-white px-1 rounded font-mono">Babak</code>) dari Google Drive Anda sebagai aplikasi Android/Web AppSheet.
              </li>
              <li>
                Setiap kali Anda mengedit siswa atau soal lewat AppSheet / Google Sheets, klik <strong>Muat Editan dari Google Sheets / AppSheet</strong> di sini agar langsung tersinkron ke ujian siswa.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
