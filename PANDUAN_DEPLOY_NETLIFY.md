# Panduan Publikasi Aplikasi GELORA 26 ke Siswa melalui Netlify dengan Sinkronisasi Cloud Realtime

Aplikasi **GELORA 26 (Gebyar Literasi & Numerasi SMP Negeri 26 Sijunjung)** kini telah terintegrasi dengan **Firebase Firestore Cloud Realtime Database**.

---

## ⚡ Mengapa Perubahan Panitia & Siswa Sebelumnya Tidak Realtime?

Pada deploy statis standar Netlify, setiap perangkat (laptop panitia maupun HP siswa) hanya membaca dan menulis data ke penyimpanan memori lokal masing-masing (*localStorage*). Akibatnya:
- Saat panitia mengganti babak di laptop, HP siswa tidak terhubung sehingga tidak tahu babak telah diganti.
- Saat siswa mengerjakan soal di HP, nilai hanya tersimpan di HP siswa tersebut dan tidak terkirim ke laptop panitia.

### 💡 Solusi yang Sudah Diterapkan:
Kini aplikasi sudah dilengkapi **Firebase Cloud Firestore Realtime Sync (`onSnapshot`)**:
1. **Aktivasi Babak Realtime:** Saat panitia mengaktifkan babak (misal: Babak 30 Besar) di laptop, Firestore mengirim sinyal instan ke seluruh HP siswa dalam ~100 milidetik. Layar HP siswa langsung otomatis berganti ke babak tersebut tanpa siswa harus me-refresh!
2. **Nilai & Peringkat Realtime:** Setiap kali siswa mengklik jawaban atau submit soal di HP, datanya langsung terkirim ke Firestore dan papan skor / proyektor laptop panitia langsung bergeser peringkatnya secara *live* detik itu juga!
3. **Konfigurasi Otomatis:** File konfigurasi Firebase sudah tertanam langsung di dalam kode build, sehingga saat di-deploy ke Netlify (misalnya di URL Anda: `https://jovial-strudel-cc47b0.netlify.app/`), fitur realtime ini langsung aktif 100%!

---

## 🚀 Cara Memperbarui Deploy di Netlify Anda (`https://jovial-strudel-cc47b0.netlify.app/`)

### Cara A: Jika Menggunakan GitHub (Paling Mudah)
1. Push pembaruan kode terbaru ini ke repositori GitHub Anda.
2. Netlify akan otomatis mendeteksi commit baru dan langsung menjalankan build ulang (`npm run build`).
3. Dalam waktu 1-2 menit, situs Anda di `https://jovial-strudel-cc47b0.netlify.app/` akan otomatis terbarui dengan sinkronisasi realtime aktif!

### Cara B: Jika Menggunakan Netlify Drop (Manual)
1. Buka terminal di folder proyek hasil unduhan terbaru di komputer Anda.
2. Jalankan perintah:
   ```bash
   npm install
   npm run build
   ```
3. Buka dashboard Netlify Anda pada situs **jovial-strudel-cc47b0** di [app.netlify.com](https://app.netlify.com).
4. Masuk ke tab **Deploys**.
5. Tarik dan lepas (Drag & Drop) **folder `dist` terbaru** ke area kotak update deploy di halaman tersebut.
6. Tunggu beberapa detik, dan situs Anda langsung aktif dengan sinkronisasi realtime!

---

## 📱 Uji Coba Sinkronisasi Realtime Panitia & Siswa

Setelah deploy diperbarui:
1. **Di Laptop Panitia:**
   - Buka `https://jovial-strudel-cc47b0.netlify.app/`.
   - Login sebagai **Panitia Lomba** (Password: `admin` atau `gelora26`).
   - Buka menu **4. Live Monitor & Peringkat** atau klik **Proyektor Papan Skor**.
2. **Di HP Siswa (atau buka browser lain / tab samaran):**
   - Buka `https://jovial-strudel-cc47b0.netlify.app/`.
   - Login sebagai **Peserta Siswa** dengan No. Peserta (misal: `G26-001`, PIN: `1234`).
   - Jawab salah satu soal lalu klik Kirim Jawaban.
3. **Hasil:**
   - Nilai siswa langsung bertambah di layar laptop panitia secara *live* tanpa refresh!
   - Saat panitia mengganti babak lomba, tampilan di HP siswa langsung otomatis berpindah babak seketika!
