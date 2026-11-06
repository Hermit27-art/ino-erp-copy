// Buku kas operasional: saldo, transfer kas besar -> cabang, beban, dan arus kas per USAHA (bukan per cabang). Murni.
// Buku kas hanya bertambah; saldo SELALU dihitung dari barisnya. Nominal bertanda: masuk +, keluar -.
export type Jenis = 'LACI' | 'BANK' | 'KAS_BESAR' | 'TRANSIT';
export type Akun = { id: string; id_usaha: string; id_cabang: string; nama: string; jenis: Jenis; saldo_awal: number; tgl_saldo_awal: string }; // saldo_awal = saldo di AWAL hari tgl_saldo_awal
export type Kategori = { id: string; nama: string; arah: 'MASUK' | 'KELUAR' | 'INTERNAL'; aktivitas: 'OPERASI' | 'INVESTASI' | 'PENDANAAN' | 'TRANSFER'; beban: boolean; kode_akun: string }; // kode_akun kosong dulu: bahan jurnal nanti
export type Baris = { id: string; tgl: string; id_akun: string; amt: number; id_kategori: string; id_transfer: string; ref: string; ket: string };
export type Beban = { id: string; tgl: string; id_usaha: string; id_cabang: string; id_kategori: string; id_akun: string; jumlah: number; pihak: string; ket: string };
type Hasil<T> = { ok: true; data: T; peringatan: string[] } | { ok: false; error: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
const ISO = /^\d{4}-\d\d-\d\d$/;
const hariSebelum = (iso: string) => new Date(Date.parse(iso) - 864e5).toISOString().slice(0, 10);
const boleMinus = (j: Jenis) => j === 'BANK'; // saldo bank di aplikasi bisa tertinggal dari bank asli; laci/kas besar tidak boleh minus

export function saldoAkun(a: Akun, baris: Baris[], sampai?: string): number {
  return r2(a.saldo_awal + baris.filter(b => b.id_akun === a.id && b.tgl >= a.tgl_saldo_awal && (!sampai || b.tgl <= sampai)).reduce((s, b) => s + b.amt, 0));
}
export function buatTransfer(p: { id: string; tgl: string; dari: Akun; ke: Akun; jumlah: number; saldoDari: number; kategori: Kategori; ref?: string; ket?: string }): Hasil<[Baris, Baris]> {
  const { id, tgl, dari, ke, kategori } = p, j = r2(p.jumlah);
  if (!ISO.test(tgl)) return { ok: false, error: 'Tanggal tidak valid.' };
  if (!(j > 0)) return { ok: false, error: 'Jumlah harus lebih dari 0.' };
  if (dari.id === ke.id) return { ok: false, error: 'Akun asal dan tujuan sama.' };
  if (dari.id_usaha !== ke.id_usaha) return { ok: false, error: 'Transfer antar usaha belum didukung.' };
  if (kategori.arah !== 'INTERNAL') return { ok: false, error: 'Kategori transfer harus bertipe INTERNAL.' };
  const peringatan: string[] = [];
  if (r2(p.saldoDari) < j) { if (!boleMinus(dari.jenis)) return { ok: false, error: `Saldo ${dari.nama} tidak cukup (${p.saldoDari}).` }; peringatan.push(`Saldo ${dari.nama} akan minus.`); }
  const dasar = { tgl, id_kategori: kategori.id, id_transfer: id, ref: p.ref ?? '', ket: p.ket ?? '' };
  return { ok: true, peringatan, data: [{ ...dasar, id: id + '-K', id_akun: dari.id, amt: -j }, { ...dasar, id: id + '-M', id_akun: ke.id, amt: j }] };
}
export function bebanKeKas(b: Beban, akun: Akun, kategori: Kategori, saldo: number): Hasil<Baris> {
  const j = r2(b.jumlah);
  if (!ISO.test(b.tgl)) return { ok: false, error: 'Tanggal tidak valid.' };
  if (!(j > 0)) return { ok: false, error: 'Jumlah harus lebih dari 0.' };
  if (!kategori.beban || kategori.arah !== 'KELUAR') return { ok: false, error: 'Kategori bukan kategori beban.' };
  if (akun.id_usaha !== b.id_usaha) return { ok: false, error: 'Akun kas milik usaha lain.' };
  if (akun.id_cabang && akun.id_cabang !== b.id_cabang) return { ok: false, error: 'Akun kas milik cabang lain.' };
  const peringatan: string[] = [];
  if (r2(saldo) < j) { if (!boleMinus(akun.jenis)) return { ok: false, error: `Saldo ${akun.nama} tidak cukup (${saldo}).` }; peringatan.push(`Saldo ${akun.nama} akan minus.`); }
  return { ok: true, peringatan, data: { id: b.id + '-K', tgl: b.tgl, id_akun: akun.id, amt: -j, id_kategori: kategori.id, id_transfer: '', ref: b.id, ket: [b.pihak, b.ket].filter(Boolean).join(' · ') } };
}
// Arus kas metode langsung untuk SATU usaha (semua cabangnya digabung). Transfer internal tidak menggelembungkan masuk/keluar.
export function arusKas(p: { akun: Akun[]; baris: Baris[]; kategori: Kategori[]; id_usaha: string; dari: string; sampai: string }) {
  const A = p.akun.filter(a => a.id_usaha === p.id_usaha), ids = new Set(A.map(a => a.id)), K = new Map(p.kategori.map(k => [k.id, k]));
  const awalHari = hariSebelum(p.dari), akunLama = A.filter(a => a.tgl_saldo_awal <= p.dari), akunBaru = A.filter(a => a.tgl_saldo_awal > p.dari && a.tgl_saldo_awal <= p.sampai);
  const W = p.baris.filter(b => ids.has(b.id_akun) && b.tgl >= p.dari && b.tgl <= p.sampai && b.tgl >= A.find(a => a.id === b.id_akun)!.tgl_saldo_awal);
  const grup = new Map<string, { id_kategori: string; nama: string; aktivitas: string; masuk: number; keluar: number }>(); let internal = 0;
  for (const b of W) {
    const k = K.get(b.id_kategori); if (!k) throw new Error('Kategori tidak dikenal: ' + b.id_kategori);
    if (k.arah === 'INTERNAL') { internal = r2(internal + b.amt); continue; }
    const g = grup.get(k.id) ?? { id_kategori: k.id, nama: k.nama, aktivitas: k.aktivitas, masuk: 0, keluar: 0 };
    if (b.amt > 0) g.masuk = r2(g.masuk + b.amt); else g.keluar = r2(g.keluar - b.amt); grup.set(k.id, g);
  }
  const rows = [...grup.values()], tot = (f: 'masuk' | 'keluar') => r2(rows.reduce((s, g) => s + g[f], 0));
  const saldoAwal = r2(akunLama.reduce((s, a) => s + saldoAkun(a, p.baris, awalHari), 0)), saldoAkhir = r2(A.filter(a => a.tgl_saldo_awal <= p.sampai).reduce((s, a) => s + saldoAkun(a, p.baris, p.sampai), 0));
  const akunBaruNilai = r2(akunBaru.reduce((s, a) => s + a.saldo_awal, 0)), bersih = r2(tot('masuk') - tot('keluar'));
  const perAktivitas: Record<string, { masuk: number; keluar: number; bersih: number }> = {};
  for (const g of rows) { const x = (perAktivitas[g.aktivitas] ??= { masuk: 0, keluar: 0, bersih: 0 }); x.masuk = r2(x.masuk + g.masuk); x.keluar = r2(x.keluar + g.keluar); x.bersih = r2(x.masuk - x.keluar); }
  // cocok = pemeriksaan sendiri: saldo awal + arus bersih + akun baru = saldo akhir, dan transfer internal saling meniadakan
  return { rows, perAktivitas, totalMasuk: tot('masuk'), totalKeluar: tot('keluar'), bersih, saldoAwal, saldoAkhir, akunBaruNilai, internalSelisih: internal, cocok: r2(saldoAwal + bersih + akunBaruNilai) === saldoAkhir && internal === 0 };
}
