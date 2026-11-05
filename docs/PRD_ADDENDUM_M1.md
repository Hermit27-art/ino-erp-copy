# PRD Addendum — Fase M1: Fondasi Multi-Cabang

Berlaku di atas `PRD_INO_ERP_Antigravity.md`; jika bentrok, addendum + `DECISIONS_MULTI_CABANG.md` yang menang. Aturan eksekusi `AGENTS.md` tetap berlaku (test copy saja, server sebagai sumber kebenaran, satu fase per sesi).

## Tujuan
Orang bisa login dengan akun sendiri, melihat hanya cakupan yang menjadi haknya, dan setiap aksi tercatat. Belum ada fitur bisnis baru.

## Di dalam cakupan
| ID | Pekerjaan | Kriteria selesai (harus bisa diuji) |
|---|---|---|
| M1-1 | Tab baru: `Grup`, `Usaha`, `Cabang`, `Jabatan`, `Users`, `AksesUser`, `Sesi`, `AuditLog`, `Counter` (skema di `02-data-org-auth.md`). Fungsi setup idempoten, hanya untuk test copy. | Header persis sesuai skema; dijalankan dua kali tidak mengubah data; tab lama tidak tersentuh. |
| M1-2 | Fungsi pintu `rows_(tab, sesi)` dan `can_(sesi, aksi, pemilik)`. `id_usaha`/`id_cabang` diisi dari sesi. | User cabang A hanya menerima baris A. Payload berisi `id_cabang` B ditolak. Tidak ada akses tab bisnis baru di luar `rows_`. |
| M1-3 | Login sesuai DEC-33: hash PBKDF2 di browser, server membungkus HMAC + pepper, kunci 5 gagal/15 menit (hitungan di Sheet), respons seragam, sesi token acak (simpan hash), batas diam 12 jam + batas mutlak, logout, ganti password, `wajib_ganti`. | Tes: password salah dan username tak dikenal menghasilkan respons identik; kunci bertahan setelah cache dikosongkan; token asli tidak pernah tersimpan; sesi kedaluwarsa ditolak. |
| M1-4 | Konstanta `PERMS` mengikuti matriks di `02-data-org-auth.md`; cakupan efektif dihitung dari `AksesUser` (baris aktif, belum kedaluwarsa). | Tes berbasis tabel: aksi × peran × cakupan (di dalam/di luar). Eksekutif tidak bisa menulis. Staf Cabang tidak menerima kolom HPP. |
| M1-5 | Kelola user: Superadmin membuat/mereset siapa pun; Admin Usaha hanya peran di bawahnya dalam usahanya; tidak boleh memberi hak melebihi hak sendiri (DEC-34). Reset memaksa ganti password. | Tes penolakan untuk setiap pelanggaran; setiap kelola-user tercatat di `AuditLog`. |
| M1-6 | `AuditLog` append-only dan penomoran: UUID untuk PK, `no_dokumen` dari `Counter` di dalam lock. | Tidak ada fungsi publik yang mengubah/menghapus `AuditLog`. Dua permintaan beruntun tidak pernah menghasilkan nomor sama. |
| M1-7 | Endpoint `getKonteks(sesi)`: pohon usaha/cabang yang boleh dilihat, peran, dan menu yang diizinkan. | Staf Cabang mendapat satu cabang tanpa pemilih konteks. Admin Usaha melihat hanya usahanya. Eksekutif melihat semua. |
| M1-8 | Pasang shell sidebar dan pemilih konteks dari komponen `src/ui/` (setelah Codex selesai). Hanya penyambungan; `App.tsx` jangan ditulis ulang. | Menu berasal dari data `NAV`; item di luar hak tidak muncul DAN ditolak server bila dipanggil langsung. |

## Di luar cakupan (jangan dikerjakan)
Produk/harga/stok, pembelian, transfer, keuangan, HR, indikator audit, integrasi Jeking, dan **migrasi data INO lama** (butuh persetujuan pemilik, OPEN-13). Tab lama berjalan seperti sekarang sampai itu diputuskan.

## Definisi selesai
`npm run lint`, `npm run build`, `npm test` lulus; `pre-handoff-review` dijalankan; semua kriteria di atas punya tes; dilaporkan apa yang belum bisa diverifikasi.
