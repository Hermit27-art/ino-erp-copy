// node --test tests/   (Node 22+, tanpa dependensi)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatement, parseDate, parseAmount, pisahBaru } from '../src/domain/bankStatement.ts';
import { kandidat, autoCocok, cekManual, laporan } from '../src/domain/rekon.ts';
import { saldoAkun, buatTransfer, bebanKeKas, arusKas } from '../src/domain/kas.ts';

// ---------- rekening koran ----------
const BCA = `REKENING KORAN;;;;;;
Periode;01/09/2026 - 30/09/2026;;;;;
;;;;;;
Tanggal;Bukti;Keterangan;Referensi;Debit;Kredit;Saldo
01/09/2026;;SALDO AWAL;;;;50.000.000,00
02/09/2026;B001;SETOR TUNAI  CABANG   DENPASAR;TRX001;;10.000.000,00;60.000.000,00
05/09/2026;;TRF KE SUPPLIER A;TRX002;4.000.000,00;;56.000.000,00
05/09/2026;;BIAYA ADMIN;;12.500,00;;55.987.500,00
30/09/2026;;;;;;55.987.500,00
`;
test('rekening koran: bukti dan referensi opsional, saldo diabaikan, KREDIT=masuk, DEBIT=keluar', () => {
  const r = parseStatement(BCA);
  assert.equal(r.ok, true); assert.equal(r.angka, 'id'); assert.equal(r.sep, ';');
  assert.deepEqual(r.lines.map(l => [l.tgl, l.amt, l.bukti, l.ref]), [['2026-09-02', 10000000, 'B001', 'TRX001'], ['2026-09-05', -4000000, '', 'TRX002'], ['2026-09-05', -12500, '', '']]);
  assert.equal(r.lines[0].ket, 'SETOR TUNAI CABANG DENPASAR', 'spasi ganda dirapikan');
  assert.equal(r.skipped, 2, 'baris saldo awal dan baris kosong bernominal tidak dianggap transaksi'); assert.equal(r.rejected.length, 0);
});
test('rekening koran: tanpa kolom bukti dan referensi, koma + angka Inggris, kolom diacak', () => {
  const csv = '"Date","Description","Debit","Credit","Balance"\n"05/10/2026","PAYMENT, ONLINE","1,250,000.50","","10.00"\n"06/10/2026","DEPOSIT","","3,000,000.00","x"\n';
  const r = parseStatement(csv); assert.equal(r.ok, true); assert.equal(r.angka, 'en');
  assert.deepEqual(r.lines.map(l => [l.ket, l.amt]), [['PAYMENT, ONLINE', -1250000.5], ['DEPOSIT', 3000000]]);
});
test('rekening koran: baris buruk ditolak dengan alasan, yang baik tetap masuk', () => {
  const csv = 'Tanggal;Keterangan;Debit;Kredit\n31/02/2026;TGL SALAH;100;\n01/10/2026;DUA SISI;100;200\n02/10/2026;NOMINAL ANEH;abc;\n03/10/2026;NEGATIF;-5;\n04/10/2026;BAIK;;75,5\n';
  const r = parseStatement(csv);
  assert.deepEqual(r.rejected.map(x => x.alasan.split(':')[0]), ['Tanggal tidak valid', 'Debit dan kredit sama-sama terisi', 'Nominal bukan angka', 'Nominal negatif']);
  assert.deepEqual(r.lines.map(l => l.amt), [75.5]);
});
test('rekening koran: judul kolom tak dikenal -> gagal jelas; bisa ditimpa manual; arah dibalik', () => {
  const csv = 'Tgl;Uraian;Keluar;Masuk\n01/10/2026;A;100;\n';
  assert.equal(parseStatement(csv).lines[0].amt, -100);
  assert.equal(parseStatement(csv, { arah: 'buku' }).lines[0].amt, 100);
  const bad = parseStatement('Waktu;Info;Jumlah\n1;2;3\n'); assert.equal(bad.ok, false); assert.match(bad.error, /Baris judul/);
  const odd = parseStatement('Tanggal;Ket;Debit;X\n01/10/2026;A;;50\n'); assert.equal(odd.ok, false); assert.match(odd.error, /kredit/);
  const fixed = parseStatement('Tanggal;Ket;Debit;X\n01/10/2026;A;;50\n', { kolom: { kredit: 3 } }); assert.equal(fixed.ok, true); assert.equal(fixed.lines[0].amt, 50);
});
test('tanggal dan angka: format umum bank', () => {
  assert.equal(parseDate('05/10/2026'), '2026-10-05'); assert.equal(parseDate('5-10-26'), '2026-10-05'); assert.equal(parseDate('2026-10-05 13:00:01'), '2026-10-05');
  assert.equal(parseDate('05 Okt 2026'), '2026-10-05'); assert.equal(parseDate('12/31/2026', 'mdy'), '2026-12-31'); assert.equal(parseDate('29/02/2026'), null); assert.equal(parseDate('besok'), null);
  assert.equal(parseAmount('Rp 1.234.567,89', 'id'), 1234567.89); assert.equal(parseAmount('1,234,567.89', 'en'), 1234567.89); assert.equal(parseAmount('', 'id'), null); assert.ok(Number.isNaN(parseAmount('12a', 'id')));
});
test('impor ulang tidak menggandakan; baris kembar dalam satu berkas tetap dibedakan', () => {
  const csv = 'Tanggal;Keterangan;Debit;Kredit\n01/10/2026;KOPI;10;\n01/10/2026;KOPI;10;\n02/10/2026;GAJI;;500\n';
  const a = parseStatement(csv).lines; assert.equal(a.length, 3); assert.equal(new Set(a.map(l => l.key)).size, 3);
  const again = pisahBaru(a.map(l => l.key), parseStatement(csv).lines); assert.equal(again.baru.length, 0); assert.equal(again.duplikat.length, 3);
  const plus = pisahBaru(a.map(l => l.key), parseStatement(csv + '03/10/2026;BARU;;1\n').lines); assert.deepEqual(plus.baru.map(l => l.ket), ['BARU']);
});

