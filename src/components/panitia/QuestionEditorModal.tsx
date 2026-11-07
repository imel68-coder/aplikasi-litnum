import React, { useState } from 'react';
import { X, Plus, Trash2, Image, CheckSquare, ListFilter, HelpCircle, CheckCircle, Save, Eye } from 'lucide-react';
import { MatchingPair, Question, QuestionType, StageId, TrueFalseStatement } from '../../types';

interface QuestionEditorModalProps {
  question?: Question | null;
  defaultStageId: StageId;
  onSave: (q: Partial<Question>) => Promise<void>;
  onClose: () => void;
}

export const QuestionEditorModal: React.FC<QuestionEditorModalProps> = ({
  question,
  defaultStageId,
  onSave,
  onClose,
}) => {
  const [stageId, setStageId] = useState<StageId>(question?.stageId || defaultStageId);
  const [order, setOrder] = useState<number>(question?.order || 1);
  const [type, setType] = useState<QuestionType>(question?.type || 'pg_single');
  const [category, setCategory] = useState<'literasi' | 'numerasi'>(question?.category || 'literasi');
  const [points, setPoints] = useState<number>(question?.points || 10);
  const [stimulusText, setStimulusText] = useState<string>(question?.stimulusText || '');
  const [imageUrl, setImageUrl] = useState<string>(question?.imageUrl || '');
  const [questionPrompt, setQuestionPrompt] = useState<string>(question?.questionPrompt || '');

  // For PG Single & Complex
  const [options, setOptions] = useState<{ id: string; text: string }[]>(
    question?.options || [
      { id: 'opt_1', text: 'Pilihan A' },
      { id: 'opt_2', text: 'Pilihan B' },
      { id: 'opt_3', text: 'Pilihan C' },
      { id: 'opt_4', text: 'Pilihan D' },
    ]
  );
  const [correctOptionIds, setCorrectOptionIds] = useState<string[]>(
    question?.correctOptionIds || ['opt_1']
  );

  // For True / False
  const [trueFalseStatements, setTrueFalseStatements] = useState<TrueFalseStatement[]>(
    question?.trueFalseStatements || [
      { id: 'tf_1', statement: 'Pernyataan pertama tentang bacaan.', correctAnswer: true },
      { id: 'tf_2', statement: 'Pernyataan kedua tentang analisis data.', correctAnswer: false },
      { id: 'tf_3', statement: 'Pernyataan ketiga tentang kesimpulan.', correctAnswer: true },
    ]
  );

  // For Matching
  const [matchingPairs, setMatchingPairs] = useState<MatchingPair[]>(
    question?.matchingPairs || [
      { id: 'm_1', premise: 'Konsep A (Kiri)', response: 'Pasangan A (Kanan)' },
      { id: 'm_2', premise: 'Konsep B (Kiri)', response: 'Pasangan B (Kanan)' },
      { id: 'm_3', premise: 'Konsep C (Kiri)', response: 'Pasangan C (Kanan)' },
    ]
  );

  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Partial<Question> = {
        id: question?.id,
        stageId,
        order: Number(order),
        type,
        category,
        points: Number(points),
        stimulusText,
        imageUrl: imageUrl.trim() || undefined,
        questionPrompt,
      };

      if (type === 'pg_single' || type === 'pg_complex') {
        payload.options = options;
        payload.correctOptionIds = correctOptionIds;
      } else if (type === 'true_false') {
        payload.trueFalseStatements = trueFalseStatements;
      } else if (type === 'matching') {
        payload.matchingPairs = matchingPairs;
      }

      await onSave(payload);
      onClose();
    } catch (err: any) {
      alert('Gagal menyimpan soal: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const sampleImages = [
    { label: 'Geopark Silokek Sijunjung', url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80' },
    { label: 'Grafik & Buku Literasi', url: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=800&q=80' },
    { label: 'Laboratorium & Sains', url: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=800&q=80' },
    { label: 'Matematika & Geometri', url: 'https://images.unsplash.com/photo-1596495578065-6e0763fa1178?auto=format&fit=crop&w=800&q=80' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col my-auto overflow-hidden animate-scaleIn">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-700 to-indigo-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <CheckSquare className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {question ? 'Sunting Soal Lomba' : 'Tambah Soal Baru'}
              </h2>
              <p className="text-xs text-blue-100">
                Pengaturan stimulus, gambar, tipe soal, dan pembobotan skor
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewMode(!previewMode)}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Eye className="w-4 h-4" />
              <span>{previewMode ? 'Mode Edit' : 'Pratinjau'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {previewMode ? (
            /* PREVIEW SCREEN */
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-100 px-3 py-1 rounded-full">
                  Nomor {order} • {category.toUpperCase()} • {points} POIN
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  Tipe: {type === 'pg_single' ? 'Pilihan Ganda Biasa' : type === 'pg_complex' ? 'PG Kompleks' : type === 'true_false' ? 'Benar / Salah' : 'Menjodohkan'}
                </span>
              </div>

              {stimulusText && (
                <div className="p-4 bg-white rounded-xl border border-slate-200">
                  <div className="text-xs font-bold text-slate-500 mb-1">STIMULUS BACAAN:</div>
                  <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed">{stimulusText}</p>
                </div>
              )}

              {imageUrl && (
                <div className="rounded-xl overflow-hidden max-h-60 bg-slate-100 border">
                  <img src={imageUrl} alt="Gambar Soal" className="w-full h-full object-contain mx-auto" />
                </div>
              )}

              <div className="font-bold text-base text-slate-900">
                {questionPrompt || 'Pertanyaan belum diisi'}
              </div>

              {/* Preview Answers */}
              {type === 'pg_single' && (
                <div className="space-y-2">
                  {options.map((opt, i) => (
                    <div
                      key={opt.id}
                      className={`p-3 rounded-xl border text-sm flex items-center gap-3 ${
                        correctOptionIds.includes(opt.id)
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span>{opt.text}</span>
                      {correctOptionIds.includes(opt.id) && (
                        <span className="ml-auto text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full">Kunci Jawaban</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {type === 'pg_complex' && (
                <div className="space-y-2">
                  <p className="text-xs text-amber-700 font-semibold bg-amber-50 p-2 rounded-lg">
                    ℹ️ Siswa memilih 2 atau 3 jawaban yang tepat
                  </p>
                  {options.map((opt) => (
                    <div
                      key={opt.id}
                      className={`p-3 rounded-xl border text-sm flex items-center gap-3 ${
                        correctOptionIds.includes(opt.id)
                          ? 'bg-blue-50 border-blue-400 text-blue-900 font-bold'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <input type="checkbox" checked={correctOptionIds.includes(opt.id)} readOnly className="w-4 h-4 text-blue-600 rounded" />
                      <span>{opt.text}</span>
                      {correctOptionIds.includes(opt.id) && (
                        <span className="ml-auto text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Kunci Jawaban</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {type === 'true_false' && (
                <div className="space-y-2">
                  {trueFalseStatements.map((st, idx) => (
                    <div key={st.id} className="p-3 bg-white rounded-xl border flex items-center justify-between text-sm">
                      <span className="flex-1 mr-3">{idx + 1}. {st.statement}</span>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        st.correctAnswer ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}>
                        Kunci: {st.correctAnswer ? 'BENAR' : 'SALAH'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {type === 'matching' && (
                <div className="space-y-2">
                  {matchingPairs.map((p) => (
                    <div key={p.id} className="grid grid-cols-2 gap-3 p-2 bg-white rounded-xl border text-xs sm:text-sm">
                      <div className="p-2 bg-slate-50 rounded-lg font-medium text-slate-800">{p.premise}</div>
                      <div className="p-2 bg-blue-50 text-blue-900 rounded-lg font-bold border border-blue-200">➔ {p.response}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* FORM EDITOR */
            <form id="question-form" onSubmit={handleSave} className="space-y-5">
              
              {/* Row 1: Babak, Urutan, Kategori, Skor */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Babak Lomba</label>
                  <select
                    value={stageId}
                    onChange={(e) => setStageId(e.target.value as StageId)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="penyisihan">Babak Penyisihan</option>
                    <option value="top30">Babak 30 Besar</option>
                    <option value="semifinal">Babak Semifinal</option>
                    <option value="final">Babak Grand Final</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Nomor Urut Soal</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={order}
                    onChange={(e) => setOrder(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Kategori</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="literasi">Literasi Membaca</option>
                    <option value="numerasi">Numerasi Matematika</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Skor Soal (Poin)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={points}
                    onChange={(e) => setPoints(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-amber-300 text-amber-700 font-bold rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Row 2: Tipe Soal (4 Jenis Sesuai Permintaan) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Tipe Soal (Pilih salah satu dari 4 model soal):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setType('pg_single')}
                    className={`p-3 rounded-2xl border text-left transition ${
                      type === 'pg_single'
                        ? 'bg-blue-50 border-blue-600 text-blue-900 ring-2 ring-blue-500/30'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-xs">1. Pilihan Ganda</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Satu jawaban benar (A, B, C, D)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setType('pg_complex')}
                    className={`p-3 rounded-2xl border text-left transition ${
                      type === 'pg_complex'
                        ? 'bg-indigo-50 border-indigo-600 text-indigo-900 ring-2 ring-indigo-500/30'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-xs">2. PG Kompleks</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">2 atau 3 jawaban benar (Checklist)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setType('true_false')}
                    className={`p-3 rounded-2xl border text-left transition ${
                      type === 'true_false'
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-900 ring-2 ring-emerald-500/30'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-xs">3. Benar atau Salah</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Tabel butir pernyataan Benar/Salah</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setType('matching')}
                    className={`p-3 rounded-2xl border text-left transition ${
                      type === 'matching'
                        ? 'bg-amber-50 border-amber-600 text-amber-900 ring-2 ring-amber-500/30'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-xs">4. Menjodohkan</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Pasangan premis & respon yang tepat</div>
                  </button>
                </div>
              </div>

              {/* Row 3: Stimulus Teks Panjang (Requirement 5) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Stimulus Teks / Narasi Panjang (Cerita, Artikel, Data Kontekstual)
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {stimulusText.length} karakter
                  </span>
                </div>
                <textarea
                  rows={4}
                  placeholder="Masukkan wacana atau stimulus teks yang panjang untuk dianalisis oleh peserta..."
                  value={stimulusText}
                  onChange={(e) => setStimulusText(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm leading-relaxed text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                />
              </div>

              {/* Row 4: Gambar Soal (Requirement 5) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Gambar Soal (Opsional - URL atau pilih contoh tema)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="https://... URL gambar infografis, grafik, atau foto stimulus"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-semibold"
                    >
                      Hapus
                    </button>
                  )}
                </div>
                {/* Sample Image presets */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[11px] text-slate-400 py-1">Pilihan Cepat Gambar:</span>
                  {sampleImages.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setImageUrl(s.url)}
                      className="text-[11px] px-2.5 py-1 bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 rounded-lg transition"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {imageUrl && (
                  <div className="mt-2 h-28 w-44 rounded-xl overflow-hidden border bg-slate-100">
                    <img src={imageUrl} alt="Thumbnail Soal" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              {/* Row 5: Pernyataan Soal / Pertanyaan Pokok (Requirement 5) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Pertanyaan Pokok / Pernyataan Soal <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Berdasarkan wacana di atas, hitunglah rasio debit air atau pilihlah pernyataan yang benar!"
                  value={questionPrompt}
                  onChange={(e) => setQuestionPrompt(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                />
              </div>

              {/* Dynamic Answer Fields based on Type */}
              <div className="pt-2 border-t border-slate-200">
                {/* 1. PG TUNGGAL & 2. PG KOMPLEKS */}
                {(type === 'pg_single' || type === 'pg_complex') && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">
                        {type === 'pg_single'
                          ? 'Pilihan Jawaban (Klik radio button untuk memilih 1 kunci jawaban benar):'
                          : 'Pilihan Jawaban Kompleks (Centang 2 atau 3 kunci jawaban yang benar):'}
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const newId = `opt_${Date.now()}`;
                          setOptions([...options, { id: newId, text: `Pilihan Baru` }]);
                        }}
                        className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Tambah Pilihan
                      </button>
                    </div>

                    <div className="space-y-2">
                      {options.map((opt, idx) => {
                        const isChecked = correctOptionIds.includes(opt.id);
                        return (
                          <div key={opt.id} className="flex items-center gap-2">
                            {type === 'pg_single' ? (
                              <input
                                type="radio"
                                name="single_correct"
                                checked={isChecked}
                                onChange={() => setCorrectOptionIds([opt.id])}
                                className="w-4 h-4 text-blue-600 cursor-pointer"
                              />
                            ) : (
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setCorrectOptionIds([...correctOptionIds, opt.id]);
                                  } else {
                                    setCorrectOptionIds(correctOptionIds.filter((id) => id !== opt.id));
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                              />
                            )}

                            <span className="w-6 text-center font-bold text-xs text-slate-500">
                              {String.fromCharCode(65 + idx)}.
                            </span>

                            <input
                              type="text"
                              value={opt.text}
                              onChange={(e) => {
                                const newOpts = [...options];
                                newOpts[idx].text = e.target.value;
                                setOptions(newOpts);
                              }}
                              className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none focus:bg-white"
                            />

                            {options.length > 2 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOptions(options.filter((o) => o.id !== opt.id));
                                  setCorrectOptionIds(correctOptionIds.filter((id) => id !== opt.id));
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-500"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. BENAR / SALAH */}
                {type === 'true_false' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">
                        Daftar Butir Pernyataan & Kunci Nilai Kebenaran:
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const newId = `tf_${Date.now()}`;
                          setTrueFalseStatements([
                            ...trueFalseStatements,
                            { id: newId, statement: 'Pernyataan baru...', correctAnswer: true },
                          ]);
                        }}
                        className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Tambah Pernyataan
                      </button>
                    </div>

                    <div className="space-y-2">
                      {trueFalseStatements.map((st, idx) => (
                        <div key={st.id} className="p-3 bg-slate-50 rounded-xl border flex items-center gap-3">
                          <span className="font-bold text-xs text-slate-500 w-4">{idx + 1}.</span>
                          <input
                            type="text"
                            value={st.statement}
                            onChange={(e) => {
                              const updated = [...trueFalseStatements];
                              updated[idx].statement = e.target.value;
                              setTrueFalseStatements(updated);
                            }}
                            className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm outline-none"
                          />
                          <div className="flex items-center bg-white p-1 rounded-lg border">
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...trueFalseStatements];
                                updated[idx].correctAnswer = true;
                                setTrueFalseStatements(updated);
                              }}
                              className={`px-3 py-1 rounded text-xs font-bold transition ${
                                st.correctAnswer
                                  ? 'bg-emerald-600 text-white'
                                  : 'text-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              BENAR
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...trueFalseStatements];
                                updated[idx].correctAnswer = false;
                                setTrueFalseStatements(updated);
                              }}
                              className={`px-3 py-1 rounded text-xs font-bold transition ${
                                !st.correctAnswer
                                  ? 'bg-red-600 text-white'
                                  : 'text-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              SALAH
                            </button>
                          </div>
                          {trueFalseStatements.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setTrueFalseStatements(trueFalseStatements.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. MENJODOHKAN */}
                {type === 'matching' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">
                        Pasangan Menjodohkan (Premis Kiri ➔ Respon/Jawaban Kanan):
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const newId = `m_${Date.now()}`;
                          setMatchingPairs([
                            ...matchingPairs,
                            { id: newId, premise: 'Premis baru', response: 'Respon tepat' },
                          ]);
                        }}
                        className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Tambah Baris Pasangan
                      </button>
                    </div>

                    <div className="space-y-2">
                      {matchingPairs.map((p, idx) => (
                        <div key={p.id} className="p-3 bg-slate-50 rounded-xl border flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-500 w-4">{idx + 1}.</span>
                          <input
                            type="text"
                            placeholder="Premis / Konsep Kiri"
                            value={p.premise}
                            onChange={(e) => {
                              const updated = [...matchingPairs];
                              updated[idx].premise = e.target.value;
                              setMatchingPairs(updated);
                            }}
                            className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm"
                          />
                          <span className="text-slate-400 font-bold">➔</span>
                          <input
                            type="text"
                            placeholder="Jawaban Kanan"
                            value={p.response}
                            onChange={(e) => {
                              const updated = [...matchingPairs];
                              updated[idx].response = e.target.value;
                              setMatchingPairs(updated);
                            }}
                            className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm"
                          />
                          {matchingPairs.length > 2 && (
                            <button
                              type="button"
                              onClick={() => setMatchingPairs(matchingPairs.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </form>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition"
          >
            Batal
          </button>
          <button
            type="submit"
            form="question-form"
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-2 text-sm transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Soal'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
