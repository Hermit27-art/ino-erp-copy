# Decisions Log — INO ERP Hardening

| ID | Keputusan | Alasan | Status |
|----|-----------|--------|--------|
| DEC-01 | Satu bisnis, Sheets cukup | Portofolio pemilik, tidak multi-tenant | ✅ |
| DEC-02 | Tunai/QRIS/Transfer/Debit = Lunas; hanya Piutang/Tempo = piutang | | ✅ |
| DEC-03 | PPN: user bebas pilih, aplikasi netral, tidak memaksa aturan | Pemilik tidak yakin aturan pajak | ✅ |
| DEC-04 | HPP: Moving Average (fokus), FIFO opsional di setting | | ✅ |
| DEC-05 | Void ≠ Retur. Void = dibatalkan, tetap tercatat, tidak dihitung laporan. Retur = barang kembali. Kasir boleh void POS (wajib alasan, Void Log). Void SO/PO = Admin+ | | ✅ |
| DEC-06 | Alur PO: Pesan→Rilis→Terima→Bayar. Hutang saat terima. Centang "Sudah dibayar" saat buat PO | Menggantikan perilaku lama | ✅ |
| DEC-07 | Tidak ada konversi satuan. Satuan per produk diatur user. | | ✅ |
| DEC-08 | Stok tidak boleh negatif. Server menolak. | | ✅ |
| DEC-09 | SO: Draft→Rilis(Menunggu Kirim)→Kirim(parsial, stok kurang saat kirim)→Bayar. POS checkout instan. | SO meniru alur PO | ✅ |
| DEC-10 | Kasir: POS + produk/pelanggan (tanpa HPP). Admin: semua transaksi, void/retur, tanpa Settings/Users/Reset. Superadmin: semua. | | ✅ |
| DEC-11 | Akses web app: Anyone. Hanya Superadmin kelola user. | | ✅ |
| DEC-12 | Konsinyasi dihapus. Import pertahankan (Superadmin). Platform tidak diubah. | | ✅ |
| DEC-13 | Header Sheet live: Antigravity jalanin `auditSheetHeaders()` pada salinan | Pemilik tidak perlu menyalin | ✅ |
| DEC-14 | Aplikasi = operasional saja. Laba = Laba Kotor (Penjualan − HPP). Keuangan = aplikasi terpisah. | | ✅ |
| DEC-15 | Void POS: kasir boleh langsung void (wajib alasan, Void Log). Void SO/PO = Admin+. | Kontrol via Void Log, bukan persetujuan | ✅ |
| DEC-16 | Akun & metode di Settings (database). Tiap akun punya daftar metode. Mutasi catat akun & metode. | | ✅ |
| DEC-17 | Dashboard pakai template Tremor/Blok (MIT). Pemilih template setelah lihat pratinjau. | DESAIN DITOLAK, pakai template existing | ⏳ |

---

## Technical Decisions (Implementation)

| ID | Keputusan | Alasan | Status |
|----|-----------|--------|--------|
| TD-01 | Delta ops: `adjustStock`, `adjustBalance`, `appendCashEntry` di `Code_ERP.gs` dengan `LockService` + `opId` idempotency (CacheService 6 jam) | Anti-lost-update, konkuren aman | 🔄 D1 |
| TD-02 | ID format: `PREFIX-YYYYMMDD-NNN` (generateId_ existing di POS), server-side only | Unik, berurutan, audit-friendly | 🔄 D3 |
| TD-03 | SCHEMA terpusat di `Code_ERP.gs`, `setup_sheets.gs` import & pakai, validasi runtime di `saveItemToSheet_` | Single source of truth, error eksplisit | 🔄 D4 |
| TD-04 | `todayLocal()` helper zona `Asia/Makassar` (GMT+8), ganti 22× `toISOString()` | Tanggal bisnis konsisten WITA | 🔄 D8 |
| TD-05 | Void Log: simpan `voidedBy`, `voidedAt`, `voidAlasan`, `refId` dokumen, badge Void, dikecualikan total/laporan | Audit trail lengkap | 🔄 D6 |
| TD-06 | Hash chain: `_hash` = SHA-256(prev_hash + canonical fields), hash kepala + row count di Script Properties | Tamper-evident, recoverable | 🔄 T2 |