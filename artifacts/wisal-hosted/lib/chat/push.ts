import { OWNER_ID, type ChatEnvironment, type User } from "./types";

export interface PushConfiguration {
  publicKey: string;
  privateJwk: string;
  subject: string;
}

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const decode = (value: string) => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
const tokens = new Map<string, { until: number; authorization: string }>();

export function pushConfigured(config?: PushConfiguration): config is PushConfiguration {
  if (!config || !/^[A-Za-z0-9_-]{87}$/.test(config.publicKey)) return false;
  try {
    const key = JSON.parse(config.privateJwk);
    const subject = new URL(config.subject);
    return key.kty === "EC" && key.crv === "P-256" && /^[A-Za-z0-9_-]{43}$/.test(key.d) &&
      encode(Uint8Array.from([4, ...decode(key.x), ...decode(key.y)])) === config.publicKey &&
      ["https:", "mailto:"].includes(subject.protocol);
  } catch { return false; }
}

// Subscription URLs are secret capabilities. Never send to arbitrary URLs supplied by a guest.
export function pushEndpoint(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.pathname === "/") return null;
    // Some Chromium builds use Google's alternate FCM endpoint.
    if (url.hostname === "jmt17.google.com") {
      return /^\/fcm\/send\/[^/]+$/.test(url.pathname) ? url.href : null;
    }
    if (!["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

export async function pushAuthorization(config: PushConfiguration, endpoint: string, now = Date.now()) {
  const origin = new URL(endpoint).origin;
  const cacheKey = config.publicKey + "|" + origin;
  const cached = tokens.get(cacheKey);
  if (cached && cached.until > now) return cached.authorization;
  const header = encode(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = encode(new TextEncoder().encode(JSON.stringify({ aud: origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: config.subject })));
  const input = header + "." + claims;
  const key = await crypto.subtle.importKey("jwk", JSON.parse(config.privateJwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input));
  const authorization = `vapid t=${input}.${encode(new Uint8Array(signature))}, k=${config.publicKey}`;
  tokens.set(cacheKey, { until: now + 3600_000, authorization });
  // Bound this cache for local configuration changes.
  if (tokens.size > 12) tokens.delete(tokens.keys().next().value!);
  return authorization;
}

export async function notifyVisitorReply(env: ChatEnvironment, sender: User, conversationId: string) {
  if (sender.id !== OWNER_ID || sender.role !== "admin" || !pushConfigured(env.push)) return;
  const subscriptions = await env.db.all(
    `SELECT s.endpointHash, s.endpoint FROM wisal_push_subscriptions s
     JOIN chat_conversations c ON c.visitorId = s.userId
     JOIN chat_users u ON u.id = s.userId AND u.role = 'guest'
     JOIN chat_members m ON m.conversationId = c.id AND m.userId = ?
     WHERE c.id = ? AND c.isGroup = 0 AND s.applicationKey = ?`,
    OWNER_ID, conversationId, env.push.publicKey,
  );
  await Promise.all(subscriptions.map(async subscription => {
    const endpoint = pushEndpoint(subscription.endpoint);
    if (!endpoint) return;
    let status = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await (env.pushFetch || fetch)(endpoint, {
          method: "POST", redirect: "manual", signal: AbortSignal.timeout(7000),
          headers: {
            Authorization: await pushAuthorization(env.push!, endpoint),
            TTL: "86400", Urgency: "high", Topic: "wisal-private-reply",
          },
          // Empty Web Push payload: no chat text, identities, session token or media leave this server.
          // The service worker displays a fixed notification and opens the visitor's own origin.
          body: new Uint8Array(0),
        });
        status = response.status;
        await response.body?.cancel();
        if (![408, 429].includes(status) && status < 500) break;
      } catch { status = 0; }
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
    }
    if ([404, 410].includes(status)) {
      await env.db.run("DELETE FROM wisal_push_subscriptions WHERE endpointHash = ? AND applicationKey = ?", subscription.endpointHash, env.push!.publicKey);
    } else {
      await env.db.run("UPDATE wisal_push_subscriptions SET lastPushAt = ?, lastStatus = ? WHERE endpointHash = ?", env.now?.() ?? Date.now(), status, subscription.endpointHash);
    }
  }));
}
