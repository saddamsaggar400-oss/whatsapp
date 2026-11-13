"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Bell, BellOff, LoaderCircle, X } from "lucide-react";
import { ApiError, errorText, request } from "./messaging-api";

function keyBytes(value: string) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
}

async function registerSubscription(endpoint: string) {
  const result = await request<{ subscribed: boolean }>("/push/subscription", "POST", { endpoint });
  if (result?.subscribed !== true) {
    throw new Error("تعذّر تأكيد اشتراك التنبيهات. حاول مجددًا.");
  }
}

export default function PushNotifications({ userId }: { userId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "on" | "denied" | "ios" | "unsupported" | "unavailable">("loading");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const consentDialog = useRef<HTMLDialogElement>(null);
  const consentTitle = useId();
  const consentDescription = useId();
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
                await registerSubscription(subscription.endpoint);
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

  function openConsent() {
    if (!registration.current) {
      setError("");
      setState("loading");
      setAttempt(value => value + 1);
      return;
    }
    consentDialog.current?.showModal();
  }

  async function approveConsent() {
    if (busy || !registration.current || !applicationKey.current) return;
    consentDialog.current?.close();
    setBusy(true);
    setError("");
    try {
      // Keep the browser permission request in the approval click's user gesture.
      const permission = await Notification.requestPermission();
      if (!alive.current) return;
      if (permission !== "granted") { setState(permission === "denied" ? "denied" : "ready"); return; }
      let subscription = await registration.current.pushManager.getSubscription();
      subscription ||= await registration.current.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(applicationKey.current) });
      try { await registerSubscription(subscription.endpoint); }
      catch (failure) {
        if (!(failure instanceof ApiError && failure.status === 409)) throw failure;
        await subscription.unsubscribe();
        subscription = await registration.current.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(applicationKey.current) });
        await registerSubscription(subscription.endpoint);
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

  const message = state === "on" ? "سيصلك إشعار عندما يرد المندوب وأنت خارج الصفحة."
    : state === "ios" ? "على الآيفون: أضف الموقع إلى الشاشة الرئيسية، ثم افتحه منها وفعّل تنبيهات الرد."
    : state === "unsupported" ? "لتصلك تنبيهات الرد خارج الصفحة، افتح الرابط في متصفح يدعم إشعارات المواقع."
    : state === "denied" ? "الإشعارات محظورة. اسمح بها من إعدادات الموقع في المتصفح، ثم أعد فتح المحادثة."
    : state === "unavailable" ? "تنبيهات الرد غير متاحة حاليًا. تبقى ردودك محفوظة في المحادثة."
    : "فعّل التنبيهات ليصلك إشعار عندما يرد المندوب وأنت خارج الصفحة.";

  return (
    <>
      <aside className="w-push-banner" aria-label="تنبيهات الرد">
        <Bell size={19} aria-hidden="true" />
        <div>
          <p role="status">{message}</p>
          {error && <p className="w-push-error" role="alert">{error}</p>}
        </div>
        {state === "on" ? (
          <span className="w-push-actions">
            <button type="button" className="w-push-active" disabled>
              <Bell size={16} aria-hidden="true" />
              التنبيهات مفعّلة
            </button>
            <button type="button" disabled={busy} onClick={() => void disable()}>
              <BellOff size={16} aria-hidden="true" />
              إيقاف التنبيهات
            </button>
          </span>
        ) : (state === "ready" || state === "loading") && (
          <span className="w-push-actions">
            <button type="button" disabled={busy || state === "loading"} onClick={openConsent}>
              {busy || state === "loading" ? <LoaderCircle size={16} className="w-spin" /> : <Bell size={16} aria-hidden="true" />}
              {error && !registration.current ? "إعادة المحاولة" : "تفعيل تنبيهات الرد"}
            </button>
          </span>
        )}
      </aside>
      <dialog ref={consentDialog} className="w-modal" dir="rtl"
        aria-labelledby={consentTitle} aria-describedby={consentDescription}>
        <div className="w-modal-head">
          <h2 id={consentTitle}>تواصل مع المندوب</h2>
          <button type="button" className="w-icon" aria-label="إغلاق" autoFocus
            onClick={() => consentDialog.current?.close()}>
            <X size={21} aria-hidden="true" />
          </button>
        </div>
        <p className="w-modal-description" id={consentDescription}>
          هل توافق على تفعيل التنبيهات ليصلك إشعار عندما يرد المندوب وأنت خارج الصفحة؟
        </p>
        <button type="button" className="w-primary" onClick={() => void approveConsent()}>
          موافقة
        </button>
      </dialog>
    </>
  );
}
