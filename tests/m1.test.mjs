// Tes M1 tanpa dependensi baru: node --test tests/   (Node 22+; memuat M1.gs + getAuthPepper_/computeHmac_ ASLI dari Code_ERP.gs ke sandbox dengan tiruan layanan Google)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pbkdf2Hex, randomSaltHex } from '../src/authM1.ts';

const erp = fs.readFileSync(new URL('../Code_ERP.gs', import.meta.url), 'utf8');
const m1 = fs.readFileSync(new URL('../M1.gs', import.meta.url), 'utf8');
const auth = erp.match(/function getAuthPepper_\(\)[\s\S]*?\n}\n\s*\/\*\*[\s\S]*?\*\/\s*function computeHmac_\([\s\S]*?\n}\n/);
assert.ok(auth, 'getAuthPepper_/computeHmac_ tidak ditemukan di Code_ERP.gs');

const j = x => JSON.parse(JSON.stringify(x));
const signed = buf => Array.from(buf, b => (b > 127 ? b - 256 : b)); // GAS mengembalikan byte bertanda

class Sheet {
  constructor() { this.rows = []; }
  getLastRow() { for (let i = this.rows.length; i > 0; i--) if ((this.rows[i - 1] || []).some(v => v !== '' && v != null)) return i; return 0; }
  getLastColumn() { let m = 0; this.rows.forEach(r => (r || []).forEach((v, i) => { if (v !== '' && v != null) m = Math.max(m, i + 1); })); return m; }
  getMaxRows() { return 1000; }
  getRange(r, c, nr = 1, nc = 1) {
    const s = this;
    return {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, k) => (s.rows[r - 1 + i] || [])[c - 1 + k] ?? '')),
      setValues(v) { v.forEach((row, i) => row.forEach((x, k) => { (s.rows[r - 1 + i] ||= [])[c - 1 + k] = x; })); return this; },
      setNumberFormat(f) { s.fmt = f; return this; }, setFontWeight() { return this; }
    };
  }
  deleteRow(r) { this.rows.splice(r - 1, 1); }
  setFrozenRows() {}
}

function makeCtx() {
  const sheets = new Map(), props = new Map(), cache = new Map(), T = { now: Date.UTC(2026, 10, 5, 0, 0, 0) };
  let locked = false;
  const ctx = vm.createContext({
    __sheets: sheets, __props: props, __cache: cache, __T: T, console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets.get(n) || null, insertSheet: n => { const s = new Sheet(); sheets.set(n, s); return s; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => (locked ? false : (locked = true)), waitLock: () => { if (locked) throw new Error('KUNCI BERSARANG'); locked = true; }, releaseLock: () => { locked = false; } }) }, // penyarangan kunci = gagal
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v), deleteProperty: k => props.delete(k) }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (a, s) => signed(crypto.createHash('sha256').update(s, 'utf8').digest()),
      computeHmacSha256Signature: (m, k) => signed(crypto.createHmac('sha256', k).update(m, 'utf8').digest()),
      formatDate: d => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 19).replace('T', ' ') // WITA
    }
  });
  vm.runInContext(auth[0] + '\n' + m1, ctx);
  ctx.m1Now_ = () => T.now;
  return ctx;
}
const ev = (ctx, e) => vm.runInContext(e, ctx);
const ENV = ctx => ctx.__props.set('ENV', 'test');
const pre = pw => crypto.createHash('sha256').update(pw).digest('hex'); // stand-in hasil PBKDF2 klien (64 hex)
const text = ctx => [...ctx.__sheets.values()].map(s => JSON.stringify(s.rows)).join('\n');
const snap = ctx => JSON.stringify([...ctx.__sheets].map(([n, s]) => [n, s.rows]));

