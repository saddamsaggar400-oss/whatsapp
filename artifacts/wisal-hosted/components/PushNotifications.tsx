"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, LoaderCircle } from "lucide-react";
import { ApiError, errorText, request } from "./messaging-api";

function keyBytes(value: string) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
}

export default function PushNotifications({ userId }: { userId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "on" | "denied" | "ios" | "unsupported" | "unavailable">("loading");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const applicationKey = useRef("");
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let current = true;
    registration.current = null;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (ios && !standalone) setState("ios");
    else if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) setState("unsupported");
    else {
      void (async () => {
        try {
          const config = await request<{ enabled: boolean; publicKey: string | null }>("/push/config");
          if (!current) return;
          if (!config.enabled || !config.publicKey) { setState("unavailable"); return; }
          applicationKey.current = config.publicKey;
          const worker = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
          await navigator.serviceWorker.ready;
          if (!current) return;
          registration.current = worker;
          if (Notification.permission === "denied") { setState("denied"); return; }
          const subscription = await worker.pushManager.getSubscription();
          if (!current) return;
          if (subscription && Notification.permission === "granted") {
            const key = subscription.options.applicationServerKey;
            if (key && new Uint8Array(key).join(",") !== keyBytes(config.publicKey).join(",")) {
              await subscription.unsubscribe();
              if (current) setState("ready");
            } else {
              try {
                await request("/push/subscription", "POST", { endpoint: subscription.endpoint });
                if (current) setState("on");
              } catch (failure) {
                if (failure instanceof ApiError && failure.status === 409) {
                  await subscription.unsubscribe();
                  if (current) setState("ready");
                } else throw failure;
              }
            }
          } else if (current) setState("ready");
        } catch (failure) {
          if (current) { setError(errorText(failure)); setState("ready"); }
        }
      })();
    }
    return () => { current = false; alive.current = false; };
  }, [userId, attempt]);

  async function enable() {
    if (busy || !registration.current || !applicationKey.current) return;
    setBusy(true); setError("");
    try {
      // Permission is requested only by this explicit visitor action, never on page load.
      const permission = await Notification.requestPermission();
      if (!alive.current) return;
      if (permission !== "granted") { setState(permission === "denied" ? "denied" : "ready"); return; }
      let subscription = await registration.current.pushManager.getSubscription();
      subscription ||= await registration.current.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(applicationKey.current) });
      try { await request("/push/subscription", "POST", { endpoint: subscription.endpoint }); }
      catch (failure) {
        if (!(failure instanceof ApiError && failure.status === 409)) throw failure;
        await subscription.unsubscribe();
        subscription = await registration.current.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(applicationKey.current) });
        await request("/push/subscription", "POST", { endpoint: subscription.endpoint });
      }
      if (alive.current) setState("on");
    } catch (failure) { if (alive.current) setError(errorText(failure)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function disable() {
    if (busy || !registration.current) return;
    setBusy(true); setError("");
    try {
      const subscription = await registration.current.pushManager.getSubscription();
      if (subscription) {
        await request("/push/subscription", "DELETE", { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      if (alive.current) setState("ready");
    } catch (failure) { if (alive.current) setError(errorText(failure)); }
    finally { if (alive.current) setBusy(false); }
  }

  const message = state === "on" ? "تنبيهات الرد مفعّلة، حتى بعد إغلاق الصفحة."
    : state === "ios" ? "على الآيفون: أضف الموقع إلى الشاشة الرئيسية، ثم افتحه منها وفعّل تنبيهات الرد."
    : state === "unsupported" ? "لتصلك تنبيهات الرد خارج الصفحة، افتح الرابط في متصفح يدعم إشعارات المواقع."
    : state === "denied" ? "الإشعارات محظورة. اسمح بها من إعدادات الموقع في المتصفح، ثم أعد فتح المحادثة."
    : state === "unavailable" ? "تنبيهات الرد غير متاحة حاليًا. تبقى ردودك محفوظة في المحادثة."
    : "فعّل التنبيهات ليصلك إشعار عندما يرد صاحب الحساب وأنت خارج الصفحة.";
  return <aside className="w-push-banner" aria-label="تنبيهات الرد">
    <Bell size={19} aria-hidden="true" />
    <div><p role="status">{message}</p>{error && <p className="w-push-error" role="alert">{error}</p>}</div>
    {["ready", "on", "loading"].includes(state) && <button type="button" disabled={busy || state === "loading"}
      onClick={() => { if (!registration.current) { setError(""); setState("loading"); setAttempt(value => value + 1); } else void (state === "on" ? disable() : enable()); }}>
      {busy || state === "loading" ? <LoaderCircle size={16} className="w-spin" /> : state === "on" ? <BellOff size={16} /> : <Bell size={16} />}
      {state === "on" ? "إيقاف التنبيهات" : error && !registration.current ? "إعادة المحاولة" : "تفعيل تنبيهات الرد"}
    </button>}
  </aside>;
}