// ---------- rekonsiliasi ----------
const m = (id, tgl, amt, x = {}) => ({ id, tgl, amt, ...x }), b = (id, tgl, amt, x = {}) => ({ id, tgl, amt, ...x });
test('rekon: hanya pasangan tak ambigu yang otomatis; kembar dan rebutan ditinjau manual', () => {
  const bank = [m('m1', '2026-10-02', 1000), m('m2', '2026-10-03', 500), m('m3', '2026-10-03', 500), m('m4', '2026-10-04', 700)];
  const buku = [b('b1', '2026-10-01', 1000), b('b2', '2026-10-03', 500), b('b4', '2026-10-30', 700)];
  const r = autoCocok(bank, buku);
  assert.deepEqual(r, [{ mutasi: 'm1', buku: ['b1'] }], 'm2/m3 berebut b2 -> manual; m4 di luar jendela 7 hari');
});
test('rekon: nomor referensi sama jadi penentu bila kandidat banyak', () => {
  const r = autoCocok([m('m1', '2026-10-02', 500, { ref: 'TRX9' })], [b('a', '2026-10-02', 500, { ref: 'TRX1' }), b('b', '2026-10-02', 500, { ref: 'TRX9' })]);
  assert.deepEqual(r, [{ mutasi: 'm1', buku: ['b'] }]);
  assert.equal(kandidat(m('x', '2026-10-02', 500), [b('a', '2026-10-02', 500)], new Set(['a'])).length, 0, 'yang sudah dipakai tidak jadi kandidat');
});
test('rekon: manual 1-ke-banyak harus pas; laporan selisih dan target nol', () => {
  const mm = m('m1', '2026-10-05', 1500), bs = [b('b1', '2026-10-05', 1000), b('b2', '2026-10-05', 500)];
  assert.equal(cekManual(mm, bs, new Set()), null);
  assert.match(cekManual(mm, [bs[0]], new Set()), /selisih 500/); assert.match(cekManual(mm, bs, new Set(['b2'])), /sudah dicocokkan/); assert.match(cekManual(mm, [bs[0], bs[0]], new Set()), /dua kali/);
  const L = laporan([mm, m('m2', '2026-10-06', -200)], [...bs, b('b3', '2026-10-06', -100)], [{ mutasi: 'm1', buku: ['b1', 'b2'] }]);
  assert.equal(L.seimbang, false); assert.equal(L.selisih, -100); assert.equal(L.belumBank.length, 1); assert.equal(L.belumBuku.length, 1);
  const Z = laporan([mm], bs, [{ mutasi: 'm1', buku: ['b1', 'b2'] }]); assert.equal(Z.seimbang, true); assert.equal(Z.selisih, 0);
  const palsu = laporan([mm], [bs[0]], [{ mutasi: 'm1', buku: ['b1'] }]); // semua baris "terpakai", tapi 1500 != 1000
  assert.equal(palsu.seimbang, false, 'cocok yang jumlahnya tidak pas tidak dihitung'); assert.equal(palsu.selisih, 500);
  const ganda = laporan([m('x', '2026-10-05', 1000), m('y', '2026-10-05', 1000)], [bs[0]], [{ mutasi: 'x', buku: ['b1'] }, { mutasi: 'y', buku: ['b1'] }]);
  assert.equal(ganda.cocokSah, 1, 'satu baris buku tidak boleh dipakai dua mutasi'); assert.equal(ganda.belumBank.length, 1);
});

