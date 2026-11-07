import { AppDatabaseState, Question, Student } from './types';

export const initialStudents: Student[] = [
  {
    id: 'std_01',
    noPeserta: 'G26-001',
    nama: 'Aisyah Putri Rahmadani',
    sekolah: 'SMP Negeri 26 Sijunjung',
    kelas: 'VIII A',
    pin: '1234',
    qualifiedStage: 'penyisihan',
    status: 'aktif',
  },
  {
    id: 'std_02',
    noPeserta: 'G26-002',
    nama: 'Muhammad Fadil Pratama',
    sekolah: 'SMP Negeri 26 Sijunjung',
    kelas: 'VIII B',
    pin: '1234',
    qualifiedStage: 'penyisihan',
    status: 'aktif',
  },
  {
    id: 'std_03',
    noPeserta: 'G26-003',
    nama: 'Nabila Zahra Syahril',
    sekolah: 'SMP Negeri 1 Sijunjung',
    kelas: 'IX A',
    pin: '1234',
    qualifiedStage: 'penyisihan',
    status: 'aktif',
  },
  {
    id: 'std_04',
    noPeserta: 'G26-004',
    nama: 'Rizky Alamsyah',
    sekolah: 'SMP Negeri 2 Sijunjung',
    kelas: 'VIII C',
    pin: '1234',
    qualifiedStage: 'penyisihan',
    status: 'aktif',
  },
  {
    id: 'std_05',
    noPeserta: 'G26-005',
    nama: 'Dina Lestari',
    sekolah: 'MTsN 1 Sijunjung',
    kelas: 'VIII B',
    pin: '1234',
    qualifiedStage: 'penyisihan',
    status: 'aktif',
  },
  {
    id: 'std_06',
    noPeserta: 'G26-006',
    nama: 'Farhan Ilham Saputra',
    sekolah: 'SMP Negeri 26 Sijunjung',
    kelas: 'VII A',
    pin: '1234',
    qualifiedStage: 'penyisihan',
    status: 'aktif',
  },
  {
    id: 'std_07',
    noPeserta: 'G26-007',
    nama: 'Siti Nurhaliza',
    sekolah: 'SMP Negeri 7 Sijunjung',
    kelas: 'IX B',
    pin: '1234',
    qualifiedStage: 'penyisihan',
    status: 'aktif',
  },
  {
    id: 'std_08',
    noPeserta: 'G26-008',
    nama: 'Rafi Kurniawan',
    sekolah: 'SMP Negeri 26 Sijunjung',
    kelas: 'VIII A',
    pin: '1234',
    qualifiedStage: 'penyisihan',
    status: 'aktif',
  },
];

