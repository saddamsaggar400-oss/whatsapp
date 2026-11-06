import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { SignInButton, useAuth } from "@clerk/react";
import {
  ArrowRight,
  ImageOff,
  Image as ImageIcon,
  LogIn,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import "./admin-inbox.css";

const messageSoundSource = "/audio/scary_ghost.mp3";

type AdminMessage = {
  id: string;
  visitorId: string;
  sender: string;
  body: string;
  createdAt: string;
  read: boolean;
};

type AdminConversation = {
  visitorId: string;
  updatedAt: string;
  messages: AdminMessage[];
};

type AdminPresence = {
  visitorIds: string[];
};

type AdminPost = {
  id: string;
  copy: string;
  imagePath: string | null;
  time: string;
  likes: number;
  comments: number;
  shares: number;
  liked: boolean;
  pinned?: boolean;
};

type InboxErrorKind = "auth" | "forbidden" | "invalid" | "request";

class InboxRequestError extends Error {
  constructor(public readonly kind: InboxErrorKind) {
    super(kind);
    this.name = "InboxRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseMessage(value: unknown): AdminMessage {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.visitorId !== "string" ||
    typeof value.sender !== "string" ||
    typeof value.body !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.read !== "boolean"
  ) {
    throw new InboxRequestError("invalid");
  }
  return value as unknown as AdminMessage;
}

function parseConversations(value: unknown): AdminConversation[] {
  if (!Array.isArray(value)) {
    throw new InboxRequestError("invalid");
  }

  return value.map((conversation) => {
    if (
      !isRecord(conversation) ||
      typeof conversation.visitorId !== "string" ||
      typeof conversation.updatedAt !== "string" ||
      !Array.isArray(conversation.messages)
    ) {
      throw new InboxRequestError("invalid");
    }

    return {
      visitorId: conversation.visitorId,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map(parseMessage),
    };
  });
}

function parsePresence(value: unknown): AdminPresence {
  if (
    !isRecord(value) ||
    !Array.isArray(value.visitorIds) ||
    value.visitorIds.some((visitorId) => typeof visitorId !== "string")
  ) {
    throw new InboxRequestError("invalid");
  }
  return { visitorIds: value.visitorIds as string[] };
}

function parsePosts(value: unknown): AdminPost[] {
  if (!Array.isArray(value)) {
    throw new InboxRequestError("invalid");
  }

  return value.map((post) => {
    if (
      !isRecord(post) ||
      typeof post.id !== "string" ||
      typeof post.copy !== "string" ||
      (post.imagePath !== null && typeof post.imagePath !== "string") ||
      typeof post.time !== "string" ||
      typeof post.likes !== "number" ||
      typeof post.comments !== "number" ||
      typeof post.shares !== "number" ||
      typeof post.liked !== "boolean"
    ) {
      throw new InboxRequestError("invalid");
    }

    return post as unknown as AdminPost;
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function formatDate(value: string, includeTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return includeTime
    ? date.toLocaleString("ar-SA")
    : date.toLocaleDateString("ar-SA");
}

export default function AdminInbox() {
  const { isLoaded, isSignedIn } = useAuth();
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [selectedVisitorId, setSelectedVisitorId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [replyPending, setReplyPending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [replyError, setReplyError] = useState("");
  const [failedReply, setFailedReply] = useState<{ visitorId: string; body: string } | null>(null);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [onlineVisitorIds, setOnlineVisitorIds] = useState<string[]>([]);
  const [presenceError, setPresenceError] = useState("");
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState("");
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const replyRequestRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);
  const mutationVersionRef = useRef(0);
  const selectedVisitorRef = useRef<string | null>(null);
  const replyRef = useRef("");
  const knownVisitorMessageIdsRef = useRef<Set<string> | null>(null);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);
  selectedVisitorRef.current = selectedVisitorId;
  replyRef.current = reply;

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.visitorId === selectedVisitorId) ?? null,
    [conversations, selectedVisitorId],
  );

  const loadConversations = useCallback(
    async (options: { background?: boolean } = {}) => {
      const background = options.background ?? false;

      // A polling request never overlaps an existing request. Manual refreshes
      // supersede polling so an older response cannot replace newer data.
      if (replyRequestRef.current || (background && activeRequestRef.current)) return;
      activeRequestRef.current?.abort();
      const controller = new AbortController();
      activeRequestRef.current = controller;
      const requestVersion = ++requestVersionRef.current;
      const mutationVersion = mutationVersionRef.current;

      if (!background) {
        setLoading(true);
        setLoadError("");
      }

      try {
        const response = await fetch("/api/admin/conversations", {
          credentials: "include",
          signal: controller.signal,
        });
        if (response.status === 401) {
          throw new InboxRequestError("auth");
        }
        if (response.status === 403) {
          throw new InboxRequestError("forbidden");
        }
        if (!response.ok) throw new InboxRequestError("request");
        const data = parseConversations(await response.json());

        if (
          controller.signal.aborted ||
          requestVersion !== requestVersionRef.current ||
          mutationVersion !== mutationVersionRef.current
        ) {
          return;
        }

        const visitorMessageIds = new Set(
          data.flatMap((conversation) =>
            conversation.messages
              .filter((message) => message.sender === "visitor")
              .map((message) => message.id),
          ),
        );
        const knownVisitorMessageIds = knownVisitorMessageIdsRef.current;
        if (
          knownVisitorMessageIds &&
          [...visitorMessageIds].some((messageId) => !knownVisitorMessageIds.has(messageId))
        ) {
          const audio = notificationAudioRef.current ?? new Audio(messageSoundSource);
          notificationAudioRef.current = audio;
          audio.currentTime = 0;
          void audio.play().catch(() => undefined);
        }
        knownVisitorMessageIdsRef.current = visitorMessageIds;

        setConversations(data);
        setSelectedVisitorId((current) =>
          current && data.some((conversation) => conversation.visitorId === current)
            ? current
            : data[0]?.visitorId ?? null,
        );
        setLoadError("");
      } catch (error) {
        if (
          isAbortError(error) ||
          controller.signal.aborted ||
          requestVersion !== requestVersionRef.current
        ) {
          return;
        }
        if (error instanceof InboxRequestError && error.kind === "auth") {
          setLoadError("انتهت جلسة الدخول. سجل الدخول مرة أخرى.");
        } else if (error instanceof InboxRequestError && error.kind === "forbidden") {
          setLoadError("هذا الحساب ليس مخولًا للوصول إلى لوحة الرسائل.");
        } else if (error instanceof InboxRequestError && error.kind === "invalid") {
          setLoadError("وصلت بيانات غير صالحة من الخادم. حاول مرة أخرى.");
        } else {
          setLoadError("تعذر تحميل محادثات الزوار.");
        }
      } finally {
        if (requestVersion === requestVersionRef.current) {
          if (!background) setLoading(false);
          if (activeRequestRef.current === controller) {
            activeRequestRef.current = null;
          }
        }
      }
    },
    [],
  );

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    setPostsError("");

    try {
      const response = await fetch("/api/admin/posts", {
        credentials: "include",
      });
      if (response.status === 401) {
        throw new InboxRequestError("auth");
      }
      if (response.status === 403) {
        throw new InboxRequestError("forbidden");
      }
      if (!response.ok) throw new InboxRequestError("request");
      setPosts(parsePosts(await response.json()));
    } catch (error) {
      if (error instanceof InboxRequestError && error.kind === "auth") {
        setPostsError("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");
      } else if (error instanceof InboxRequestError && error.kind === "forbidden") {
        setPostsError("هذا الحساب ليس مخولًا لإدارة الصور.");
      } else if (error instanceof InboxRequestError && error.kind === "invalid") {
        setPostsError("وصلت بيانات منشورات غير صالحة من الخادم.");
      } else {
        setPostsError("تعذر تحميل المنشورات.");
      }
    } finally {
      setPostsLoading(false);
    }
  }, []);

  const loadPresence = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/presence", {
        credentials: "include",
      });
      if (response.status === 401) {
        throw new InboxRequestError("auth");
      }
      if (response.status === 403) {
        throw new InboxRequestError("forbidden");
      }
      if (!response.ok) throw new InboxRequestError("request");
      setOnlineVisitorIds(parsePresence(await response.json()).visitorIds);
      setPresenceError("");
    } catch (error) {
      if (error instanceof InboxRequestError && error.kind === "auth") {
        setPresenceError("انتهت جلسة الدخول.");
      } else if (error instanceof InboxRequestError && error.kind === "forbidden") {
        setPresenceError("لا تملك صلاحية مشاهدة الحضور.");
      } else {
        setPresenceError("تعذر تحديث حالة الزوار.");
      }
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    const audio = new Audio(messageSoundSource);
    audio.preload = "auto";
    audio.volume = 0.55;
    notificationAudioRef.current = audio;

    const unlockAudio = () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      audio.muted = true;
      void audio.play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        })
        .catch(() => {
          audio.muted = false;
        });
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      audio.pause();
      notificationAudioRef.current = null;
      knownVisitorMessageIdsRef.current = null;
    };
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    void loadConversations();
    void loadPosts();
    void loadPresence();
    const interval = window.setInterval(() => {
      void loadConversations({ background: true });
      void loadPresence();
    }, 5000);

    return () => {
      window.clearInterval(interval);
      requestVersionRef.current += 1;
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      replyRequestRef.current?.abort();
      replyRequestRef.current = null;
      setReplyPending(false);
    };
  }, [isLoaded, isSignedIn, loadConversations, loadPosts, loadPresence]);

  function selectConversation(visitorId: string) {
    const changedConversation = selectedVisitorId !== visitorId;
    setSelectedVisitorId(visitorId);
    setMobileThreadOpen(true);
    if (changedConversation) {
      setReplyError("");
      setFailedReply(null);
    }
  }

  async function submitReply(visitorId: string, body: string) {
    const controller = new AbortController();
    replyRequestRef.current?.abort();
    replyRequestRef.current = controller;
    mutationVersionRef.current += 1;
    requestVersionRef.current += 1;
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    setLoading(false);
    setReplyPending(true);
    setReplyError("");

    try {
      const response = await fetch(
        `/api/admin/conversations/${encodeURIComponent(visitorId)}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ body }),
          signal: controller.signal,
        },
      );
      if (response.status === 401) {
        throw new InboxRequestError("auth");
      }
      if (response.status === 403) {
        throw new InboxRequestError("forbidden");
      }
      if (!response.ok) throw new InboxRequestError("request");
      const message = parseMessage(await response.json());
      if (message.visitorId !== visitorId || message.sender !== "official") {
        throw new InboxRequestError("invalid");
      }

      setConversations((current) =>
        current.map((conversation) => {
          if (conversation.visitorId !== visitorId) return conversation;
          if (conversation.messages.some((item) => item.id === message.id)) return conversation;
          return {
            ...conversation,
            updatedAt: message.createdAt,
            messages: [...conversation.messages, message],
          };
        }),
      );
      if (
        selectedVisitorRef.current === visitorId &&
        replyRef.current.trim() === body
      ) {
        setReply("");
      }
      // A poll that started before the reply was saved must not replace the
      // locally updated thread with its older response.
      mutationVersionRef.current += 1;
      setReplyError("");
      setFailedReply(null);
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      if (error instanceof InboxRequestError && error.kind === "auth") {
        setReplyError("انتهت جلسة الدخول. سجل الدخول مرة أخرى ثم أعد المحاولة.");
      } else if (error instanceof InboxRequestError && error.kind === "forbidden") {
        setReplyError("هذا الحساب ليس مخولًا لإرسال الردود.");
      } else if (error instanceof InboxRequestError && error.kind === "invalid") {
        setReplyError("وصل رد غير صالح من الخادم. لم يُحذف نص ردك، أعد المحاولة.");
      } else {
        setReplyError("تعذر إرسال الرد. لم يُحذف نص ردك، أعد المحاولة.");
      }
      setFailedReply({ visitorId, body });
    } finally {
      if (replyRequestRef.current === controller) {
        replyRequestRef.current = null;
        setReplyPending(false);
      }
    }
  }

  function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reply.trim();
    if (!selectedVisitorId || !trimmed) return;
    void submitReply(selectedVisitorId, trimmed);
  }

  function retryFailedReply() {
    if (!failedReply || replyPending) return;
    void submitReply(failedReply.visitorId, failedReply.body);
  }

  async function removePostImage(post: AdminPost) {
    if (!post.imagePath || deletingPostId) return;
    if (!window.confirm("هل تريد حذف الصورة فقط مع إبقاء نص المنشور؟")) return;

    setDeletingPostId(post.id);
    setPostsError("");
    try {
      const response = await fetch(`/api/admin/posts/${encodeURIComponent(post.id)}/image`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.status === 401) {
        throw new InboxRequestError("auth");
      }
      if (response.status === 403) {
        throw new InboxRequestError("forbidden");
      }
      if (!response.ok) throw new InboxRequestError("request");
      setPosts((current) =>
        current.map((item) => (item.id === post.id ? { ...item, imagePath: null } : item)),
      );
    } catch (error) {
      if (error instanceof InboxRequestError && error.kind === "auth") {
        setPostsError("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");
      } else if (error instanceof InboxRequestError && error.kind === "forbidden") {
        setPostsError("هذا الحساب ليس مخولًا لإدارة الصور.");
      } else {
        setPostsError("تعذر حذف الصورة. لم يتغير المنشور.");
      }
    } finally {
      setDeletingPostId(null);
    }
  }

  if (!isLoaded) {
    return (
      <main className="admin-inbox-loading" dir="rtl">
        جارٍ تجهيز لوحة التحكم...
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="admin-inbox-page" dir="rtl">
        <div className="admin-empty-state">
          <ShieldCheck size={38} />
          <h1>لوحة تحكم الصفحة</h1>
          <p>سجل الدخول حتى تشاهد رسائل الزوار وترد عليها.</p>
          <SignInButton mode="redirect" forceRedirectUrl="/admin/inbox">
            <button className="admin-primary-btn" type="button">
              <LogIn size={17} /> تسجيل الدخول
            </button>
          </SignInButton>
          <a className="admin-back-btn" href="/">
            <ArrowRight size={16} /> العودة إلى الصفحة الرسمية
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-inbox-page" dir="rtl">
      <header className="admin-inbox-header">
        <div>
          <span className="admin-eyebrow">OFFICIAL PAGE</span>
          <h1>لوحة تحكم الرسائل</h1>
          <p>اقرأ رسائل الزوار ورد عليهم من مكان واحد.</p>
        </div>
        <div className="admin-header-actions">
          <a className="admin-back-btn" href="/admin/appearance">مظهر الصفحة</a>
          <button
            className="admin-refresh-btn"
            onClick={() => void loadConversations()}
            disabled={loading || replyPending}
            aria-label="تحديث المحادثات"
            title="تحديث المحادثات"
          >
            <RefreshCw size={17} className={loading ? "spin" : ""} />
          </button>
          <a className="admin-back-btn" href="/">
            <ArrowRight size={16} /> العودة إلى الصفحة الرسمية
          </a>
        </div>
      </header>

      {loadError && (
        <div className="admin-error" role="alert">
          <span>{loadError}</span>
          <button
            className="admin-error-retry"
            type="button"
            onClick={() => void loadConversations()}
            disabled={loading || replyPending}
          >
            {loading ? "جارٍ المحاولة..." : replyPending ? "جارٍ إرسال الرد..." : "إعادة المحاولة"}
          </button>
        </div>
      )}

      <section className="admin-posts-panel" id="admin-posts" aria-labelledby="admin-posts-title">
        <div className="admin-posts-heading">
          <div>
            <span className="admin-eyebrow">CONTENT CONTROL</span>
            <h2 id="admin-posts-title">المنشورات والصور</h2>
            <p>احذف الصورة فقط واترك نص المنشور محفوظًا.</p>
          </div>
          <button
            className="admin-refresh-btn"
            type="button"
            onClick={() => void loadPosts()}
            disabled={postsLoading || deletingPostId !== null}
            aria-label="تحديث المنشورات"
            title="تحديث المنشورات"
          >
            <RefreshCw size={17} className={postsLoading ? "spin" : ""} />
          </button>
        </div>

        {postsError && (
          <div className="admin-error admin-posts-error" role="alert">
            <span>{postsError}</span>
            <button
              className="admin-error-retry"
              type="button"
              onClick={() => void loadPosts()}
              disabled={postsLoading || deletingPostId !== null}
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {postsLoading && posts.length === 0 ? (
          <div className="admin-list-status">
            <RefreshCw size={22} className="spin" />
            <p>جارٍ تحميل المنشورات...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="admin-list-empty">
            <ImageOff size={26} />
            <p>لا توجد منشورات.</p>
          </div>
        ) : (
          <div className="admin-posts-grid">
            {posts.map((post) => (
              <article className="admin-post-card" key={post.id}>
                <div className="admin-post-preview">
                  {post.imagePath ? (
                    <img src={post.imagePath} alt="" />
                  ) : (
                    <ImageOff size={28} />
                  )}
                </div>
                <div className="admin-post-copy">
                  <span className="admin-post-time">{post.time}</span>
                  <p>{post.copy}</p>
                </div>
                <button
                  className="admin-delete-image-btn"
                  type="button"
                  onClick={() => void removePostImage(post)}
                  disabled={!post.imagePath || deletingPostId !== null}
                >
                  {deletingPostId === post.id ? (
                    <RefreshCw size={15} className="spin" />
                  ) : (
                    <Trash2 size={15} />
                  )}
                  {post.imagePath ? "حذف الصورة" : "لا توجد صورة"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        className={`admin-inbox-layout ${mobileThreadOpen ? "mobile-thread-open" : "mobile-conversations-open"}`}
      >
        <aside className="admin-conversations">
          <div className="admin-section-title">
            <span>المحادثات</span>
            <span className="admin-section-counts">
              <strong>{conversations.length}</strong>
              <span className="admin-online-summary">
                <i aria-hidden="true" />
                {onlineVisitorIds.length} متصل
              </span>
            </span>
          </div>
          {presenceError && <p className="admin-presence-error">{presenceError}</p>}
          {onlineVisitorIds.length > 0 && (
            <div className="admin-online-visitors" aria-label="الزوار المتصلون الآن">
              <strong>الزوار المتصلون الآن</strong>
              <div>
                {onlineVisitorIds.map((visitorId) => (
                  <span key={visitorId}>زائر {visitorId.slice(0, 8)}</span>
                ))}
              </div>
            </div>
          )}
          {loading && conversations.length === 0 ? (
            <div className="admin-list-status">
              <RefreshCw size={22} className="spin" />
              <p>جارٍ تحميل المحادثات...</p>
            </div>
          ) : conversations.length === 0 ? (
            <div className="admin-list-empty">
              <MessageCircle size={26} />
              <p>لا توجد رسائل زوار بعد.</p>
            </div>
          ) : (
            conversations.map((conversation) => {
              const lastMessage = conversation.messages[conversation.messages.length - 1];
              const isOnline = onlineVisitorIds.includes(conversation.visitorId);
              return (
                <button
                  className={`admin-conversation-item ${selectedVisitorId === conversation.visitorId ? "active" : ""}`}
                  key={conversation.visitorId}
                   onClick={() => selectConversation(conversation.visitorId)}
                >
                   <span className="admin-conversation-avatar-wrap">
                     <span className="admin-conversation-avatar"><MessageCircle size={17} /></span>
                     {isOnline && <i className="admin-online-dot" title="متصل الآن" aria-label="متصل الآن" />}
                   </span>
                  <span className="admin-conversation-copy">
                    <strong>زائر {conversation.visitorId.slice(0, 8)}</strong>
                     <span>{isOnline ? "متصل الآن" : lastMessage?.body ?? "محادثة جديدة"}</span>
                  </span>
                   <time>{formatDate(conversation.updatedAt)}</time>
                </button>
              );
            })
          )}
        </aside>

        <section className="admin-thread">
          {selectedConversation ? (
            <>
              <div className="admin-thread-header">
                <button
                  className="admin-thread-back"
                  type="button"
                  onClick={() => setMobileThreadOpen(false)}
                >
                  <ArrowRight size={16} /> المحادثات
                </button>
                <div className="admin-conversation-avatar"><MessageCircle size={17} /></div>
                <div>
                  <strong>محادثة الزائر</strong>
                  <span>{selectedConversation.visitorId}</span>
                   {onlineVisitorIds.includes(selectedConversation.visitorId) && (
                     <span className="admin-thread-online">متصل الآن</span>
                   )}
                </div>
              </div>
              <div className="admin-thread-messages">
                {selectedConversation.messages.map((message) => (
                  <div className={`admin-message ${message.sender === "official" ? "official" : "visitor"}`} key={message.id}>
                    <span className="admin-message-label">{message.sender === "official" ? "أنت" : "الزائر"}</span>
                    <p>{message.body}</p>
                    <time>{formatDate(message.createdAt, true)}</time>
                  </div>
                ))}
              </div>
              <form className="admin-reply-form" onSubmit={sendReply}>
                <label className="sr-only" htmlFor="admin-reply">ردك للزائر</label>
                <input
                  id="admin-reply"
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="اكتب ردك للزائر..."
                  disabled={replyPending}
                />
                <button
                  type="submit"
                  disabled={!reply.trim() || replyPending}
                  aria-label="إرسال الرد"
                >
                  <Send size={17} />
                </button>
              </form>
              {replyError && failedReply?.visitorId === selectedVisitorId && (
                <div className="admin-reply-error" role="alert">
                  <span>{replyError}</span>
                  <button type="button" onClick={retryFailedReply} disabled={replyPending}>
                    {replyPending ? "جارٍ الإرسال..." : "إعادة المحاولة"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="admin-thread-empty">
              <MessageCircle size={38} />
              <h2>اختر محادثة</h2>
              <p>ستظهر هنا رسائل الزائر والردود الرسمية.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}