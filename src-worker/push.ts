import { Env, all, b64urlDecode, b64urlEncode } from "./util";

// Web Push (RFC 8030 + VAPID RFC 8292, payload encryption RFC 8291 "aes128gcm") on plain WebCrypto.
const enc = new TextEncoder();
const subtle = crypto.subtle;

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** Encrypt `plaintext` for one subscription: returns the full aes128gcm request body. */
export async function encryptPayload(uaPublic: Uint8Array, authSecret: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const curve = { name: "ECDH", namedCurve: "P-256" };
  const mine = (await subtle.generateKey(curve, true, ["deriveBits"])) as CryptoKeyPair;
  const myPublic = new Uint8Array((await subtle.exportKey("raw", mine.publicKey)) as ArrayBuffer);
  const theirs = await subtle.importKey("raw", uaPublic, curve, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: theirs } as any, mine.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, myPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aes = await subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // One record: the data followed by the 0x02 "last record" delimiter.
  const sealed = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = myPublic.length;
  return concat(header, myPublic, sealed);
}

/** `Authorization` header proving we are the app server the browser subscribed to. */
export async function vapidAuthorization(env: Env, endpoint: string): Promise<string> {
  const pub = b64urlDecode(env.VAPID_PUBLIC_KEY!);
  const key = await subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: env.VAPID_PRIVATE_KEY!, x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)) },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const part = (o: unknown) => b64urlEncode(enc.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || "mailto:admin@example.com",
  })}`;
  const sig = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

export type PushSub = { endpoint: string; p256dh: string; auth: string };

/** Send one push. Resolves to the push service's HTTP status (201 = accepted). */
export async function sendPush(env: Env, sub: PushSub, payload: { title: string; body: string; url?: string; tag?: string }): Promise<number> {
  const body = await encryptPayload(b64urlDecode(sub.p256dh), b64urlDecode(sub.auth), enc.encode(JSON.stringify(payload)));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(env, sub.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body,
    signal: AbortSignal.timeout(5000),
  });
  return res.status;
}

export const pushConfigured = (env: Env) => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

/** Push to every device a user has enabled. Never throws; dead subscriptions are removed. */
export async function pushToUser(env: Env, userId: number, title: string, message: string, url = "/", tag?: string) {
  const result = { sent: 0, failed: 0, devices: 0 };
  if (!pushConfigured(env)) return result;
  const subs = await all(env, "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=?", userId);
  result.devices = subs.length;
  const body = message.length > 240 ? message.slice(0, 237) + "…" : message;
  await Promise.all(subs.map(async (s) => {
    try {
      const status = await sendPush(env, { endpoint: String(s.endpoint), p256dh: String(s.p256dh), auth: String(s.auth) }, { title, body, url, tag });
      if (status >= 200 && status < 300) result.sent++;
      else {
        result.failed++;
        // 404/410: the device unsubscribed or uninstalled the app — stop sending to it.
        if (status === 404 || status === 410) await env.DB.prepare("DELETE FROM push_subscriptions WHERE id=?").bind(s.id).run();
        else console.error("[uv-tasks] push rejected:", status);
      }
    } catch (e) {
      result.failed++;
      console.error("[uv-tasks] push failed:", e);
    }
  }));
  return result;
}
