import { secret } from "./secrets.ts";

const enc = new TextEncoder();

const toHex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) =>
  Uint8Array.from(h.match(/.{2}/g)!.map((x) => parseInt(x, 16)));
const b64u = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function pbkdf2(pin: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations: 100_000 },
    key,
    256,
  );
  return toHex(bits);
}

export async function hashPin(pin: string): Promise<{ salt: string; hash: string }> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await pbkdf2(pin, salt) };
}

export async function verifyPin(pin: string, salt: string, hash: string): Promise<boolean> {
  return safeEqual(await pbkdf2(pin, salt), hash);
}

async function hmacKey() {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(await secret("TOKEN_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Session token: base64url("memberId.expiryMs") + "." + base64url(HMAC). Valid 90 days. */
export async function signToken(memberId: string): Promise<string> {
  const payload = `${memberId}.${Date.now() + 90 * 864e5}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(payload));
  return `${b64u(enc.encode(payload))}.${b64u(sig)}`;
}

/** Returns the member id for a valid, unexpired token, otherwise null. */
export async function verifyToken(token: string | null): Promise<string | null> {
  if (!token) return null;
  try {
    const [p, s] = token.split(".");
    const payload = new TextDecoder().decode(fromB64u(p));
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), fromB64u(s), enc.encode(payload));
    if (!ok) return null;
    const [id, exp] = payload.split(".");
    return Number(exp) > Date.now() ? id : null;
  } catch {
    return null;
  }
}