// dunia uji: 2 usaha, 3 cabang, tab bisnis uji, 4 pengguna
function world() {
  const ctx = makeCtx(); ENV(ctx);
  const S = ev(ctx, 'M1_SCHEMA'), STD = ev(ctx, 'M1_STD');
  S.Barang = { bisnis: true, pemilik: 'cabang', rahasia: { hpp: 'hpp.lihat' }, cols: ['id', 'id_usaha', 'id_cabang', 'nama', 'hpp', ...STD] };
  S.Produk = { bisnis: true, pemilik: 'usaha', cols: ['id', 'id_usaha', 'id_cabang', 'nama', ...STD] };
  ctx.m1Setup();
  const add = (t, o) => ctx.m1Add_(t, o);
  add('Usaha', { id: 'U1', kode: 'U1', nama: 'Usaha 1', aktif: '1' }); add('Usaha', { id: 'U2', kode: 'U2', nama: 'Usaha 2', aktif: '1' });
  add('Cabang', { id: 'A', id_usaha: 'U1', kode: 'A', nama: 'Cabang A', aktif: '1' }); add('Cabang', { id: 'B', id_usaha: 'U1', kode: 'B', nama: 'Cabang B', aktif: '1' });
  add('Cabang', { id: 'C', id_usaha: 'U2', kode: 'C', nama: 'Cabang C', aktif: '1' }); add('Cabang', { id: 'X', id_usaha: 'U1', kode: 'X', nama: 'Tutup', aktif: '0' });
  const mk = (username, peran, u = '', c = '', extra = {}) => {
    const salt = crypto.randomBytes(16).toString('hex');
    add('Pengguna', { id: 'id-' + username, username, nama: username, aktif: '1', pw_salt: salt, pw_hash: ctx.computeHmac_(salt, pre('pw-' + username)), wajib_ganti: '0', gagal_count: '0', ...extra });
    add('AksesUser', { id: 'ak-' + username, id_user: 'id-' + username, peran, id_usaha: u, id_cabang: c, aktif: '1' });
  };
  mk('staf.a', 'Staf Cabang', 'U1', 'A'); mk('admin.u1', 'Admin Usaha', 'U1'); mk('super', 'Superadmin'); mk('eksekutif', 'Eksekutif');
  const login = (u, pw = 'pw-' + u) => ctx.m1Login(u, pre(pw));
  const sesi = u => ctx.m1Sesi_(login(u).token);
  return { ctx, add, login, sesi, S };
}

// ---------------- M1-1 ----------------
test('M1-1: header persis skema, idempoten, tab lama tidak tersentuh, ENV wajib test', () => {
  const ctx = makeCtx();
  assert.throws(() => ctx.m1Setup(), /ENV=test/);
  ENV(ctx);
  const legacy = new Sheet(); legacy.rows = [['email', 'nama', 'role', 'pin'], ['a@x', 'A', 'Admin', 'h']]; ctx.__sheets.set('Users', legacy);
  const before = JSON.stringify(legacy.rows);
  ctx.m1Setup();
  const S = j(ev(ctx, 'M1_SCHEMA'));
  for (const [tab, d] of Object.entries(S)) assert.deepEqual(ctx.__sheets.get(tab).rows[0], d.cols, tab);
  assert.equal(JSON.stringify(legacy.rows), before, 'tab Users lama berubah');
  assert.ok(!ctx.__sheets.has('Pengguna') === false);
  const s1 = snap(ctx); ctx.m1Setup(); assert.equal(snap(ctx), s1, 'setup kedua mengubah data');
});
test('M1-1: header berbeda pada tab yang sudah ada = tolak SEMUA, tidak ada tab dibuat', () => {
  const ctx = makeCtx(); ENV(ctx);
  const bad = new Sheet(); bad.rows = [['id', 'nama', 'beda']]; ctx.__sheets.set('Cabang', bad);
  assert.throws(() => ctx.m1Setup(), /header berbeda/);
  assert.deepEqual([...ctx.__sheets.keys()], ['Cabang']);
  assert.deepEqual(bad.rows, [['id', 'nama', 'beda']]);
});

