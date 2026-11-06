// Pencocokan mutasi bank (kiri) dengan baris buku kas (kanan), per satu akun. Murni. Nominal bertanda: masuk +, keluar -.
export type Mutasi = { id: string; tgl: string; amt: number; ref?: string; bukti?: string; ket?: string };
export type Buku = { id: string; tgl: string; amt: number; ref?: string; ket?: string };
export type Cocok = { mutasi: string; buku: string[] };
const c2 = (n: number) => Math.round(n * 100);
const hari = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function kandidat(m: Mutasi, buku: Buku[], dipakai: ReadonlySet<string>, jendela = 7): Buku[] {
  return buku.filter(b => !dipakai.has(b.id) && c2(b.amt) === c2(m.amt) && Math.abs(hari(b.tgl, m.tgl)) <= jendela)
    .sort((a, b) => Math.abs(hari(a.tgl, m.tgl)) - Math.abs(hari(b.tgl, m.tgl)) || a.id.localeCompare(b.id));
}
// Hanya pasangan yang TIDAK ambigu: satu mutasi punya tepat satu kandidat dan kandidat itu tidak direbut mutasi lain.
// Bila kandidat banyak, nomor referensi/bukti yang sama bisa menjadi penentu. Sisanya ditinjau manual.
export function autoCocok(mutasi: Mutasi[], buku: Buku[], dipakai: ReadonlySet<string> = new Set(), jendela = 7): Cocok[] {
  const cand = new Map<string, Buku[]>();
  for (const m of mutasi) {
    let c = kandidat(m, buku, dipakai, jendela);
    if (c.length > 1) { const k = c.filter(b => b.ref && (b.ref === m.ref || b.ref === m.bukti)); if (k.length === 1) c = k; }
    cand.set(m.id, c);
  }
  const rebut = new Map<string, number>(); cand.forEach(c => c.forEach(b => rebut.set(b.id, (rebut.get(b.id) ?? 0) + 1)));
  return mutasi.filter(m => cand.get(m.id)!.length === 1 && rebut.get(cand.get(m.id)![0].id) === 1).map(m => ({ mutasi: m.id, buku: [cand.get(m.id)![0].id] }));
}
// Pencocokan manual 1-ke-banyak: jumlah baris buku harus sama persis dengan mutasi.
export function cekManual(m: Mutasi, dipilih: Buku[], dipakai: ReadonlySet<string>): string | null {
  if (!dipilih.length) return 'Pilih minimal satu transaksi buku.';
  if (new Set(dipilih.map(b => b.id)).size !== dipilih.length) return 'Ada transaksi buku yang dipilih dua kali.';
  if (dipilih.some(b => dipakai.has(b.id))) return 'Ada transaksi buku yang sudah dicocokkan.';
  const s = r2(dipilih.reduce((a, b) => a + b.amt, 0));
  return c2(s) === c2(m.amt) ? null : `Jumlah tidak sama: bank ${m.amt}, buku ${s}, selisih ${r2(m.amt - s)}.`;
}
export function laporan(mutasi: Mutasi[], buku: Buku[], cocok: Cocok[]) {
  const B = new Map(buku.map(b => [b.id, b])), M = new Map(mutasi.map(m => [m.id, m])), pakai = new Set<string>(), sah = new Set<string>();
  for (const c of cocok) { // hanya yang masih sah: mutasi ada, buku ada, tidak dipakai ganda, jumlah sama
    const m = M.get(c.mutasi), bs = c.buku.map(id => B.get(id));
    if (m && bs.length && bs.every(b => b && !pakai.has(b.id)) && c2(bs.reduce((a, b) => a + b!.amt, 0)) === c2(m.amt)) { sah.add(m.id); c.buku.forEach(id => pakai.add(id)); }
  }
  const belumBank = mutasi.filter(m => !sah.has(m.id)), belumBuku = buku.filter(b => !pakai.has(b.id));
  const net = (l: { amt: number }[]) => r2(l.reduce((a, x) => a + x.amt, 0)), selisih = r2(net(belumBank) - net(belumBuku));
  // Bila semua sisa sama-sama kosong, rekening dan buku seimbang. selisih = bank - buku untuk periode ini; kosong+0 = target nol.
  return { belumBank, belumBuku, selisih, seimbang: !belumBank.length && !belumBuku.length, cocokSah: sah.size };
}
