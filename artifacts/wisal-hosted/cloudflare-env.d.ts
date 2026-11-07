declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ADMIN_EMAIL?: string;
    IP_HASH_KEY?: string;
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_JWK?: string;
    VAPID_SUBJECT?: string;
  }
}
