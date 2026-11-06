// Sisi browser untuk login M1 (DEC-33). Password tidak pernah dikirim: server menerima hasil PBKDF2 saja.
// Alur: salt = await m1Salt(username); pre = await pbkdf2Hex(password, salt); m1Login(username, pre).
// Ganti password: saltBaru = randomSaltHex(); baru = await pbkdf2Hex(passwordBaru, saltBaru); m1GantiPassword(token, lama, saltBaru, baru).

// DECISION-M1-03: 310.000 putaran (OWASP 2021 untuk PBKDF2-SHA256). Naikkan bila HP kasir kuat; harus sama di semua klien.
export const PBKDF2_ITER = 310_000;
// Server tidak bisa memeriksa panjang password (hanya melihat hash), jadi aturan minimal 10 karakter hanya bisa dipaksa di sini.
export const PASSWORD_MIN = 10;

const hex = (b: ArrayBuffer | Uint8Array): string => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
const unhex = (h: string): Uint8Array => Uint8Array.from(h.match(/../g) ?? [], x => parseInt(x, 16));

export const randomSaltHex = (): string => hex(crypto.getRandomValues(new Uint8Array(16)));

export async function pbkdf2Hex(password: string, saltHex: string, iterations: number = PBKDF2_ITER): Promise<string> {
  if (!/^[0-9a-f]{32}$/.test(saltHex)) throw new Error('Salt tidak valid.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations }, key, 256));
}
