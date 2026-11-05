# 03 — Indikator Audit (DRAFT)

Tujuan: **memunculkan pertanyaan, bukan memberi rasa aman.** Indikator tidak membuktikan niat siapa pun; ia hanya menandai "ini perlu ditanyakan".

## Prinsip
1. **Indikator = pertanyaan, bukan vonis.** Tiap hasil memuat: apa yang dilihat, pembanding, pertanyaan untuk diajukan.
2. **Kebenaran = hitung fisik.** Ledger hanya mencatat yang masuk sistem. Barang yang diambil tanpa transaksi hanya terlihat saat opname. Maka kualitas opname (acak, tidak diumumkan, hitung buta, cakupan SKU bernilai tinggi) adalah indikator utama.
3. **Terlalu rapi juga mencurigakan** (selisih selalu 0, angka bulat berulang, pola identik antar periode).
4. **Selalu ada pembanding**, bukan angka mutlak: periode lalu, cabang lain, barang sekelas, staf lain.
5. **Hasil = snapshot turunan** (bisa dihitung ulang dari ledger), bukan sumber kebenaran.

## Indikator
| ID | Yang dihitung | Pembanding | Pertanyaan |
|---|---|---|---|
| A1 | Penyusutan = stok awal + masuk − keluar tercatat − hitung fisik, per SKU × cabang × periode | Periode lalu, cabang lain | Barang ini keluar lewat jalur apa selain transaksi? |
| A2 | Selisih opname vs toleransi barang (OPEN-08), tren per staf penghitung | Toleransi barang, staf lain | Mengapa staf/cabang ini konsisten lebih besar? |
| A3 | Porsi opname dengan selisih 0 atau pola identik | Cabang lain | Apakah hitungan benar-benar buta dan independen? |
| A4 | SKU yang tidak dihitung > N hari; frekuensi opname SKU bernilai tinggi | Target frekuensi | Barang mana yang tidak pernah dilihat? |
| A5 | Jumlah penolakan "stok kurang" saat jual (sistem bilang habis, fisik ada) | Periode lalu | Dari mana stok fisik lebih banyak dari catatan? (kasus 12 vs 16) |
| A6 | Penyesuaian stok negatif manual: frekuensi, nilai, per staf, tanpa dokumen sumber | Staf lain | Mengapa koreksi ini diperlukan dan siapa yang menyetujui? |
| B1 | Rasio void/retur terhadap penjualan per staf; void pada penjualan tunai; void dekat jam tutup; alasan generik berulang | Staf/cabang lain | Apa yang terjadi pada transaksi ini? |
| B2 | Harga jual menyimpang dari aturan harga (DEC-27); diskon besar per staf per barang | Aturan harga | Siapa yang mengizinkan harga ini? |
| B3 | Jual di bawah HPP / harga 0; qty di luar batas wajar barang | Riwayat barang | Mengapa transaksi ini sampai terjadi? |
| B4 | Pelunasan piutang tunai vs setoran ke akun kas; selisih kas | Hari/staf lain | Ke mana selisih kasnya? |
| B5 | Transaksi di luar jam buka, nilai kembar berulang, lonjakan dekat penutupan | Pola harian | Mengapa pola ini muncul? |
| C1 | Penerimaan < PO berulang per supplier/cabang; barang masuk tanpa PO | Supplier lain | Kurangnya di jalan atau di gudang? |
| C2 | Selisih kirim vs terima per rute/orang; transfer lama "dalam perjalanan" | Rute lain | Di titik mana barang berkurang? |
| C3 | Permintaan Barang berulang padahal catatan stok tinggi atau penjualan rendah | Cabang sejenis | Barangnya ke mana? |
| D1 | Amend/void setelah posting per user; dokumen di-backdate (tanggal jauh dari waktu input) | User lain | Mengapa dokumen diubah setelahnya? |
| D2 | Login gagal berulang; login di luar jam; sesi bertumpuk (satu username dipakai bergantian) | Pola user | Siapa sebenarnya yang memakai akun ini? |
| D3 | Percobaan menembus kunci periode | — | Siapa mencoba mengubah data yang sudah ditutup? |
| D4 | (Jika Jeking aktif) penjualan Jeking vs INO per hari per cabang | Harus cocok | Mengapa dua sistem berbeda angkanya? (OPEN-09) |

## Mekanisme
- Trigger harian menghitung indikator dari ledger lalu menambah baris ke tab `Indikator`: tanggal, id_indikator, id_usaha, id_cabang, subjek (SKU/user), nilai, pembanding, status_tinjauan. Ringkasan mingguan dikirim ke pemilik lewat email.
- Tab ledger append-only dengan UUID dan timestamp stabil, sehingga analis data bisa membacanya langsung (mis. Looker Studio terhubung ke Sheet, hanya akses baca untuk analis).
- Opname = **assert saldo** (qty fisik pada waktu T, bukan delta); server menghitung selisih terhadap saldo ledger sampai T. Transaksi sesudah mulai hitung dicatat terpisah.
- Penolakan "stok kurang" (A5) wajib dicatat sebagai kejadian, bukan hanya ditolak.

## Pola ERPNext
- Dipakai: SLE append-only; Stock Reconciliation (assert saldo); versi/diff → `AuditLog`; amend dan cancel sebagai reversal; kunci periode; Notification + Auto Email Report → trigger + email; User Permission menembus laporan → filter cakupan.
- Ditunda/diganti: Budget Stop/Warn; approval berbasis nominal (diganti daftar tinjauan usaha); validasi GL berlapis (jurnal turunan sudah seimbang by construction).

## Batas pembuktian
Data tidak membuktikan pencurian. Data hanya menunjukkan di mana angka tidak sesuai harapan, dan setiap temuan harus dikonfirmasi lewat hitung fisik dan percakapan.