// ---------------- M1-2 ----------------
test('M1-2: staf cabang A hanya menerima baris A; id dari sesi; payload cabang B ditolak', () => {
  const { ctx, sesi, login } = world();
  const adm = ctx.rows_('Barang', sesi('super'));
  adm.add({ id_cabang: 'A', nama: 'Gula', hpp: '100' }, 'pos.jual'); adm.add({ id_cabang: 'B', nama: 'Beras', hpp: '200' }, 'pos.jual');
  const s = sesi('staf.a'), r = ctx.rows_('Barang', s);
  assert.deepEqual(j(r.list()).map(x => x.nama), ['Gula']);
  const made = r.add({ nama: 'Teh' }, 'pos.jual'); // cabang diturunkan dari sesi
  assert.equal(made.id_cabang, 'A'); assert.equal(made.id_usaha, 'U1'); assert.equal(made.dibuat_oleh, 'id-staf.a');
  assert.throws(() => r.add({ id_cabang: 'B', nama: 'x' }, 'pos.jual'), /FORBIDDEN/);
  assert.throws(() => r.add({ id_usaha: 'U2', nama: 'x' }, 'pos.jual'), /FORBIDDEN/);
  assert.throws(() => r.add({ id_cabang: 'C', nama: 'x' }, 'pos.jual'), /FORBIDDEN/);
});
test('M1-2: kolom asing, kolom server, cabang nonaktif, aksi di luar peran, tab non-bisnis ditolak', () => {
  const { ctx, sesi } = world(), s = sesi('staf.a'), r = ctx.rows_('Barang', s);
  assert.throws(() => r.add({ nama: 'x', hargaX: '1' }, 'pos.jual'), /Kolom tidak dikenal: hargaX/);
  assert.throws(() => r.add({ nama: 'x', id: 'palsu' }, 'pos.jual'), /diisi server/);
  assert.throws(() => r.add({ nama: 'x', dibuat_oleh: 'orang-lain' }, 'pos.jual'), /diisi server/);
  assert.throws(() => ctx.rows_('Barang', sesi('super')).add({ id_cabang: 'X', nama: 'x' }, 'pos.jual'), /Cabang tidak valid/);
  assert.throws(() => sesi('admin.u1') && ctx.rows_('Barang', sesi('admin.u1')).add({ id_cabang: 'A', nama: 'x' }, 'pos.jual'), /FORBIDDEN/, 'admin usaha tidak menulis dokumen cabang (DEC-24)');
  assert.throws(() => ctx.rows_('Pengguna', s), /bukan tab bisnis/);
  assert.throws(() => ctx.rows_('Sesi', s), /bukan tab bisnis/);
});
test('M1-2: dokumen milik usaha: admin usaha menulis, staf cabang tidak, id_cabang dilarang', () => {
  const { ctx, sesi } = world();
  const made = ctx.rows_('Produk', sesi('admin.u1')).add({ nama: 'SKU1' }, 'produk.kelola');
  assert.equal(made.id_usaha, 'U1'); assert.equal(made.id_cabang, '');
  assert.throws(() => ctx.rows_('Produk', sesi('staf.a')).add({ nama: 'x' }, 'produk.kelola'), /FORBIDDEN|wajib dipilih/);
  assert.throws(() => ctx.rows_('Produk', sesi('admin.u1')).add({ nama: 'x', id_cabang: 'A' }, 'produk.kelola'), /tidak boleh membawa id_cabang/);
  assert.throws(() => ctx.rows_('Produk', sesi('admin.u1')).add({ nama: 'x', id_usaha: 'U2' }, 'produk.kelola'), /FORBIDDEN/);
});

