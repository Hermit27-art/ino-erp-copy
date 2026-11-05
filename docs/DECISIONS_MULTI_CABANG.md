# Log Keputusan: Multi-Usaha / Multi-Cabang (diperbarui 2026-10-30)

Lanjutan DEC-01..17 di `PRD_INO_ERP_Antigravity.md`. Agent tidak boleh mengubah keputusan di sini tanpa bertanya.
Item `OPEN` = belum diputuskan: agent harus bertanya, bukan menebak.

## Mengganti keputusan lama
- **DEC-01** (satu perusahaan, tidak multi-tenant) dan Non-Goals baris "pemantauan antar-cabang = aplikasi terpisah" **dicabut** oleh DEC-18.

## Struktur & platform
- **DEC-18** Hierarki tetap 3 tingkat: grup → usaha → cabang. Semua usaha = retail, satu skema untuk semua.
- **DEC-19** Full Google Apps Script + Google Sheets. Supabase dibatalkan. Hanya Superadmin/IT yang boleh mengedit Sheet langsung (Sheet tidak dibagikan, lihat T1).
- **DEC-20** Satu Spreadsheet, semua cabang bercampur di tiap tab. Setiap baris wajib `id_usaha` + `id_cabang`, **diisi server dari sesi**, tidak pernah dari kiriman browser. Semua baca/tulis tab lewat satu fungsi pintu (`rows_`); fungsi lain dilarang membaca tab langsung. Arsip + ringkasan tiap 6 bulan.
- **DEC-21** ID acak (`Utilities.getUuid()`) + kode manusiawi unik per usaha.

## Akses
- **DEC-22** Peran: Superadmin, Eksekutif (C-level), Akunting Umum, Admin Usaha, Staf Cabang (gabungan "Kasir" + "Staf Cabang", lihat DEC-37). Peran + cakupan (usaha/cabang); cakupan "lihat" dan "ubah" terpisah.
- **DEC-23** Setiap dokumen punya tepat satu pemilik (cabang ATAU usaha). Langkah oleh pihak lain = langkah/dokumen terpisah, bukan edit dokumen orang lain.
- **DEC-24** Staf Cabang: lihat + ubah hanya cabangnya. Admin Usaha: lihat semua cabang di bawahnya; ubah dokumen milik usaha (produk, harga, PO). Eksekutif/Akunting: lihat sesuai cakupan. Server selalu memeriksa cakupan dari sesi; filter di layar hanya mempersempit.

## Tampilan
- **DEC-25** Sidebar (bukan top bar). Bagian atas = pemilih konteks grup > usaha > cabang sesuai hak. Halaman pertama berbeda per jabatan. Satu dashboard dengan filter usaha/cabang, default = cakupan terluas. Menu transaksi cabang hanya aktif di konteks satu cabang. Desain = Codex; kode & backend = Claude Code. `App.tsx` tidak ditulis ulang: buat shell baru memakai data `NAV`.

## Produk & harga
- **DEC-26** `Produk` milik usaha (SKU, nama, satuan, status pajak PKP/PPN; cabang tidak boleh ubah pajak). `ProdukCabang`: aktif/nonaktif per cabang × SKU; barang baru otomatis nonaktif di semua cabang.
- **DEC-27** Harga dasar di usaha + aturan per cabang × SKU: `TETAP` | `SELISIH_RP` | `SELISIH_PCT`. Hanya Admin Usaha ke atas yang boleh ubah. Harga final dihitung server dan di-snapshot di baris transaksi. Perubahan dicatat (siapa, kapan, lama→baru, alasan) + laporan penyimpangan dari harga dasar.

## Pembelian, stok, transfer
- **DEC-28** PO milik usaha. Cabang membuat **Permintaan Barang** (tanpa harga). PO bisa menggabung banyak permintaan; tiap baris punya `cabang_tujuan`. Penerimaan dikonfirmasi cabang tujuan (boleh parsial). Hutang di tingkat usaha, timbul saat diterima (DEC-06).
- **DEC-29** Stok = buku mutasi append-only `MutasiStok` (usaha, cabang, SKU, ±qty, jenis, rujukan). Stok = SUM. Tidak boleh negatif (DEC-08).
- **DEC-30** Transfer antar cabang (satu usaha), wajib sejak awal, dua langkah: Kirim (asal; status Dalam Perjalanan) → Terima (tujuan). Selisih dicatat sebagai selisih transfer.
- **DEC-31** Transfer antar usaha = jual-beli antar usaha. Pihak internal **ditandai**; laporan tingkat grup mengeliminasi transaksi internal agar penjualan tidak terhitung ganda.
- **DEC-32** Akun kas/bank: ada akun bersama (milik usaha) dan akun khusus per cabang. Setiap mutasi kas wajib mencatat `akun` **dan** `id_cabang`, apa pun pemilik akunnya.

