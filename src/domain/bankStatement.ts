// Rekening koran (CSV) -> baris mutasi. Murni: tanpa DOM/Sheet. Dipakai klien untuk pratinjau; server MENGULANG validasi sebelum menyimpan.
// Kolom dipakai: tanggal, bukti (opsional), keterangan, referensi (opsional), debit, kredit. Kolom saldo diabaikan.
// Konvensi bank: KREDIT = uang masuk (+), DEBIT = uang keluar (-). Bila bank Anda terbalik, pakai arah:'buku'.
export type Field = 'tgl' | 'bukti' | 'ket' | 'ref' | 'debit' | 'kredit';
export type StmtLine = { tgl: string; bukti: string; ket: string; ref: string; amt: number; key: string };
export type ParseOptions = { kolom?: Partial<Record<Field, number>>; arah?: 'bank' | 'buku'; angka?: 'id' | 'en'; tanggal?: 'dmy' | 'mdy' };
export type ParseResult = {
  ok: boolean; error?: string; header: string[]; kolom: Partial<Record<Field, number>>; sep: string; angka: 'id' | 'en';
  lines: StmtLine[]; rejected: { baris: number; alasan: string }[]; skipped: number;
};

const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
const RX: Record<Field, RegExp> = {
  tgl: /^(tgl|tanggal|date|posting)/i, debit: /^(debit|debet|db\b|keluar|withdraw)/i, kredit: /^(kredit|credit|cr\b|masuk|deposit)/i,
  ref: /^(ref|referensi|reference|no\.?\s*ref)/i, bukti: /bukti|voucher|no\.?\s*trans/i, ket: /ket|uraian|desc|remark|narasi|berita|detail/i
};
const ORDER: Field[] = ['tgl', 'debit', 'kredit', 'ref', 'bukti', 'ket'];
const r2 = (n: number) => Math.round(n * 100) / 100;

export function splitCsv(text: string, sep: string): string[][] {
  const rows: string[][] = []; let r: string[] = [], c = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { r.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; r.push(c); c = ''; rows.push(r); r = []; }
    else c += ch;
  }
  if (c !== '' || r.length) { r.push(c); rows.push(r); }
  return rows;
}
function detectSep(text: string): string {
  const lines = text.split(/\r?\n/).filter(x => x.trim()).slice(0, 30);
  const score = (s: string) => lines.reduce((a, l) => a + l.split(s).length - 1, 0);
  return [';', '\t', ',', '|'].map(s => [s, score(s)] as const).sort((a, b) => b[1] - a[1])[0][0];
}
export function parseDate(raw: string, fmt: 'dmy' | 'mdy' = 'dmy'): string | null {
  const s = raw.trim(); let y: number, m: number, d: number, x: RegExpExecArray | null;
  if ((x = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D.*)?$/.exec(s))) { y = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = /^(\d{1,2})[-/. ]([A-Za-z]{3,})[-/. ,]*(\d{2,4})(?:\D.*)?$/.exec(s))) { m = MON[x[2].slice(0, 3).toLowerCase()] ?? 0; d = +x[1]; y = +x[3]; }
  else if ((x = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\D.*)?$/.exec(s))) { [d, m] = fmt === 'mdy' ? [+x[2], +x[1]] : [+x[1], +x[2]]; y = +x[3]; }
  else return null;
  if (y < 100) y += 2000;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null;
}
// null = sel kosong; NaN = ada isi tapi bukan angka.
export function parseAmount(raw: string, fmt: 'id' | 'en'): number | null {
  let s = raw.trim().replace(/^Rp\.?\s*/i, '').replace(/\s/g, '');
  if (s === '' || s === '-') return null;
  if (!/^-?[\d.,]+$/.test(s)) return NaN;
  s = fmt === 'id' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s); return Number.isFinite(n) ? r2(n) : NaN;
}
function detectAngka(cells: string[]): 'id' | 'en' {
  const t = (re: RegExp) => cells.filter(c => re.test(c.trim())).length;
  const idDec = t(/\d,\d{1,2}$/), enDec = t(/\d\.\d{1,2}$/);
  if (idDec !== enDec) return idDec > enDec ? 'id' : 'en';
  return t(/\d,\d{3}\b/) > t(/\d\.\d{3}\b/) ? 'en' : 'id';
}