// ---------------- M1-4 ----------------
test('M1-4: Staf Cabang tidak menerima kolom HPP; Admin Usaha, Eksekutif menerima; Eksekutif tidak bisa menulis', () => {
  const { ctx, sesi } = world();
  ctx.rows_('Barang', sesi('super')).add({ id_cabang: 'A', nama: 'Gula', hpp: '100' }, 'pos.jual');
  assert.ok(!('hpp' in j(ctx.rows_('Barang', sesi('staf.a')).list())[0]));
  assert.equal(j(ctx.rows_('Barang', sesi('admin.u1')).list())[0].hpp, '100');
  assert.equal(j(ctx.rows_('Barang', sesi('eksekutif')).list())[0].hpp, '100');
  for (const aksi of ['pos.jual', 'produk.kelola', 'po.kelola', 'user.kelola']) assert.throws(() => ctx.rows_('Barang', sesi('eksekutif')).add({ id_cabang: 'A', nama: 'x' }, aksi), /FORBIDDEN/, aksi);
});
test('M1-4: tabel aksi x peran x cakupan sesuai matriks docs/02-data-org-auth.md', () => {
  const { ctx } = world();
  const R = ['Superadmin', 'Eksekutif', 'Akunting Umum', 'Admin Usaha', 'Staf Cabang'];
  // L/U = boleh, '-' = tidak. Urutan kolom = R. Ditulis ulang dari matriks, bukan disalin dari PERMS.
  const M = {
    'transaksi.lihat': 'LLLLL', 'hpp.lihat': 'LLLL-', 'pos.jual': 'U---U', 'pos.void': 'U---U', 'so.void_retur': 'U---U', 'permintaan.buat': 'U---U',
    'barang.terima': 'U---U', 'piutang.lunasi': 'U---U', 'transfer.kirim_terima': 'U---U', 'opname.hitung': 'U---U', 'barang_cabang.aktif': 'U--U-',
    'po.kelola': 'U--U-', 'produk.kelola': 'U--U-', 'akun_kas.kelola': 'U--U-', 'saldo_bank.lihat': 'U--U-', 'user.kelola': 'U--U-', 'struktur.kelola': 'U----'
  };
  assert.deepEqual(Object.keys(M).sort(), Object.keys(j(ev(ctx, 'PERMS'))).sort(), 'ada aksi tanpa baris uji');
  const inA = { id_usaha: 'U1', id_cabang: 'A' }, inU = { id_usaha: 'U1', id_cabang: '' };
  for (const [aksi, row] of Object.entries(M)) R.forEach((peran, i) => {
    const want = row[i] !== '-';
    // cakupan: semua usaha / usaha U1 / cabang A di U1; pemilik uji ada di dalam dan di luar
    const sc = { all: { id_usaha: '', id_cabang: '' }, usaha: { id_usaha: 'U1', id_cabang: '' }, cab: { id_usaha: 'U1', id_cabang: 'A' } };
    const ok = k => ctx.can_({ akses: [{ peran, ...sc[k] }] }, aksi, k === 'cab' ? inA : inU);
    assert.equal(ok('all'), want, `${aksi}/${peran}/semua`);
    if (want) assert.equal(ctx.can_({ akses: [{ peran, ...sc.usaha }] }, aksi, inA), true, `${aksi}/${peran}/usaha>cabang`);
    assert.equal(ctx.can_({ akses: [{ peran, ...sc.usaha }] }, aksi, { id_usaha: 'U2', id_cabang: '' }), false, `${aksi}/${peran}/usaha lain`);
    assert.equal(ctx.can_({ akses: [{ peran, ...sc.cab }] }, aksi, { id_usaha: 'U1', id_cabang: 'B' }), false, `${aksi}/${peran}/cabang lain`);
    assert.equal(ctx.can_({ akses: [{ peran, ...sc.cab }] }, aksi, inU), false, `${aksi}/${peran}/cabang tidak menjangkau dokumen usaha`);
  });
  assert.throws(() => ctx.can_({ akses: [] }, 'aksi.ngawur', inA), /tidak dikenal/);
  assert.equal(ctx.can_(null, 'pos.jual', inA), false);
  assert.equal(ctx.can_({ akses: [{ peran: 'Superadmin', id_usaha: '', id_cabang: '' }, { peran: 'Staf Cabang', id_usaha: 'U1', id_cabang: 'A' }] }, 'pos.jual', { id_usaha: 'U2', id_cabang: 'C' }), true, 'gabungan akses');
});
test('M1-4: AksesUser kedaluwarsa / nonaktif / peran ngawur / cakupan cacat diabaikan', () => {
  const { ctx, add, login } = world();
  add('Pengguna', { id: 'q', username: 'qq.user', aktif: '1', pw_salt: 'a'.repeat(32), pw_hash: ctx.computeHmac_('a'.repeat(32), pre('x')), wajib_ganti: '0', gagal_count: '0' });
  add('AksesUser', { id: 'q1', id_user: 'q', peran: 'Superadmin', aktif: '1', berlaku_sampai: '2026-11-04' }); // kemarin
  add('AksesUser', { id: 'q2', id_user: 'q', peran: 'Superadmin', aktif: '0' });
  add('AksesUser', { id: 'q3', id_user: 'q', peran: 'Raja', aktif: '1' });
  add('AksesUser', { id: 'q4', id_user: 'q', peran: 'Admin Usaha', aktif: '1', id_usaha: '', id_cabang: 'A' }); // cabang tanpa usaha
  add('AksesUser', { id: 'q5', id_user: 'q', peran: 'Staf Cabang', aktif: '1', id_usaha: 'U1', id_cabang: 'A', berlaku_sampai: '2026-11-05' }); // sampai hari ini: sah
  const t = ctx.m1Login('qq.user', pre('x')).token;
  assert.deepEqual(j(ctx.m1Sesi_(t).akses), [{ peran: 'Staf Cabang', id_usaha: 'U1', id_cabang: 'A' }]);
});