## OPEN
- **OPEN-01** HPP moving average per cabang atau per usaha. Usulan default: per cabang (nilai ikut saat transfer). Harus diputuskan sebelum modul Pembelian/Transfer dikerjakan.
- **OPEN-03** Apakah Akunting Umum boleh mengubah data (mis. jurnal koreksi)? Default: hanya lihat.
- **OPEN-04** PPN/faktur pajak untuk transaksi antar usaha dan harga transfernya (konfirmasi ke akuntan; jangan diputuskan agent).

## Pengelolaan user & skema
- **DEC-34** Superadmin membuat/mereset user apa pun. Admin Usaha hanya peran di bawahnya dalam usahanya. Tidak boleh memberi hak melebihi hak sendiri. Skema tab organisasi/user/akses/ID + matriks peran (draft) ada di `02-data-org-auth.md`.

- **DEC-35** Hak aksi tidak diwariskan otomatis antar jabatan; hanya cakupan yang menurun dari pohon organisasi. Jabatan = label + peran standar + tingkat cakupan (tab `Jabatan`). Pemetaan: Anda/IT = Superadmin (semua); Founder & C-level = Eksekutif (semua, lihat saja); Manajer = Admin Usaha (semua usaha); Supervisor Usaha = Admin Usaha (1 usaha); Akuntan = Akunting (semua, bisa dipersempit per orang); Staf input cabang = Staf Cabang (1 cabang). Bertindak di luar cakupan = baris `AksesUser` tambahan yang eksplisit, bisa berbatas waktu, tercatat di audit.
- **DEC-36** Peran **Staf Cabang** (menggantikan "Kasir"): jual/POS, void POS (alasan wajib), Permintaan Barang, terima barang, pelunasan piutang; lihat data cabang tanpa HPP/laba/hutang. "Purchase" di cabang = Permintaan Barang + Penerimaan; PO tetap milik usaha (DEC-28).

## Integritas data (keputusan 2026-10-30)
- **DEC-37** Tidak ada orang berwenang lebih di cabang. Peran Admin Cabang dihapus; Staf Cabang memegang jual, void SO/retur, permintaan/terima barang, pelunasan piutang, transfer, dan stok opname. Aktif/nonaktif barang per cabang = Admin Usaha. Pemisahan tugas dibuat lewat struktur: cabang mengerjakan, tingkat usaha meninjau.
- **DEC-38** Kontrol integritas (bukan hanya otorisasi): (a) stok hanya berubah lewat dokumen yang menulis `MutasiStok`; tidak ada edit stok langsung. (b) Stok opname = dokumen hitung buta: qty sistem disembunyikan saat menghitung, server menghitung selisih. (c) Selisih di atas ambang (per usaha, di Settings) berstatus `Menunggu Tinjauan`; penyesuaian stok baru diposting setelah Admin Usaha menyetujui. Selisih di bawah ambang diposting otomatis dan ditandai. (d) Void SO/retur, penyesuaian stok negatif, dan selisih transfer wajib alasan dan masuk daftar tinjauan usaha. (e) `AuditLog` mencatat siapa, kapan, sebelum/sesudah, alasan, dan dokumen untuk semua aksi sensitif. Analisis audit/anomali dikerjakan pemilik di luar aplikasi ini; aplikasi hanya wajib menyediakan datanya.
- **OPEN-08** (disimpan, belum dikerjakan) Ambang kewajaran selisih opname **per barang**, bukan satu angka umum. Arah: kolom opsional `toleransi_selisih` di `Produk` (satuan unit atau %, diisi Admin Usaha; kemungkinan bisa ditimpa per cabang di `ProdukCabang`). Default saat kosong: semua selisih ≠ 0 wajib ditinjau (DEC-38c). Frekuensi opname juga belum diputuskan.

- **DEC-39** Audit bersifat skeptis: indikator menghasilkan pertanyaan, bukan vonis; kebenaran = hitung fisik. Daftar indikator awal ada di `03-audit-indikator.md`. Opname = assert saldo; penolakan "stok kurang" dicatat sebagai kejadian. Hasil indikator = snapshot turunan harian di tab `Indikator`; analis data membaca ledger append-only.
- **OPEN-09** (DIJEDA sampai awal bulan depan) Jeking POS (Visual FoxPro). Temuan (dikoreksi): tiap cabang menyerahkan settlement akhir hari dan pusat MENCATAT ULANG manual keesokan harinya; tidak ada database gabungan; ada pemantauan AnyDesk/viewer antar PC. Pencatatan ulang manual = risiko integritas tersendiri. Arah: program kecil di tiap cabang (6) membaca database lokal Jeking secara baca-saja (salinan, bukan file hidup) dan mengirim ke Sheet perusahaan; BUKAN lewat AnyDesk/layar remote. Perlu dicari tahu: (a) di mana hasil gabungan akhir hari disimpan, (b) formatnya (DBF/CSV/Excel) dan apakah ada menu ekspor, (c) cara cabang mengirim ke pusat (LAN/VPN/internet/media), (d) apakah cabang bisa edit/hapus transaksi sebelum dikirim dan apakah ada log, (e) ketentuan lisensi/kontrak vendor. Amankan akses tanpa-pengawasan AnyDesk. Menentukan indikator D4. (f) Tambahan: bisakah Jeking mengirim per transaksi/jam sebelum settlement, atau hanya saat settlement? Pembicaraan dengan developer Jeking dilakukan pemilik.

