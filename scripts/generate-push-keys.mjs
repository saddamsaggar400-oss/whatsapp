// Run once for a new deployment; keep the private JWK in your server's secret environment.
// Never regenerate the production key when merely updating the application.
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
console.log(JSON.stringify({
  VAPID_PUBLIC_KEY: Buffer.from(raw).toString("base64url"),
  VAPID_PRIVATE_JWK: JSON.stringify(privateJwk),
  VAPID_SUBJECT: "https://wisal-direct-20261106.cottonvine2.chatgpt.site/",
}));