export function parseStatement(text: string, o: ParseOptions = {}): ParseResult {
  const t = text.replace(/^\ufeff/, ''), sep = detectSep(t), rows = splitCsv(t, sep);
  const fail = (error: string, header: string[] = [], kolom = {}): ParseResult => ({ ok: false, error, header, kolom, sep, angka: 'id', lines: [], rejected: [], skipped: 0 });
  // Baris judul = baris yang memuat tanggal, debit, kredit (dikenali dari nama, atau dipilih manual lewat o.kolom); minimal satu harus dikenali dari nama.
  const FF: Field[] = ['tgl', 'debit', 'kredit'], hit = (r: string[], f: Field) => r.some(c => RX[f].test(c.trim()));
  const hi = rows.findIndex(r => FF.some(f => hit(r, f)) && FF.every(f => o.kolom?.[f] != null || hit(r, f)));
  if (hi < 0) return fail('Baris judul tidak ditemukan. Harus ada kolom tanggal, debit, dan kredit.');
  const header = rows[hi].map(c => c.trim()), kolom: Partial<Record<Field, number>> = {}, used = new Set<number>();
  for (const f of ORDER) { const i = o.kolom?.[f] ?? header.findIndex((h, j) => !used.has(j) && RX[f].test(h)); if (i >= 0) { kolom[f] = i; used.add(i); } }
  const miss = (['tgl', 'debit', 'kredit'] as Field[]).filter(f => kolom[f] == null);
  if (miss.length) return fail('Kolom tidak dikenali: ' + miss.join(', ') + '. Kolom yang ada: ' + header.join(' | '), header, kolom);
  const body = rows.slice(hi + 1), cell = (r: string[], f: Field) => (kolom[f] == null ? '' : r[kolom[f]!] ?? '').trim();
  const angka = o.angka ?? detectAngka(body.flatMap(r => [cell(r, 'debit'), cell(r, 'kredit')]));
  const lines: StmtLine[] = [], rejected: { baris: number; alasan: string }[] = [], seen = new Map<string, number>(); let skipped = 0;
  body.forEach((r, i) => {
    const baris = hi + 2 + i; if (r.every(c => c.trim() === '')) return;
    const dv = parseAmount(cell(r, 'debit'), angka), kv = parseAmount(cell(r, 'kredit'), angka);
    if (Number.isNaN(dv) || Number.isNaN(kv)) return void rejected.push({ baris, alasan: 'Nominal bukan angka' });
    if (!dv && !kv) return void skipped++; // tanpa pergerakan: saldo awal, total, catatan kaki
    if ((dv ?? 0) < 0 || (kv ?? 0) < 0) return void rejected.push({ baris, alasan: 'Nominal negatif' });
    if (dv && kv) return void rejected.push({ baris, alasan: 'Debit dan kredit sama-sama terisi' });
    const tgl = parseDate(cell(r, 'tgl'), o.tanggal);
    if (!tgl) return void rejected.push({ baris, alasan: 'Tanggal tidak valid: ' + cell(r, 'tgl') });
    const amt = r2(o.arah === 'buku' ? (dv ?? 0) - (kv ?? 0) : (kv ?? 0) - (dv ?? 0));
    const ket = cell(r, 'ket').replace(/\s+/g, ' '), ref = cell(r, 'ref'), bukti = cell(r, 'bukti');
    const base = [tgl, amt, ket.toUpperCase(), ref, bukti].join('|'), n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    lines.push({ tgl, bukti, ket, ref, amt, key: base + '#' + n }); // baris kembar dalam satu berkas tetap dibedakan
  });
  return { ok: true, header, kolom, sep, angka, lines, rejected, skipped };
}
// Impor ulang berkas yang sama (atau tumpang tindih) tidak menggandakan data.
export function pisahBaru(sudahAda: Iterable<string>, lines: StmtLine[]) {
  const ada = new Set(sudahAda); return { baru: lines.filter(l => !ada.has(l.key)), duplikat: lines.filter(l => ada.has(l.key)) };
}