- **DEC-40** Dokumen posted (termasuk stok) tidak bisa diedit atau dihapus. Koreksi hanya lewat dokumen pembalik yang merujuk dokumen asal, wajib alasan, dan masuk daftar tinjauan usaha; dokumen asal tetap terlihat. Mini ERP lama (yang boleh edit/hapus) harus diubah.
- **DEC-41** Jeking berjalan berdampingan lalu dimigrasi bertahap. Tahap A: cermin transaksi Jeking ke INO baca-saja (`sumber=JEKING`, `external_ref` unik/idempoten, tidak bisa diedit) + laporan yang Jeking tak punya. Tahap B: fitur INO yang Jeking tak punya (opname, transfer, permintaan barang, monitor harga). Tahap C: POS INO menggantikan Jeking per cabang.
- **DEC-42** Kebutuhan laporan: laporan harian saat settlement + notifikasi hari yang sama (bot Telegram atau email), laba rugi, beban per cabang, anggaran per akun/bulan/cabang (mode peringatan, bukan blokir), alert stok minimum (`stok_min` per `ProdukCabang`).
- **DEC-43** Mobile-first: dipakai di HP lewat browser, UI responsif, "Tambah ke layar utama". PWA penuh dan kamera scan perlu diuji di Apps Script; scanner Bluetooth (mode keyboard) didukung. Tidak ada mode offline.
- **OPEN-10** Selama berdampingan dengan Jeking, sistem mana pemilik tiap jenis dokumen (penjualan, stok, pembelian) supaya tidak ada dua sumber kebenaran untuk stok yang sama.

- **DEC-44** Cakupan produk: pola inti retail multi-cabang + Keuangan + HR minimal (karyawan, penggajian yang menjadi beban). Tanpa manufaktur dan CRM. Setiap baris jurnal membawa `id_usaha` dan `id_cabang` sehingga laba rugi bisa per cabang/usaha/grup. Logika keuangan memakai pola Mini ERP (jurnal turunan, laporan, rekonsiliasi bank, umur hutang/piutang).
- **DEC-45** Urutan pengerjaan: (1) fondasi org/user/login/akses/audit/ID + shell UI; (2) produk, harga, mutasi stok, opname hitung buta; (3) pembelian, transfer, pelunasan; (4) keuangan, anggaran, laporan harian; (5) HR minimal; (6) indikator audit + pencerminan Jeking. Jeking TIDAK memblokir tahap 1-5; sejak awal semua dokumen punya kolom `sumber` dan `external_ref`.
- **OPEN-12** Lingkup HR: hanya penggajian ke beban, atau juga absensi/cuti? PPh 21 (PTKP), BPJS: ditunda/ke akuntan.

- **DEC-46** Pembagian kerja: Codex/ChatGPT memegang desain (`src/ui/`, token, `docs/DESIGN_SYSTEM.md`); agent kode memegang backend, logika, tes, dan penyambungan. Desain berjalan design-system-dulu: dua varian, pemilik memilih, lalu dibekukan; layar dibuat di dalam sistem itu. Sistem yang dibekukan = "template yang disetujui pemilik" untuk aturan `ui-dashboard-i18n`. Basis awal tetap template PRD (Tremor Blocks). Berkas: `CLAUDE.md`, `docs/DESIGN_BRIEF.md`, `docs/PRD_ADDENDUM_M1.md`.
- **OPEN-13** Migrasi data INO lama (Products, SO, PO, dst.) ke skema multi-cabang: usulan semua data lama menjadi satu cabang awal. Perubahan skema atas data yang ada: wajib persetujuan pemilik; bukan bagian Fase M1.

- **DEC-47** Skala: 6 cabang total di semua usaha. Satu Spreadsheet cukup (menutup OPEN-02). Arsip 6 bulanan tetap berlaku.
- **DEC-48** Pendekatan awal Jeking: tanyakan ke developer secara bertahap (1: di mana dan bagaimana database cabang disimpan, apakah bisa dibaca program lain dengan aman, risiko lisensi, internet cabang; 2: bisa tidaknya program kecil per cabang mengirim data otomatis ke Google Sheet saat settlement, siapa yang membuat, estimasi). Uji dengan data satu hari dari satu cabang sebelum membangun apa pun.

## Autentikasi (diputuskan)
- **DEC-33** Gratis, tanpa Workspace. Login = username unik + password ketik sendiri; satu akun per orang, tidak dipakai bersama; email kerja = kontak (persiapan pindah ke login Google nanti). Password di-hash di browser (PBKDF2 `crypto.subtle`, salt per user), server membungkus dengan HMAC + pepper di Script Properties, simpan di tab `Users`. Server tidak pernah menerima password asli. Kunci akun 5 gagal / 15 menit (hitungan di Sheet), respons seragam untuk username tak dikenal. Sesi: token acak, simpan hash, batas diam 12 jam + batas mutlak, logout mematikan sesi. Password min 10 karakter. Reset tercatat di audit log dan memaksa ganti password.