export const initialQuestions: Question[] = [
  // --- BABAK PENYISIHAN ---
  {
    id: 'q_peny_01',
    stageId: 'penyisihan',
    order: 1,
    type: 'pg_single',
    category: 'literasi',
    points: 10,
    stimulusText: `Geopark Silokek di Kabupaten Sijunjung, Sumatera Barat, merupakan warisan geologi dunia yang memukau. Di kawasan ini mengalir Sungai Batang Kuantan yang diapit tebing-tebing karst batu gamping berusia lebih dari 300 juta tahun. Selain kekayaan alam, Silokek menyimpan keanekaragaman flora fauna serta jejak sejarah lokomotif uap peninggalan masa pendudukan Jepang.

Pemerintah Daerah Sijunjung bersama SMPN 26 Sijunjung gencar mengadakan gerakan cinta lingkungan dan literasi alam untuk mengedukasi generasi muda agar merawat kelestarian ekosistem karst dan sejarah lokal dari ancaman kerusakan.`,
    imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
    questionPrompt: 'Berdasarkan teks di atas, apakah tujuan utama diadakannya kegiatan edukasi lingkungan dan literasi alam bagi para pelajar di Sijunjung?',
    options: [
      { id: 'opt_a', text: 'Menjadikan Silokek sebagai kawasan tambang batu gamping komersial.' },
      { id: 'opt_b', text: 'Mengedukasi generasi muda untuk merawat kelestarian ekosistem karst dan peninggalan sejarah lokal.' },
      { id: 'opt_c', text: 'Menggantikan jalur kereta api tua dengan jalan tol modern.' },
      { id: 'opt_d', text: 'Menghentikan arus kunjungan wisatawan luar daerah ke kawasan Sungai Batang Kuantan.' }
    ],
    correctOptionIds: ['opt_b']
  },
  {
    id: 'q_peny_02',
    stageId: 'penyisihan',
    order: 2,
    type: 'pg_complex',
    category: 'numerasi',
    points: 15,
    stimulusText: `Sebuah kelompok relawan perpustakaan keliling SMPN 26 Sijunjung mengumpulkan buku bacaan untuk disalurkan ke 3 desa binaan. 
Data penerimaan buku selama 3 minggu tercatat sebagai berikut:
- Minggu 1: 120 buku cerita anak dan 80 buku ensiklopedia sains.
- Minggu 2: 150 buku cerita anak dan 110 buku ensiklopedia sains.
- Minggu 3: 130 buku cerita anak dan 110 buku ensiklopedia sains.

Total buku yang terkumpul akan dibagikan secara merata ke 3 pos bacaan desa tanpa sisa.`,
    imageUrl: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=800&q=80',
    questionPrompt: 'Berdasarkan data numerasi di atas, pilihlah 2 atau 3 pernyataan yang BENAR! (Pilihan Ganda Kompleks)',
    options: [
      { id: 'c_opt_1', text: 'Total seluruh buku yang terkumpul selama 3 minggu adalah 700 buku.' },
      { id: 'c_opt_2', text: 'Total buku cerita anak yang terkumpul adalah 400 buku.' },
      { id: 'c_opt_3', text: 'Masing-masing dari 3 pos bacaan desa akan menerima tepat 233 buku jika dibagi rata.' },
      { id: 'c_opt_4', text: 'Jumlah buku ensiklopedia sains yang terkumpul adalah 300 buku.' }
    ],
    correctOptionIds: ['c_opt_1', 'c_opt_2', 'c_opt_4']
  },
  {
    id: 'q_peny_03',
    stageId: 'penyisihan',
    order: 3,
    type: 'true_false',
    category: 'literasi',
    points: 15,
    stimulusText: `Pepatah Minangkabau berbunyi: "Panakiak pisau sirawik, ambiak galah batang lintabuang, silodang ambiak ka nyiru. Nan kuriak kundi, nan merah sago, nan baik budi, nan indah baso."
Makna filosofis falsafah ini mengajarkan bahwa dalam pergaulan masyarakat Minang, budi pekerti yang luhur dan tutur kata yang santun ('baso') menduduki tempat paling terhormat, jauh melampaui kekayaan fisik semata. Nilai ini menjadi fondasi karakter siswa di Kabupaten Sijunjung untuk mengutamakan adab dalam menuntut ilmu.`,
    questionPrompt: 'Tentukan kebenaran dari masing-masing pernyataan berikut berdasarkan nilai falsafah pepatah Minang di atas!',
    trueFalseStatements: [
      {
        id: 'tf_1',
        statement: 'Pepatah tersebut menekankan bahwa tutur kata yang santun dan budi pekerti luhur lebih mulia daripada sekadar penampilan fisik.',
        correctAnswer: true
      },
      {
        id: 'tf_2',
        statement: 'Masyarakat Minangkabau menempatkan kekayaan materi di atas nilai adab dan kesantunan berbicara.',
        correctAnswer: false
      },
      {
        id: 'tf_3',
        statement: 'Falsafah "nan indah baso" menjadi pilar penting pembentukan karakter sopan santun bagi generasi muda.',
        correctAnswer: true
      }
    ]
  },
  {
    id: 'q_peny_04',
    stageId: 'penyisihan',
    order: 4,
    type: 'matching',
    category: 'numerasi',
    points: 20,
    stimulusText: `Dalam festival kuliner khas Sijunjung di acara GELORA 26, kantin sekolah menyajikan olahan tradisional dengan daftar takaran bahan dan konversi satuan untuk membuat 10 porsi Lapek Bugih dan Galamai:`,
    imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
    questionPrompt: 'Jodohkanlah nilai besaran takaran pada kolom kiri dengan padanan satuannya yang tepat pada kolom kanan!',
    matchingPairs: [
      { id: 'm_1', premise: 'Tepung ketan putih 1,5 kg', response: '1.500 gram' },
      { id: 'm_2', premise: 'Santan kelapa murni 750 ml', response: '0,75 liter' },
      { id: 'm_3', premise: 'Gula aren cair 2,5 liter', response: '2.500 mililiter' },
      { id: 'm_4', premise: 'Durian fermentasi (tempoyak) 250 gram', response: '0,25 kilogram' }
    ]
  },

  // --- BABAK 30 BESAR ---
  {
    id: 'q_top30_01',
    stageId: 'top30',
    order: 1,
    type: 'pg_single',
    category: 'numerasi',
    points: 15,
    stimulusText: `Di laboratorium IPA SMPN 26 Sijunjung, siswa mengukur laju alir air dari miniatur bendungan Batang Ombilin. Wadah penampung berkapasitas 60 liter terisi penuh dalam waktu 2,5 menit.`,
    questionPrompt: 'Berapakah debit aliran air miniatur bendungan tersebut dalam satuan liter per detik?',
    options: [
      { id: 'opt_d1', text: '0,4 liter/detik' },
      { id: 'opt_d2', text: '0,25 liter/detik' },
      { id: 'opt_d3', text: '24 liter/detik' },
      { id: 'opt_d4', text: '1,5 liter/detik' }
    ],
    correctOptionIds: ['opt_d1'] // 60 liter / 150 detik = 0.4 liter/detik
  },
  {
    id: 'q_top30_02',
    stageId: 'top30',
    order: 2,
    type: 'pg_complex',
    category: 'literasi',
    points: 20,
    stimulusText: `Artikel Ilmiah Remaja: "Pemanfaatan Energi Surya di Sekolah Adiwiyata".
Penggunaan panel surya fotovoltaik berdaya 1.000 Watt peak di atap gedung SMPN 26 Sijunjung terbukti mampu menekan tagihan listrik bulanan hingga 35%. Selain penghematan biaya energi, panel surya mengajarkan siswa mengenai konsep energi terbarukan, pengurangan jejak karbon (carbon footprint), dan tanggung jawab mitigasi perubahan iklim global. Namun, perawatan berkala pembersihan debu permukaan kaca panel tetap diperlukan agar efisiensi konversi sinar matahari tidak menurun drastis.`,
    imageUrl: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=800&q=80',
    questionPrompt: 'Manakah 2 pernyataan berikut yang paling tepat menggambarkan dampak positif dan tantangan panel surya berdasarkan artikel?',
    options: [
      { id: 'sol_1', text: 'Panel surya berkontribusi menurunkan emisi karbon sekaligus menekan pengeluaran biaya listrik sekolah.' },
      { id: 'sol_2', text: 'Panel surya tidak memerlukan pemeliharaan sama sekali meskipun tertutup debu tebal.' },
      { id: 'sol_3', text: 'Debu yang menumpuk di atas kaca panel berpotensi menurunkan efisiensi konversi daya energi.' },
      { id: 'sol_4', text: 'Energi surya tidak dapat diterapkan untuk kawasan tropis seperti Sumatera Barat.' }
    ],
    correctOptionIds: ['sol_1', 'sol_3']
  },
  {
    id: 'q_top30_03',
    stageId: 'top30',
    order: 3,
    type: 'matching',
    category: 'literasi',
    points: 20,
    stimulusText: `Pahami unsur-unsur pembangun karya sastra fabel dan cerpen yang sering digunakan dalam tes Literasi Membaca AKM:`,
    questionPrompt: 'Jodohkan istilah unsur intrinsik di kolom kiri dengan definisinya yang tepat di kolom kanan!',
    matchingPairs: [
      { id: 'm_elem1', premise: 'Amanat', response: 'Pesan moral atau nasihat yang ingin disampaikan pengarang kepada pembaca' },
      { id: 'm_elem2', premise: 'Latar (Setting)', response: 'Keterangan mengenai waktu, suasana, dan tempat terjadinya peristiwa' },
      { id: 'm_elem3', premise: 'Alur (Plot)', response: 'Rangkaian jalinan peristiwa sebab-akibat dalam jalannya cerita' },
      { id: 'm_elem4', premise: 'Sudut Pandang', response: 'Cara atau posisi pengarang dalam membawakan dan memandang cerita' }
    ]
  },

  // --- BABAK SEMIFINAL ---
  {
    id: 'q_semi_01',
    stageId: 'semifinal',
    order: 1,
    type: 'pg_single',
    category: 'numerasi',
    points: 20,
    stimulusText: `Dalam denah arsitektur aula serbaguna SMP Negeri 26 Sijunjung dengan skala 1 : 200, panjang aula pada denah adalah 15 cm dan lebarnya 8 cm. Seluruh lantai aula nantinya akan dipasangi keramik persegi berukuran 40 cm x 40 cm tanpa ada celah terbuang.`,
    questionPrompt: 'Berapa banyak buah keramik yang dibutuhkan untuk menutup seluruh luas lantai aula tersebut?',
    options: [
      { id: 'k_1', text: '3.000 buah keramik' },
      { id: 'k_2', text: '2.400 buah keramik' },
      { id: 'k_3', text: '3.600 buah keramik' },
      { id: 'k_4', text: '4.800 buah keramik' }
    ],
    correctOptionIds: ['k_1'] // Panjang riil = 15*200 = 3000 cm = 30 m; Lebar riil = 8*200 = 1600 cm = 16 m; Luas = 480 m2 = 4.800.000 cm2. Luas keramik = 40*40 = 1600 cm2. 4.800.000 / 1600 = 3.000 keramik.
  },
  {
    id: 'q_semi_02',
    stageId: 'semifinal',
    order: 2,
    type: 'true_false',
    category: 'numerasi',
    points: 20,
    stimulusText: `Toko Koperasi Siswa Mandiri memberikan paket promo awal semester:
- Paket A: Diskon tunggal sebesar 30% untuk buku tulis.
- Paket B: Diskon ganda (20% + 10%) untuk jenis buku yang sama.
Harga label buku tulis sebelum diskon adalah Rp 50.000 per pak.`,
    questionPrompt: 'Ujilah kebenaran pernyataan logika perbandingan matematika diskon berikut!',
    trueFalseStatements: [
      {
        id: 'disc_1',
        statement: 'Harga akhir Paket A setelah diskon 30% adalah Rp 35.000 per pak.',
        correctAnswer: true
      },
      {
        id: 'disc_2',
        statement: 'Paket B (diskon 20% + 10%) memberikan total potongan harga yang persis sama dengan diskon langsung 30%.',
        correctAnswer: false
      },
      {
        id: 'disc_3',
        statement: 'Pembeli akan membayar lebih murah jika memilih Paket A daripada Paket B.',
        correctAnswer: true
      }
    ]
  },

  // --- BABAK FINAL ---
  {
    id: 'q_fin_01',
    stageId: 'final',
    order: 1,
    type: 'pg_complex',
    category: 'literasi',
    points: 25,
    stimulusText: `Kutipan Orasi Pendidikan Ki Hadjar Dewantara:
"Pendidikan dan pengajaran dalam Republik Indonesia harus bersendi kebudayaan dan kemasyarakatan bangsa Indonesia, menuju ke arah kebahagiaan batin serta keselamatan hidup lahir. Anak-anak hidup dan tumbuh sesuai kodratnya sendiri. Pendidik hanya dapat merawat dan menuntun tumbuhnya kodrat itu. Ing ngarsa sung tulada, ing madya mangun karsa, tut wuri handayani."

Dalam ajang babak Grand Final GELORA 26, peserta diuji kemampuannya menganalisis esensi literasi kebangsaan dan relevansinya di era digital modern.`,
    imageUrl: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80',
    questionPrompt: 'Berdasarkan teks filosofis di atas, pilihlah 2 prinsip pendidikan yang selaras dengan pesan Ki Hadjar Dewantara!',
    options: [
      { id: 'f_opt1', text: 'Pendidik berperan sebagai penuntun yang memfasilitasi potensi unik setiap anak sesuai kodrat alam dan zaman.' },
      { id: 'f_opt2', text: 'Pendidikan harus memaksakan semua siswa memiliki kemampuan dan minat yang seragam tanpa terkecuali.' },
      { id: 'f_opt3', text: 'Keteladanan di depan, membangkitkan semangat di tengah, dan dorongan motivasi dari belakang adalah pilar kepemimpinan pendidik.' },
      { id: 'f_opt4', text: 'Kebudayaan lokal harus dihilangkan seluruhnya demi mengadopsi budaya asing.' }
    ],
    correctOptionIds: ['f_opt1', 'f_opt3']
  },
  {
    id: 'q_fin_02',
    stageId: 'final',
    order: 2,
    type: 'matching',
    category: 'numerasi',
    points: 30,
    stimulusText: `Tantangan Final Numerasi Cepat: Konsep Teorema Pythagoras dan Penerapan Nyata.
Tiga tiang bendera di lapangan upacara SMPN 26 Sijunjung dihubungkan kawat penyangga dari puncak tiang ke pasak tanah:`,
    questionPrompt: 'Pasangkanlah tinggi tiang (a) dan jarak pasak ke dasar tiang (b) dengan panjang kawat sisi miring (c) yang tepat!',
    matchingPairs: [
      { id: 'py_1', premise: 'Tinggi tiang 6 m, jarak pasak 8 m', response: 'Panjang kawat 10 meter' },
      { id: 'py_2', premise: 'Tinggi tiang 5 m, jarak pasak 12 m', response: 'Panjang kawat 13 meter' },
      { id: 'py_3', premise: 'Tinggi tiang 9 m, jarak pasak 12 m', response: 'Panjang kawat 15 meter' },
      { id: 'py_4', premise: 'Tinggi tiang 8 m, jarak pasak 15 m', response: 'Panjang kawat 17 meter' }
    ]
  }
];

