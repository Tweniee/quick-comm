import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { config } from './config';

function key(): Buffer {
  return createHash('sha256').update(config.encryptionKey).digest();
}

/** AES-256-GCM. Output: base64(iv|tag|ciphertext) */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decrypt(blob: string): string {
  const buf = Buffer.from(blob, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function hmacSha256(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

export function numericCode(digits: number): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, '0');
}

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function orderCode(): string {
  let s = '';
  for (let i = 0; i < 7; i++) s += ALPHABET[randomInt(0, ALPHABET.length)];
  return `TW-${s}`;
}

export function maskPhone(p?: string | null): string | null {
  if (!p) return null;
  return p.length >= 4 ? `${'X'.repeat(Math.max(0, p.length - 4))}${p.slice(-4)}` : 'XXXX';
}
