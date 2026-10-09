import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export function seal(value: string, key: string, context: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url')).join('.');
}
export function unseal(value: string, key: string, context: string) {
  const parts = value.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted payload');
  const [iv, tag, data] = parts.map((part) => Buffer.from(part, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv!);
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(tag!);
  return Buffer.concat([cipher.update(data!), cipher.final()]).toString('utf8');
}
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret() {
  const bytes = randomBytes(20);
  let bits = 0,
    buffer = 0,
    result = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(buffer >>> bits) & 31];
    }
  }
  return result;
}
function decode(secret: string) {
  let bits = 0,
    buffer = 0;
  const bytes: number[] = [];
  for (const char of secret) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error('Invalid TOTP secret');
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
    }
  }
  return Buffer.from(bytes);
}
export function totp(secret: string, counter: bigint, digits = 6) {
  const value = Buffer.alloc(8);
  value.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', decode(secret)).update(value).digest(),
    offset = digest[19]! & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits)
    .toString()
    .padStart(digits, '0');
}
export function totpCounter(
  secret: string,
  code: string,
  last: bigint | null,
  now = Date.now(),
): bigint | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = BigInt(Math.floor(now / 30000));
  for (const offset of [0, -1, 1]) {
    const counter = current + BigInt(offset);
    if (counter < 0n || (last !== null && counter <= last)) continue;
    if (timingSafeEqual(Buffer.from(totp(secret, counter)), Buffer.from(code))) return counter;
  }
  return null;
}
