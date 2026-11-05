# 02 — Data: Organisasi, User, Akses, ID (DRAFT untuk disetujui pemilik)

Mengikuti `DECISIONS_MULTI_CABANG.md`. Semua kolom di Google Sheet; tidak ada FK sungguhan, jadi **semua referensi divalidasi server** di fungsi pintu `rows_` (id harus ada, aktif, dan satu `id_usaha`).

## Konvensi
- **PK** = `id` teks UUID v4 (`Utilities.getUuid()`), dibuat server. Tidak pernah dipakai sebagai nomor yang dibaca manusia.
- **Kode** manusiawi (`kode`) unik pada cakupannya: `Usaha.kode` unik global, `Cabang.kode` unik per usaha, `Produk.kode` unik per usaha.
- **Nomor dokumen** (`no_dokumen`) berurutan, dibuat server di dalam lock, mis. `SO-CBG01-2610-0001` (jenis-kodeCabang-YYMM-urut). Urutan disimpan di tab `Counter` (kunci: pemilik|jenis|periode). Unik, tapi bukan PK.
- Tanggal = teks `yyyy-MM-dd`; waktu = teks `yyyy-MM-dd HH:mm:ss` (zona waktu dari Settings). Boolean = `1`/`0`.
- Data master **tidak pernah dihapus baris**; pakai `aktif=0`. Dokumen yang sudah posted tidak diedit; koreksi lewat void/retur/amend.
- Setiap tab transaksi wajib: `id_usaha`, `id_cabang` (kosong hanya untuk dokumen milik usaha), `dibuat_oleh`, `dibuat_pada`, `diubah_oleh`, `diubah_pada`. `id_*` dan `*_oleh` diisi server dari sesi.

## Tab organisasi
| Tab | Kolom |
|---|---|
| `Grup` | id, kode, nama, aktif |
| `Usaha` | id, id_grup, kode, nama, aktif, ppn_rate, taxMode_default, ppnStatus_default |
| `Cabang` | id, id_usaha, kode, nama, alamat, aktif |

## Tab user & akses
| Tab | Kolom |
|---|---|
| `Users` | id, username (unik, huruf kecil), nama, email, aktif, pw_hash, pw_salt, wajib_ganti, gagal_count, terkunci_sampai, pw_diubah_pada, dibuat_oleh, dibuat_pada |
| `Jabatan` | id, nama, peran (dari konstanta `PERMS`), tingkat_cakupan (`SEMUA`/`USAHA`/`CABANG`), aktif. Hanya label + default; hak aksi tetap di kode. |
| `AksesUser` | id, id_user, id_jabatan, peran, id_usaha, id_cabang, aktif, berlaku_sampai, diberikan_oleh, dibuat_pada (`peran` disalin dari jabatan saat dibuat; server menolak cakupan yang tidak sesuai `tingkat_cakupan`) |
| `Sesi` | hash_token (PK), id_user, dibuat_pada, terakhir_aktif, kedaluwarsa_mutlak |
| `AuditLog` | id, waktu, id_user, id_usaha, id_cabang, aksi, entitas, id_entitas, ringkas_sebelum, ringkas_sesudah, alasan, hasil |

**Arti cakupan di `AksesUser`:**
- `id_usaha` kosong + `id_cabang` kosong = semua usaha (Superadmin, Eksekutif, Akunting Umum).
- `id_usaha` terisi + `id_cabang` kosong = semua cabang pada usaha itu (Admin Usaha).
- keduanya terisi = satu cabang (Staf Cabang). Server menolak jika cabang bukan milik usaha itu.
- Satu orang boleh punya beberapa baris `AksesUser` (peran/cakupan berbeda). Cakupan efektif = gabungan baris aktif yang belum kedaluwarsa.

**Aturan:**
- `AuditLog` append-only; tidak ada fungsi publik yang mengubah/menghapusnya.
- `Sesi` disimpan di Sheet (CacheService maksimum 6 jam, sedangkan batas diam sesi 12 jam). `terakhir_aktif` diperbarui paling sering tiap 15 menit.
- Peran didefinisikan sebagai konstanta kode (`PERMS`), bukan tab, sampai ada kebutuhan peran custom (YAGNI).
- Satu fungsi `can_(sesi, aksi, pemilikDokumen)` dipakai SEMUA fungsi publik; pemilik = `{id_usaha, id_cabang}`.
- Pembuat user tidak boleh memberi peran/cakupan melebihi miliknya (DEC-34).

## Matriks peran (DRAFT). L = lihat dalam cakupan, U = buat/ubah dalam cakupan, – = tidak

| Aksi | Superadmin | Eksekutif | Akunting Umum | Admin Usaha | Staf Cabang |
|---|---|---|---|---|---|
| Lihat transaksi & stok cabang | U | L | L | L | L (tanpa HPP/laba/hutang) |
| Lihat HPP / laba | L | L | L | L | – |
| POS jual | U | – | – | – | U |
| Void POS (alasan wajib) | U | – | – | – | U |
| Void / retur SO | U | – | – | – | U |
| Permintaan Barang | U | – | – | – | U |
| Terima barang (penerimaan PO) | U | – | – | – | U |
| Pelunasan piutang (terima pembayaran pelanggan) | U | – | – | – | U |
| Transfer kirim / terima | U | – | – | – | U |
| Stok opname | U | – | – | – | U |
| Aktif/nonaktif barang di cabang | U | – | – | U | – |
| PO, void PO, bayar hutang | U | – | – | U | – |
| Produk, pajak, aturan harga | U | – | – | U | – |
| Akun kas/bank, setting usaha | U | – | – | U | – |
| Cek saldo rekening bersama | U | – | OPEN-03 | U | – |
| Kelola user | U | – | – | peran di bawahnya | – |
| Struktur grup/usaha/cabang | U | – | – | – | – |

Catatan: Admin Usaha **tidak** menulis dokumen milik cabang (DEC-23/24); ia hanya melihat dan meninjau (DEC-38). Staf Cabang tidak melihat HPP, laba, hutang, dan laporan keuangan. Pembayaran hutang supplier tetap di usaha (DEC-28). Tidak ada peran Admin Cabang (DEC-37).
