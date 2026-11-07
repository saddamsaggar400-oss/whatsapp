/* No message history, credentials or media are cached by this worker. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  event.waitUntil(self.registration.showNotification("وصال — لديك رد جديد", {
    body: "ردّ صاحب الحساب على محادثتك. اضغط لقراءة الرد ومتابعة الحديث.",
    icon: "/icons/wisal-192.png", badge: "/icons/wisal-192.png",
    tag: "wisal-private-reply", renotify: true, dir: "rtl", lang: "ar",
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const root = new URL("/", self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const conversation = windows.find(client => {
      const url = new URL(client.url);
      return url.origin === self.location.origin && url.pathname === "/";
    });
    if (conversation) { await conversation.focus(); return; }
    await self.clients.openWindow(root);
  })());
});