export const initialStages: Record<string, any> = {
  penyisihan: {
    id: 'penyisihan',
    name: 'Babak Penyisihan',
    subtitle: 'Tahap Seleksi Seluruh Peserta',
    description: 'Seluruh peserta lomba mengerjakan paket soal literasi dan numerasi untuk memperebutkan tiket Top 30 Besar.',
    isActive: true,
    maxDurationMinutes: 45,
    passingQuota: 30
  },
  top30: {
    id: 'top30',
    name: 'Babak 30 Besar',
    subtitle: 'Tahap 30 Peserta Terbaik',
    description: 'Peserta yang lolos peringkat 1 s.d. 30 bersaing ketat untuk memperebutkan 10 posisi di Semifinal.',
    isActive: false,
    maxDurationMinutes: 30,
    passingQuota: 10
  },
  semifinal: {
    id: 'semifinal',
    name: 'Babak Semifinal',
    subtitle: 'Tahap 10 Peserta Terbaik',
    description: 'Pertarungan sengit 10 besar untuk menentukan 3 finalis yang maju ke Babak Final perebutan piala.',
    isActive: false,
    maxDurationMinutes: 25,
    passingQuota: 3
  },
  final: {
    id: 'final',
    name: 'Babak Grand Final',
    subtitle: 'Tahap Penentuan Juara 1, 2, dan 3',
    description: 'Babak puncak penentuan Juara Utama Lomba Literasi dan Numerasi GELORA 26 SMP Negeri 26 Sijunjung.',
    isActive: false,
    maxDurationMinutes: 20,
    passingQuota: 1
  }
};