// ---------------- M1-3 ----------------
test('M1-3: login berhasil; respons gagal IDENTIK untuk salah-password, username tak dikenal, nonaktif, format buruk', () => {
  const { ctx, add } = world();
  add('Pengguna', { id: 'off', username: 'nonaktif', aktif: '0', pw_salt: 'b'.repeat(32), pw_hash: ctx.computeHmac_('b'.repeat(32), pre('pw')), gagal_count: '0' });
  const ok = ctx.m1Login('staf.a', pre('pw-staf.a')); assert.equal(ok.ok, true); assert.ok(ok.token.length >= 32);
  const fails = [ctx.m1Login('staf.a', pre('salah')), ctx.m1Login('tidak.ada', pre('apa saja')), ctx.m1Login('nonaktif', pre('pw')), ctx.m1Login('staf.a', 'bukan-hex'), ctx.m1Login(null, null), ctx.m1Login('A'.repeat(200), pre('x'))].map(j);
  fails.forEach(f => assert.deepEqual(f, fails[0]));
  assert.equal(fails[0].ok, false);
});
test('M1-3: salt username tak dikenal tampak sama bentuknya dan stabil', () => {
  const { ctx } = world(), a = j(ctx.m1Salt('staf.a')), g = j(ctx.m1Salt('hantu')), g2 = j(ctx.m1Salt('hantu'));
  assert.match(a.salt, /^[0-9a-f]{32}$/); assert.match(g.salt, /^[0-9a-f]{32}$/); assert.deepEqual(g, g2);
});
test('M1-3: kunci 5 gagal, respons terkunci sama dengan gagal biasa, bertahan setelah cache dikosongkan, berakhir 15 menit', () => {
  const { ctx } = world(), T = ctx.__T, bad = () => j(ctx.m1Login('staf.a', pre('salah')));
  const first = bad(); for (let i = 0; i < 4; i++) assert.deepEqual(bad(), first);
  ctx.__cache.clear();
  assert.deepEqual(j(ctx.m1Login('staf.a', pre('pw-staf.a'))), first, 'password BENAR ditolak saat terkunci, dengan respons sama');
  assert.equal(ev(ctx, "m1Read_('Pengguna')").find(u => u.username === 'staf.a').gagal_count, '5');
  T.now += 14 * 60e3; assert.equal(ctx.m1Login('staf.a', pre('pw-staf.a')).ok, false);
  T.now += 61e3; assert.equal(ctx.m1Login('staf.a', pre('pw-staf.a')).ok, true);
  assert.ok(ev(ctx, "m1Read_('AuditLog')").some(a => a.aksi === 'LOGIN_TERKUNCI'));
});
test('M1-3: 4 gagal lalu jeda >15 menit: hitungan mulai ulang', () => {
  const { ctx } = world(), T = ctx.__T;
  for (let i = 0; i < 4; i++) ctx.m1Login('staf.a', pre('salah'));
  T.now += 16 * 60e3; ctx.m1Login('staf.a', pre('salah'));
  assert.equal(ev(ctx, "m1Read_('Pengguna')").find(u => u.username === 'staf.a').gagal_count, '1');
  assert.equal(ctx.m1Login('staf.a', pre('pw-staf.a')).ok, true);
});
test('M1-3: pemulihan pemilik m1BukaKunci lewat Script Property, sekali pakai', () => {
  const { ctx } = world();
  for (let i = 0; i < 5; i++) ctx.m1Login('staf.a', pre('salah'));
  assert.equal(ctx.m1BukaKunci().ok, false);
  ctx.__props.set('M1_BUKA_KUNCI', 'staf.a'); assert.equal(ctx.m1BukaKunci().ok, true);
  assert.ok(!ctx.__props.has('M1_BUKA_KUNCI')); assert.equal(ctx.m1Login('staf.a', pre('pw-staf.a')).ok, true);
});
test('M1-3: token asli tidak pernah tersimpan (hanya SHA-256), password/hash tidak masuk AuditLog', () => {
  const { ctx } = world(), r = ctx.m1Login('staf.a', pre('pw-staf.a')), t = text(ctx);
  assert.ok(!t.includes(r.token) && !t.includes(r.token.replace(/-/g, '')));
  assert.ok(t.includes(crypto.createHash('sha256').update(r.token).digest('hex')));
  const audit = JSON.stringify(ev(ctx, "m1Read_('AuditLog')")); const u = ev(ctx, "m1Read_('Pengguna')").find(x => x.username === 'staf.a');
  assert.ok(!audit.includes(u.pw_hash) && !audit.includes(u.pw_salt) && !audit.includes(pre('pw-staf.a')));
});
test('M1-3: sesi kedaluwarsa (diam 12 jam, mutlak 7 hari), token acak/ngawur ditolak, logout mematikan sesi', () => {
  const { ctx } = world(), T = ctx.__T;
  let t = ctx.m1Login('staf.a', pre('pw-staf.a')).token;
  T.now += 11 * 3600e3; ctx.m1Sesi_(t); // aktif di jam ke-11 -> geser terakhir_aktif
  T.now += 11 * 3600e3; ctx.m1Sesi_(t);
  T.now += 13 * 3600e3; assert.throws(() => ctx.m1Sesi_(t), /UNAUTHORIZED/);
  t = ctx.m1Login('staf.a', pre('pw-staf.a')).token;
  for (let d = 0; d < 7; d++) { T.now += 11 * 3600e3; ctx.m1Sesi_(t); T.now += 11 * 3600e3; ctx.m1Sesi_(t); } // aktif terus: 154 jam
  T.now += 11 * 3600e3; ctx.m1Sesi_(t);                                                                  // 165 jam < 168 jam: masih sah
  T.now += 4 * 3600e3; assert.throws(() => ctx.m1Sesi_(t), /UNAUTHORIZED/, 'batas mutlak 7 hari');
  for (const bad of ['', 'x', null, undefined, 123, {}, 'a'.repeat(40), 'z'.repeat(500)]) assert.throws(() => ctx.m1Sesi_(bad), /UNAUTHORIZED/);
  const t2 = ctx.m1Login('staf.a', pre('pw-staf.a')).token; ctx.m1Sesi_(t2);
  assert.deepEqual(j(ctx.m1Logout(t2)), { ok: true }); assert.throws(() => ctx.m1Sesi_(t2), /UNAUTHORIZED/);
  assert.deepEqual(j(ctx.m1Logout('x')), { ok: true });
});
test('M1-3: pengguna dinonaktifkan atau dicabut aksesnya langsung berlaku di sesi yang sedang berjalan', () => {
  const { ctx } = world(), t = ctx.m1Login('staf.a', pre('pw-staf.a')).token;
  assert.equal(ctx.m1Sesi_(t).akses.length, 1);
  const a = ev(ctx, "m1Read_('AksesUser')").find(x => x.id === 'ak-staf.a'); a.aktif = '0'; ctx.m1Put_('AksesUser', a);
  assert.equal(ctx.m1Sesi_(t).akses.length, 0);
  const u = ev(ctx, "m1Read_('Pengguna')").find(x => x.username === 'staf.a'); u.aktif = '0'; ctx.m1Put_('Pengguna', u);
  assert.throws(() => ctx.m1Sesi_(t), /UNAUTHORIZED/);
});
test('M1-3: wajib_ganti memblokir semua kecuali ganti password; ganti password mematikan sesi lain', () => {
  const { ctx } = world();
  const u = ev(ctx, "m1Read_('Pengguna')").find(x => x.username === 'staf.a'); u.wajib_ganti = '1'; ctx.m1Put_('Pengguna', u);
  const l1 = ctx.m1Login('staf.a', pre('pw-staf.a')), l2 = ctx.m1Login('staf.a', pre('pw-staf.a'));
  assert.equal(l1.wajibGanti, true);
  assert.throws(() => ctx.m1Sesi_(l1.token), /Ganti password/);
  const salt = 'c'.repeat(32), baru = pre('password-baru-123');
  assert.equal(ctx.m1GantiPassword(l1.token, pre('SALAH'), salt, baru).ok, false);
  assert.throws(() => ctx.m1GantiPassword(l1.token, 'bukan-hex', salt, baru), /Format/);
  assert.throws(() => ctx.m1GantiPassword(l1.token, pre('pw-staf.a'), 'pendek', baru), /Format/);
  assert.equal(ctx.m1GantiPassword(l1.token, pre('pw-staf.a'), salt, baru).ok, true);
  assert.equal(ctx.m1Sesi_(l1.token).username, 'staf.a');
  assert.throws(() => ctx.m1Sesi_(l2.token), /UNAUTHORIZED/, 'sesi lain harus mati');
  assert.equal(ctx.m1Login('staf.a', pre('pw-staf.a')).ok, false);
  assert.equal(ctx.m1Login('staf.a', baru).ok, true);
  assert.equal(ctx.m1Login('staf.a', baru).wajibGanti, false);
  assert.deepEqual(j(ctx.m1Salt('staf.a')), { salt });
});
test('M1-3: tebakan password lama lewat ganti-password ikut terkunci', () => {
  const { ctx, login } = world(), t = login('staf.a').token;
  for (let i = 0; i < 5; i++) ctx.m1GantiPassword(t, pre('tebak' + i), 'd'.repeat(32), pre('baru'));
  assert.equal(ctx.m1GantiPassword(t, pre('pw-staf.a'), 'd'.repeat(32), pre('baru')).ok, false);
  assert.equal(ctx.m1Login('staf.a', pre('pw-staf.a')).ok, false);
});
test('M1-3: login tidak menyarang kunci dan dua login berurutan tidak merusak data', () => {
  const { ctx } = world();
  for (let i = 0; i < 5; i++) assert.equal(ctx.m1Login('super', pre('pw-super')).ok, true);
  assert.equal(ev(ctx, "m1Read_('Sesi')").length, 5);
});

