import React, { useState } from 'react';
import { X, UserPlus, Save, School, Hash, Key, BookOpen } from 'lucide-react';
import { StageId, Student } from '../../types';

interface StudentEditorModalProps {
  student?: Student | null;
  onSave: (s: Partial<Student>) => Promise<void>;
  onClose: () => void;
}

export const StudentEditorModal: React.FC<StudentEditorModalProps> = ({
  student,
  onSave,
  onClose,
}) => {
  const [noPeserta, setNoPeserta] = useState(student?.noPeserta || '');
  const [nama, setNama] = useState(student?.nama || '');
  const [sekolah, setSekolah] = useState(student?.sekolah || 'SMP Negeri 26 Sijunjung');
  const [kelas, setKelas] = useState(student?.kelas || 'VIII A');
  const [pin, setPin] = useState(student?.pin || '1234');
  const [qualifiedStage, setQualifiedStage] = useState<StageId>(student?.qualifiedStage || 'penyisihan');
  const [status, setStatus] = useState<'aktif' | 'lolos' | 'gugur' | 'selesai'>(student?.status || 'aktif');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        id: student?.id,
        noPeserta: noPeserta.trim().toUpperCase(),
        nama: nama.trim(),
        sekolah: sekolah.trim(),
        kelas: kelas.trim(),
        pin: pin.trim(),
        qualifiedStage,
        status,
      });
      onClose();
    } catch (err: any) {
      alert('Gagal menyimpan data siswa: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scaleIn">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-700 to-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <UserPlus className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {student ? 'Sunting Data Siswa' : 'Pendaftaran Siswa Baru'}
              </h2>
              <p className="text-xs text-blue-100">
                Lomba Literasi & Numerasi GELORA 26
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nomor Peserta <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="G26-001"
                  value={noPeserta}
                  onChange={(e) => setNoPeserta(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                PIN Masuk Ujian <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="1234"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nama Lengkap Siswa <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: Aisyah Putri Rahmadani"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Asal Sekolah <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="SMP Negeri 26 Sijunjung"
                value={sekolah}
                onChange={(e) => setSekolah(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Kelas
              </label>
              <input
                type="text"
                placeholder="Contoh: VIII A / VII B / IX"
                value={kelas}
                onChange={(e) => setKelas(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Babak Terdaftar
              </label>
              <select
                value={qualifiedStage}
                onChange={(e) => setQualifiedStage(e.target.value as StageId)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="penyisihan">Babak Penyisihan</option>
                <option value="top30">Babak 30 Besar</option>
                <option value="semifinal">Babak Semifinal</option>
                <option value="final">Babak Final</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Status Peserta
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="aktif">Aktif Mengerjakan</option>
                <option value="lolos">Lolos Babak</option>
                <option value="gugur">Gugur</option>
                <option value="selesai">Selesai Ujian</option>
              </select>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Data Siswa'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