// ---------- buku kas ----------
const U1 = 'U1', akun = (id, jenis, cab, s = 0, tgl = '2026-09-01') => ({ id, id_usaha: U1, id_cabang: cab, nama: id, jenis, saldo_awal: s, tgl_saldo_awal: tgl });
const AK = [akun('BESAR', 'KAS_BESAR', '', 100_000_000), akun('LACI-A', 'LACI', 'A', 5_000_000), akun('BANK', 'BANK', '', 20_000_000)];
const K = [
  { id: 'JUAL', nama: 'Penjualan tunai', arah: 'MASUK', aktivitas: 'OPERASI', beban: false, kode_akun: '' },
  { id: 'GAJI', nama: 'Gaji', arah: 'KELUAR', aktivitas: 'OPERASI', beban: true, kode_akun: '' },
  { id: 'BELI', nama: 'Pembelian barang', arah: 'KELUAR', aktivitas: 'OPERASI', beban: false, kode_akun: '' },
  { id: 'TRF', nama: 'Transfer internal', arah: 'INTERNAL', aktivitas: 'TRANSFER', beban: false, kode_akun: '' }
];
const row = (id, tgl, id_akun, amt, id_kategori, x = {}) => ({ id, tgl, id_akun, amt, id_kategori, id_transfer: '', ref: '', ket: '', ...x });
test('transfer kas besar -> laci cabang: dua baris, satu nomor, saldo benar, tolak yang tidak cukup', () => {
  const t = buatTransfer({ id: 'TRF-1', tgl: '2026-10-02', dari: AK[0], ke: AK[1], jumlah: 30_000_000, saldoDari: 100_000_000, kategori: K[3] });
  assert.equal(t.ok, true); const [k, mm] = t.data;
  assert.deepEqual([k.amt, mm.amt, k.id_transfer, mm.id_transfer], [-30_000_000, 30_000_000, 'TRF-1', 'TRF-1']);
  assert.equal(saldoAkun(AK[0], t.data), 70_000_000); assert.equal(saldoAkun(AK[1], t.data), 35_000_000);
  assert.match(buatTransfer({ id: 'x', tgl: '2026-10-02', dari: AK[1], ke: AK[0], jumlah: 9_000_000, saldoDari: 5_000_000, kategori: K[3] }).error, /tidak cukup/);
  const bank = buatTransfer({ id: 'y', tgl: '2026-10-02', dari: AK[2], ke: AK[0], jumlah: 25_000_000, saldoDari: 20_000_000, kategori: K[3] });
  assert.equal(bank.ok, true); assert.equal(bank.peringatan.length, 1, 'bank hanya diperingatkan');
  for (const bad of [{ jumlah: 0 }, { jumlah: -5 }, { ke: AK[0] }, { tgl: '10/02/2026' }, { kategori: K[0] }, { ke: { ...AK[1], id_usaha: 'U2' } }])
    assert.equal(buatTransfer({ id: 'z', tgl: '2026-10-02', dari: AK[0], ke: AK[1], jumlah: 1, saldoDari: 1e9, kategori: K[3], ...bad }).ok, false);
});
test('beban: hanya kategori beban, akun milik usaha/cabang yang sama, jadi baris kas keluar', () => {
  const be = { id: 'BBN-1', tgl: '2026-10-03', id_usaha: U1, id_cabang: 'A', id_kategori: 'GAJI', id_akun: 'LACI-A', jumlah: 1_200_000, pihak: 'Made', ket: 'Gaji Okt' };
  const r = bebanKeKas(be, AK[1], K[1], 5_000_000); assert.equal(r.ok, true); assert.equal(r.data.amt, -1_200_000); assert.equal(r.data.ref, 'BBN-1');
  assert.match(bebanKeKas(be, AK[1], K[2], 5e6).error, /bukan kategori beban/); assert.match(bebanKeKas({ ...be, id_cabang: 'B' }, AK[1], K[1], 5e6).error, /cabang lain/);
  assert.match(bebanKeKas(be, { ...AK[1], id_usaha: 'U2' }, K[1], 5e6).error, /usaha lain/); assert.match(bebanKeKas(be, AK[1], K[1], 1_000_000).error, /tidak cukup/);
  assert.equal(bebanKeKas({ ...be, id_cabang: '' }, AK[0], K[1], 1e8).ok, true, 'kas besar boleh bayar beban usaha');
});
test('arus kas per USAHA: transfer internal tidak menggelembung, per kategori, saldo awal+bersih=saldo akhir', () => {
  const t = buatTransfer({ id: 'TRF-1', tgl: '2026-10-02', dari: AK[0], ke: AK[1], jumlah: 30_000_000, saldoDari: 1e8, kategori: K[3] }).data;
  const B = [...t, row('c1', '2026-10-03', 'LACI-A', 8_000_000, 'JUAL'), row('c2', '2026-10-04', 'LACI-A', -1_200_000, 'GAJI'), row('c3', '2026-10-05', 'BESAR', -10_000_000, 'BELI'),
    row('c4', '2026-09-20', 'BESAR', 2_000_000, 'JUAL')]; // sebelum periode: masuk saldo awal
  const R = arusKas({ akun: AK, baris: B, kategori: K, id_usaha: U1, dari: '2026-10-01', sampai: '2026-10-31' });
  assert.equal(R.totalMasuk, 8_000_000); assert.equal(R.totalKeluar, 11_200_000); assert.equal(R.bersih, -3_200_000);
  assert.equal(R.saldoAwal, 127_000_000); assert.equal(R.saldoAkhir, 123_800_000); assert.equal(R.cocok, true);
  assert.deepEqual(R.rows.map(x => x.id_kategori).sort(), ['BELI', 'GAJI', 'JUAL']); assert.ok(!R.rows.some(x => x.id_kategori === 'TRF'), 'transfer tidak muncul sebagai masuk/keluar');
  assert.equal(R.perAktivitas.OPERASI.bersih, -3_200_000);
  assert.equal(arusKas({ akun: AK, baris: B, kategori: K, id_usaha: 'U2', dari: '2026-10-01', sampai: '2026-10-31' }).saldoAkhir, 0, 'usaha lain terpisah');
});
test('arus kas: akun baru di tengah periode dan baris sebelum saldo awal tidak merusak keseimbangan', () => {
  const baru = akun('BANK2', 'BANK', '', 7_000_000, '2026-10-15');
  const B = [row('d1', '2026-10-20', 'BANK2', 500_000, 'JUAL'), row('d0', '2026-10-01', 'BANK2', 999, 'JUAL')]; // d0 sebelum akun ada: diabaikan
  const R = arusKas({ akun: [baru], baris: B, kategori: K, id_usaha: U1, dari: '2026-10-01', sampai: '2026-10-31' });
  assert.equal(R.saldoAwal, 0); assert.equal(R.akunBaruNilai, 7_000_000); assert.equal(R.saldoAkhir, 7_500_000); assert.equal(R.cocok, true);
  assert.throws(() => arusKas({ akun: AK, baris: [row('e', '2026-10-02', 'BESAR', 1, 'ZZZ')], kategori: K, id_usaha: U1, dari: '2026-10-01', sampai: '2026-10-31' }), /Kategori tidak dikenal/);
});