// ---------------- Superadmin awal ----------------
test('Setup awal: kode wajib, 5 salah = kode dihapus, password awal sekali, kode hangus', () => {
  const ctx = makeCtx(); ENV(ctx); ctx.m1Setup();
  assert.throws(() => ctx.m1BuatSuperadminAwal('apa', 'owner', 'Owner', ''), /Kode setup/);
  ctx.__props.set('M1_SETUP_CODE', 'kode-acak-panjang-1234567890');
  for (let i = 0; i < 5; i++) assert.throws(() => ctx.m1BuatSuperadminAwal('salah' + i, 'owner', 'Owner', ''), /Kode setup/);
  assert.ok(!ctx.__props.has('M1_SETUP_CODE'), 'kode harus dihapus setelah 5 tebakan salah');
  ctx.__props.set('M1_SETUP_CODE', 'kode-acak-panjang-1234567890');
  assert.throws(() => ctx.m1BuatSuperadminAwal('kode-acak-panjang-1234567890', 'Bad Name!', 'Owner', ''), /Username/);
  assert.equal(ctx.m1BuatSuperadminAwal('kode-acak-panjang-1234567890', 'owner', 'Owner', 'o@x.id').ok, true);
  assert.throws(() => ctx.m1BuatSuperadminAwal('kode-acak-panjang-1234567890', 'lain', 'Lain', ''), /Sudah ada pengguna/);
  assert.equal(ctx.m1Login('owner', pre('apa saja')).ok, false, 'belum punya password');
  const salt = 'e'.repeat(32), p = pre('rahasia-owner-1');
  assert.equal(ctx.m1PasswordAwal('salah', 'owner', salt, p).ok, false);
  assert.equal(ctx.m1PasswordAwal('kode-acak-panjang-1234567890', 'owner', salt, p).ok, true);
  assert.ok(!ctx.__props.has('M1_SETUP_CODE')); assert.equal(ctx.m1PasswordAwal('kode-acak-panjang-1234567890', 'owner', salt, pre('lain')).ok, false);
  const l = ctx.m1Login('owner', p); assert.equal(l.ok, true); assert.equal(l.wajibGanti, false);
  assert.deepEqual(j(ctx.m1Sesi_(l.token).akses), [{ peran: 'Superadmin', id_usaha: '', id_cabang: '' }]);
});

// ---------------- struktur ----------------
test('Tidak ada fungsi publik yang membaca/menulis tab per nama, atau mengubah AuditLog', () => {
  const pub = [...m1.matchAll(/^function ([A-Za-z0-9]+)\(([^)]*)\)/gm)].map(x => [x[1], x[2]]); // tanpa garis bawah = publik
  assert.deepEqual(pub.map(p => p[0]).sort(), ['can', 'm1BukaKunci', 'm1BuatSuperadminAwal', 'm1GantiPassword', 'm1Login', 'm1Logout', 'm1PasswordAwal', 'm1Salt', 'm1Setup'].filter(n => n !== 'can').sort());
  pub.forEach(([n, a]) => assert.ok(!/\b(tab|sheetName|name)\b/.test(a), n + ' menerima nama tab'));
  assert.ok(!/AuditLog['"]\s*,[^)]*\.(put|del|delete)/i.test(m1) && !/m1(Put|Del)_\('AuditLog'/.test(m1), 'AuditLog hanya boleh ditambah');
  assert.ok(!/getSheetByName\(/.test(m1.replace(/function m1Sheet_[\s\S]*?\n}\n/, '').replace(/function m1Setup[\s\S]*?\n}\n/, '')), 'akses Sheet di luar lapisan tab');
});
test('Klien: PBKDF2 64-hex, deterministik, salt acak 32-hex, salt buruk ditolak', async () => {
  const s = randomSaltHex(); assert.match(s, /^[0-9a-f]{32}$/);
  const a = await pbkdf2Hex('kata sandi panjang', s, 1000), b = await pbkdf2Hex('kata sandi panjang', s, 1000);
  assert.match(a, /^[0-9a-f]{64}$/); assert.equal(a, b); assert.notEqual(a, await pbkdf2Hex('kata sandi panjanG', s, 1000));
  assert.notEqual(a, await pbkdf2Hex('kata sandi panjang', randomSaltHex(), 1000));
  await assert.rejects(() => pbkdf2Hex('x', 'zz', 1000), /Salt/);
});
