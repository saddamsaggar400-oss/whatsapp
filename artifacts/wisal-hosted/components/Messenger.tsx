"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  MessageCircle,
  Search,
  MoreVertical,
  ArrowRight,
  Send,
  Smile,
  Paperclip,
  Mic,
  Square,
  X,
  Check,
  CheckCheck,
  Archive,
  Pin,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Info,
  WifiOff,
  LoaderCircle,
  ShieldCheck,
  UserRound,
  Moon,
  Sun,
  Bell,
  BellOff,
  CircleDashed,
  Plus,
  Trash2,
  Camera,
  Video,
  Image as ImageIcon,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import type {
  Attachment,
  Conversation,
  Message,
  Session,
  Status,
  User,
} from "../lib/chat/types";
import { OWNER_ID } from "../lib/chat/types";
import {
  ApiError,
  apiPath,
  acknowledgeMessages,
  avatarFile,
  dayText,
  errorText,
  fileUrl,
  request,
  timeText,
  uploadFile,
} from "./messaging-api";
import OwnerInfo from "./OwnerInfo";
import VerifiedBadge from "./legacy/VerifiedBadge";
import "./messenger.css";
import { useMessageSound } from "./use-message-sound";

function ReceiptIcon({ message, size = 17 }: { message: Message; size?: number }) {
  const label = message.readAt ? 'تمت القراءة' : message.deliveredAt ? 'تم الاستلام' : 'تم الإرسال';
  const detail = `${label} · إرسال ${new Date(message.createdAt).toLocaleString('ar')} ${message.deliveredAt ? '· استلام ' + new Date(message.deliveredAt).toLocaleString('ar') : ''} ${message.readAt ? '· قراءة ' + new Date(message.readAt).toLocaleString('ar') : ''}`;
  return <span className={`w-receipt ${message.readAt ? 'read' : ''}`} aria-label={label} title={detail}>{message.deliveredAt || message.readAt ? <CheckCheck size={size} /> : <Check size={size} />}</span>;
}

function IconButton({
  label,
  children,
  onClick,
  disabled = false,
  active = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-icon ${active ? "active" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
function Avatar({
  user,
  small = false,
  group = false,
}: {
  user?: User;
  small?: boolean;
  group?: boolean;
}) {
  return (
    <span
      className={`w-avatar ${small ? "small" : ""}`}
      style={{ "--avatar": user?.color || "#00a884" } as React.CSSProperties}
    >
      {user?.avatarUrl ? (
        <img
          src={
            user.avatarUrl.startsWith("/api/chat")
              ? apiPath(user.avatarUrl.slice(9))
              : user.avatarUrl
          }
          alt={user.name}
        />
      ) : group ? (
        <MessageCircle size={23} />
      ) : (
        user?.name.slice(0, 2) || "و"
      )}
    </span>
  );
}
function Name({ user, text }: { user?: User; text?: string }) {
  return (
    <span className="w-name">
      <span>{text || user?.name || "محادثة"}</span>
      {user?.verified ? <VerifiedBadge /> : null}
    </span>
  );
}
function Brand() {
  return (
    <span className="w-brand">
      <MessageCircle size={26} />
      <strong>وصال</strong>
    </span>
  );
}
function Modal({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`w-modal ${className}`}
      dir="rtl"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="w-modal-head">
        <h2>{title}</h2>
        <IconButton label="إغلاق" onClick={onClose}>
          <X size={21} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
function Login({
  authMode,
  error,
  onSuccess,
}: {
  authMode: string;
  error?: string;
  onSuccess: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(error || "");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      await request("/auth/login", "POST", Object.fromEntries(form));
      onSuccess();
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="w-login">
      <Brand />
      <div className="w-login-card">
        <span className="w-security-icon">
          <LockKeyhole size={31} />
        </span>
        <h1>دخول صاحب الموقع</h1>
        <p>لوحة محادثات خاصة بالمدير فقط.</p>
        {authMode === "chatgpt" ? (
          <>
            <p className="w-login-note">
              استخدم حساب ChatGPT المعتمد لإدارة وصال. نتحقق من هويتك وصلاحيتك
              في الخادم.
            </p>
            <a
              className="w-primary"
              href="/signin-with-chatgpt?return_to=%2Fadmin"
              target="_top"
            >
              <ShieldCheck size={19} />
              تسجيل الدخول الآمن
            </a>
          </>
        ) : (
          <form onSubmit={submit}>
            <label>
              اسم المستخدم
              <input
                name="handle"
                defaultValue="hhshklatifa"
                dir="ltr"
                autoComplete="username"
                required
              />
            </label>
            <label>
              كلمة المرور
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                maxLength={128}
              />
            </label>
            <button className="w-primary" disabled={busy}>
              {busy ? (
                <LoaderCircle size={20} className="w-spin" />
              ) : (
                "دخول لوحة المحادثات"
              )}
            </button>
          </form>
        )}
        {message && (
          <p className="w-error" role="alert">
            {message}
          </p>
        )}
        <a className="w-text-button" href="/">
          العودة إلى محادثة الزائر
        </a>
      </div>
    </main>
  );
}

function ProfileSettings({
  session,
  onClose,
  onSave,
  theme,
  onTheme,
  onError,
  sound,
}: {
  session: Session;
  onClose: () => void;
  onSave: (user: User) => void;
  theme: string;
  onTheme: () => void;
  onError: (message: string) => void;
  sound: ReturnType<typeof useMessageSound>;
}) {
  const [name, setName] = useState(session.user.name),
    [about, setAbout] = useState(session.user.about),
    [phone, setPhone] = useState(session.user.phone || ""),
    [busy, setBusy] = useState(false);
  const [avatarId, setAvatarId] = useState(""),
    [preview, setPreview] = useState(session.user.avatarUrl);
  const picker = useRef<HTMLInputElement>(null);
  async function choose(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const image = await avatarFile(file),
        uploaded = await uploadFile(image, "avatar.jpg", "avatar");
      setAvatarId(uploaded.id);
      setPreview(URL.createObjectURL(image));
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await request<{ user: User }>("/me", "PATCH", {
        name,
        about,
        avatarId,
        phone,
      });
      onSave(data.user);
      onClose();
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  useEffect(
    () => () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  return (
    <Modal title={session.user.role === "admin" ? "الإعدادات والملف الشخصي" : "إعدادات المحادثة"} onClose={onClose}>
      {session.user.role === "admin" && <div className="w-profile-photo">
        <Avatar user={{ ...session.user, avatarUrl: preview }} />
        <IconButton
          label="تغيير الصورة الشخصية"
          onClick={() => picker.current?.click()}
          disabled={busy}
        >
          <Camera size={18} />
        </IconButton>
        <input
          ref={picker}
          className="w-hidden"
          type="file"
          accept="image/*"
          onChange={(e) => void choose(e.target.files?.[0])}
        />
      </div>}
      <form onSubmit={save}>
        {session.user.role === "admin" && <label>
          الاسم
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
          />
        </label>}
        {session.user.role === "guest" && (
          <label>
            رقم الهاتف (اختياري)
            <input
              type="tel"
              dir="ltr"
              autoComplete="tel"
              value={phone}
              maxLength={24}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+رمز الدولة والرقم"
            />
            <small className="w-field-help">
              يظهر لصاحب الموقع فقط. رقم يكتبه الزائر دون تحقق SMS.
            </small>
          </label>
        )}
        {session.user.role === "admin" && <label>
          النبذة
          <input
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            maxLength={140}
          />
        </label>}
        <button className="w-primary" disabled={busy}>
          {busy ? (
            <LoaderCircle size={18} className="w-spin" />
          ) : (
            "حفظ التغييرات"
          )}
        </button>
      </form>
      <button
        className="w-setting-row"
        onClick={() =>
          void sound.toggle().catch((err) => onError(errorText(err)))
        }
      >
        {sound.enabled && sound.unlocked ? (
          <Bell size={20} />
        ) : (
          <BellOff size={20} />
        )}
        <span>
          {sound.enabled && sound.unlocked
            ? "كتم صوت الرسائل الجديدة"
            : "تفعيل صوت الرسائل الجديدة"}
        </span>
        <small>{sound.enabled && sound.unlocked ? "مفعّل" : "متوقف"}</small>
      </button>
      <button className="w-setting-row" onClick={onTheme}>
        {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        <span>
          {theme === "dark" ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}
        </span>
        <ChevronLeft size={17} />
      </button>
      {session.user.role === "guest" && (
        <p className="w-settings-note">
          <ShieldCheck size={17} />
          هويتك ومحادثتك محفوظتان لهذا المتصفح. لا تشارك جهازك إذا أردت الحفاظ
          على خصوصيتهما.
        </p>
      )}
      {session.user.role === "admin" && (
        <>
          <a className="w-setting-row" href="/classic">
            <MessageCircle size={20} />
            <span>الواجهة السابقة والمجموعات</span>
            <ChevronLeft size={17} />
          </a>
          {session.authMode === "chatgpt" ? (
            <a
              className="w-setting-row w-danger"
              href="/signout-with-chatgpt?return_to=%2F"
              target="_top"
            >
              <LogOut size={19} />
              تسجيل الخروج
            </a>
          ) : (
            <button
              className="w-setting-row w-danger"
              onClick={() => {
                void request("/logout", "POST")
                  .then(() => location.assign("/"))
                  .catch((err) => onError(errorText(err)));
              }}
            >
              <LogOut size={19} />
              تسجيل الخروج
            </button>
          )}
        </>
      )}
    </Modal>
  );
}

function StatusPanel({
  session,
  statuses,
  onClose,
  refresh,
  onError,
  initialId,
}: {
  initialId?: string;
  session: Session;
  statuses: Status[];
  onClose: () => void;
  refresh: () => void;
  onError: (message: string) => void;
}) {
  const admin = session.user.role === "admin";
  const [active, setActive] = useState<string | null>(initialId || null),
    [compose, setCompose] = useState(false),
    [text, setText] = useState(""),
    [color, setColor] = useState("#005c4b");
  const [attachment, setAttachment] = useState<Attachment | null>(null),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(Date.now());
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const valid = statuses.filter((status) => status.expiresAt > tick),
    index = valid.findIndex((s) => s.id === active),
    current = valid[index];
  useEffect(() => {
    if (!current || current.attachment?.mime.startsWith("video/")) return;
    const timer = setTimeout(
      () => setActive(valid[index + 1]?.id || null),
      6500,
    );
    return () => clearTimeout(timer);
  }, [current?.id]);
  async function choose(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      setAttachment(await uploadFile(file, file.name, "status"));
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function publish(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await request("/statuses", "POST", {
        text,
        color,
        attachmentId: attachment?.id,
      });
      setCompose(false);
      setText("");
      setAttachment(null);
      refresh();
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function remove(status: Status) {
    if (!window.confirm("حذف هذه الحالة؟")) return;
    try {
      await request("/statuses/" + status.id, "DELETE");
      setActive(null);
      refresh();
    } catch (err) {
      onError(errorText(err));
    }
  }
  return (
    <Modal
      title="الحالات"
      onClose={onClose}
      className={current ? "w-status-modal" : ""}
    >
      {current ? (
        <>
          <div className="w-story-head">
            <Avatar user={session.owner} small />
            <div>
              <Name user={session.owner} />
              <small>
                {dayText(current.createdAt)} · {timeText(current.createdAt)}
              </small>
            </div>
            {admin && (
              <IconButton
                label="حذف الحالة"
                onClick={() => void remove(current)}
              >
                <Trash2 size={19} />
              </IconButton>
            )}
          </div>
          <div className="w-story-progress">
            {valid.map((status) => (
              <i
                key={status.id}
                className={status.id === current.id ? "current" : ""}
              />
            ))}
          </div>
          <div className="w-story" style={{ background: current.color }}>
            {current.attachment?.mime.startsWith("image/") ? (
              <img src={fileUrl(current.attachment.id)} alt="صورة الحالة" />
            ) : current.attachment?.mime.startsWith("video/") ? (
              <video
                src={fileUrl(current.attachment.id)}
                controls
                autoPlay
                playsInline
                onEnded={() => setActive(valid[index + 1]?.id || null)}
              />
            ) : (
              <p>{current.text}</p>
            )}
            {current.attachment && current.text && (
              <span className="w-story-caption">{current.text}</span>
            )}
          </div>
          <div className="w-story-navigation">
            <IconButton
              label="الحالة السابقة"
              disabled={index <= 0}
              onClick={() => setActive(valid[index - 1]?.id)}
            >
              <ChevronRight size={21} />
            </IconButton>
            <span>
              {index + 1} / {valid.length}
            </span>
            <IconButton
              label="الحالة التالية"
              onClick={() => setActive(valid[index + 1]?.id || null)}
            >
              <ChevronLeft size={21} />
            </IconButton>
          </div>
        </>
      ) : compose ? (
        <form onSubmit={publish}>
          <p className="w-modal-description">
            تختفي الحالة تلقائيًا بعد 24 ساعة.
          </p>
          <textarea
            className="w-status-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="اكتب حالة نصية أو أضف صورة أو فيديو…"
          />
          <div className="w-status-colors">
            {[
              "#005c4b",
              "#54656f",
              "#6a1b9a",
              "#ad4b3b",
              "#165b86",
              "#493b67",
            ].map((value) => (
              <button
                type="button"
                key={value}
                aria-label={"لون " + value}
                className={color === value ? "selected" : ""}
                style={{ background: value }}
                onClick={() => setColor(value)}
              />
            ))}
          </div>
          <input
            className="w-hidden"
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
            onChange={(e) => void choose(e.target.files?.[0])}
          />
          <button
            type="button"
            className="w-setting-row"
            onClick={() => input.current?.click()}
            disabled={busy}
          >
            <ImageIcon size={20} />
            <span>{attachment ? attachment.name : "إضافة صورة أو فيديو"}</span>
          </button>
          {attachment && (
            <button
              type="button"
              className="w-text-button"
              onClick={() => setAttachment(null)}
            >
              إزالة المرفق
            </button>
          )}
          <button
            className="w-primary"
            disabled={busy || (!text.trim() && !attachment)}
          >
            {busy ? (
              <LoaderCircle className="w-spin" size={19} />
            ) : (
              "نشر الحالة"
            )}
          </button>
        </form>
      ) : (
        <>
          <p className="w-modal-description">
            تحديثات {session.owner.name} خلال آخر 24 ساعة.
          </p>
          {valid.length ? (
            valid.map((status) => (
              <button
                className="w-status-row"
                key={status.id}
                onClick={() => setActive(status.id)}
              >
                <span className="w-status-ring">
                  <Avatar user={session.owner} />
                </span>
                <span>
                  <strong>
                    {status.attachment?.mime.startsWith("video/")
                      ? "حالة فيديو"
                      : status.attachment
                        ? "حالة صورة"
                        : status.text.slice(0, 45)}
                  </strong>
                  <small>
                    {dayText(status.createdAt)} · {timeText(status.createdAt)}
                  </small>
                </span>
                <ChevronLeft size={18} />
              </button>
            ))
          ) : (
            <div className="w-inline-empty">
              <CircleDashed size={42} />
              <p>لا توجد حالات حاليًا.</p>
            </div>
          )}
          {admin && (
            <button className="w-primary" onClick={() => setCompose(true)}>
              <Plus size={19} />
              إضافة حالة
            </button>
          )}
        </>
      )}
    </Modal>
  );
}

function Media({ attachment }: { attachment: Attachment | null }) {
  if (!attachment) return null;
  const url = fileUrl(attachment.id);
  if (attachment.mime.startsWith("image/"))
    return (
      <a
        className="w-message-image"
        href={url}
        target="_blank"
        rel="noreferrer"
      >
        <img src={url} alt={attachment.name} loading="lazy" />
      </a>
    );
  if (attachment.mime.startsWith("video/"))
    return (
      <video
        className="w-message-video"
        src={url}
        controls
        playsInline
        preload="metadata"
        aria-label={attachment.name}
      />
    );
  if (attachment.mime.startsWith("audio/"))
    return (
      <audio
        className="w-message-audio"
        src={url}
        controls
        preload="metadata"
        aria-label="رسالة صوتية"
      />
    );
  return (
    <a className="w-message-file" href={url} download={attachment.name}>
      <FileText size={28} />
      <span>
        <strong>{attachment.name}</strong>
        <small>{Math.ceil(attachment.size / 1024)} KB</small>
      </span>
      <Download size={20} />
    </a>
  );
}

function Thread({
  chat,
  session,
  refreshId,
  presence,
  typing,
  onBack,
  onUpdate,
  onError,
  onRefresh,
  onSettings,
  onStatuses,
  statuses,
}: {
  statuses: Status[];
  chat: Conversation;
  session: Session;
  refreshId: number;
  presence: Record<string, { online: boolean; lastSeen: number }>;
  typing: { conversationId: string; userId: string }[];
  onBack: () => void;
  onUpdate: (changes: object | "delete") => void;
  onError: (text: string) => void;
  onRefresh: () => void;
  onSettings: () => void;
  onStatuses: (id?: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [members, setMembers] = useState(chat.members),
    [hasMore, setHasMore] = useState(false),
    [loading, setLoading] = useState(true),
    [fetchError, setFetchError] = useState("");
  const [draft, setDraft] = useState(""),
    [attachment, setAttachment] = useState<Attachment | null>(null),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false);
  const [emoji, setEmoji] = useState(false),
    [menu, setMenu] = useState(false),
    [info, setInfo] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [search, setSearch] = useState("");
  const [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0);
  const scroller = useRef<HTMLDivElement>(null),
    bottom = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null),
    picker = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null),
    microphone = useRef<MediaStream | null>(null),
    cancelRecording = useRef(false);
  const nearBottom = useRef(true),
    pendingReads = useRef(new Set<number>()),
    lastTyped = useRef(0),
    pendingId = useRef<string | null>(null),
    older = useRef<Message[]>([]),
    olderHasMore = useRef<boolean | null>(null);
  const admin = session.user.role === "admin";
  const peer = admin ? members.find((u) => u.id !== session.user.id) || session.owner : session.owner;
  const livePeer = { ...peer, ...(presence[peer.id] || {}) };
  const peerTyping = typing.some(
    (t) => t.conversationId === chat.id && t.userId !== session.user.id,
  );
  const markRead = useCallback((list: Message[]) => {
    if (document.visibilityState !== 'visible' || !scroller.current || info || document.querySelector('dialog[open]')) return;
    const frame = scroller.current.getBoundingClientRect();
    const visible = new Set(Array.from(scroller.current.querySelectorAll<HTMLElement>('[data-message-id]')).filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.bottom > Math.max(frame.top, 0) && rect.top < Math.min(frame.bottom, window.innerHeight);
    }).map(el => Number(el.dataset.messageId)));
    const ids = list.filter(message => message.senderId !== session.user.id && !message.readAt && visible.has(message.id) && !pendingReads.current.has(message.id)).map(message => message.id);
    ids.forEach(id => pendingReads.current.add(id));
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100);
      void request(`/conversations/${chat.id}/read`, 'POST', { messageIds: batch }).catch(() => batch.forEach(id => pendingReads.current.delete(id)));
    }
  }, [chat.id, session.user.id, info]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => markRead(messages));
    return () => cancelAnimationFrame(frame);
  });
  useEffect(() => {
    const frame = requestAnimationFrame(() => markRead(messages));
    const observer = new IntersectionObserver(() => markRead(messages), { root: scroller.current, threshold: [0, 0.1, 1] });
    scroller.current?.querySelectorAll('[data-message-id]').forEach(el => observer.observe(el));
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [messages, markRead, search]);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await request<{
          messages: Message[];
          members: User[];
          hasMore: boolean;
        }>(`/conversations/${chat.id}/messages`, "GET", undefined, signal);
        const combined = [
          ...older.current.filter(
            (m) => !data.messages.some((n) => n.id === m.id),
          ),
          ...data.messages,
        ];
        setMessages(combined);
        setMembers(data.members);
        setHasMore(olderHasMore.current ?? data.hasMore);
        setFetchError("");
        void acknowledgeMessages(data.messages, session.user.id).catch(() => {});
        if (nearBottom.current)
          requestAnimationFrame(() =>
            bottom.current?.scrollIntoView({ behavior: "smooth" }),
          );
      } catch (err: any) {
        if (err.name !== "AbortError") setFetchError(errorText(err));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [chat.id, session.user.id],
  );
  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal);
    return () => abort.abort();
  }, [load, refreshId]);
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === "visible") {
        markRead(messages);
        void load();
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, [messages, markRead, load]);
  useEffect(
    () => () => {
      cancelRecording.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      microphone.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    if (seconds >= 120 && recorder.current?.state === "recording")
      recorder.current.stop();
  }, [seconds]);
  async function choose(file?: Blob, name?: string) {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadFile(
        file,
        name || "file",
        "message",
        chat.id,
      );
      setAttachment(uploaded);
      setPreview(
        /^(image|video|audio)\//.test(file.type)
          ? URL.createObjectURL(file)
          : "",
      );
      pendingId.current = null;
    } catch (err) {
      onError(errorText(err));
    } finally {
      setUploading(false);
    }
  }
  async function send(event?: FormEvent) {
    event?.preventDefault();
    if ((!draft.trim() && !attachment) || busy || uploading || recording)
      return;
    setBusy(true);
    const clientId = pendingId.current || crypto.randomUUID();
    pendingId.current = clientId;
    try {
      const data = await request<{ message: Message }>(
        `/conversations/${chat.id}/messages`,
        "POST",
        { text: draft, attachmentId: attachment?.id, clientId },
      );
      setMessages((prev) =>
        prev.some((m) => m.id === data.message.id)
          ? prev
          : [...prev, data.message],
      );
      setDraft("");
      setAttachment(null);
      setPreview("");
      setEmoji(false);
      pendingId.current = null;
      nearBottom.current = true;

      onRefresh();
      requestAnimationFrame(() => {
        bottom.current?.scrollIntoView({ behavior: "smooth" });
        input.current?.focus();
      });
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function record() {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      onError("التسجيل الصوتي يحتاج HTTPS ومتصفحًا يدعم الميكروفون.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphone.current = stream;
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const media = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = media;
      const chunks: BlobPart[] = [];
      cancelRecording.current = false;
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        if (!cancelRecording.current) {
          const type = media.mimeType || "audio/webm";
          void choose(
            new Blob(chunks, { type }),
            `voice-${Date.now()}.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`,
          );
        }
      };
      media.start();
      setSeconds(0);
      setRecording(true);
    } catch {
      onError("اسمح باستخدام الميكروفون من إعدادات المتصفح ثم حاول مجددًا.");
    }
  }
  async function loadOlder() {
    if (!messages.length) return;
    const height = scroller.current?.scrollHeight || 0;
    try {
      const page = await request<{ messages: Message[]; hasMore: boolean }>(
        `/conversations/${chat.id}/messages?before=${messages[0].id}`,
      );
      void acknowledgeMessages(page.messages, session.user.id).catch(() => {});
      older.current = [...page.messages, ...older.current];
      setMessages((prev) => [...page.messages, ...prev]);
      setHasMore(page.hasMore);
      olderHasMore.current = page.hasMore;
      requestAnimationFrame(() => {
        if (scroller.current)
          scroller.current.scrollTop += scroller.current.scrollHeight - height;
      });
    } catch (err) {
      onError(errorText(err));
    }
  }
  const filtered = search
    ? messages.filter(
        (m) =>
          m.text.toLowerCase().includes(search.toLowerCase()) ||
          m.attachment?.name.includes(search),
      )
    : messages;
  return (
    <section className="w-thread">
      <header className="w-thread-header">
        {admin && (
          <IconButton
            label="العودة لقائمة المحادثات"
            className="w-mobile-back"
            onClick={onBack}
          >
            <ArrowRight size={23} />
          </IconButton>
        )}
        <button className="w-person" onClick={() => setInfo(true)}>
          <Avatar user={peer} group={chat.isGroup} />
          <span>
            <strong>
              <Name user={peer} text={chat.isGroup ? chat.title : undefined} />
            </strong>
            {admin && peer.phone && (
              <span className="w-peer-phone" dir="ltr">
                {peer.phone}
              </span>
            )}
            <small className={peerTyping ? "w-typing" : ""}>
              {peerTyping
                ? "يكتب الآن…"
                : chat.isGroup
                  ? `${members.length} أعضاء`
                  : livePeer.online
                    ? "متصل الآن"
                    : livePeer.lastSeen
                      ? `آخر ظهور ${dayText(livePeer.lastSeen)}، ${timeText(livePeer.lastSeen)}`
                      : "غير متصل"}
            </small>
          </span>
        </button>
        <div className="w-header-actions">
          <IconButton
            label="البحث في الرسائل"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search size={22} />
          </IconButton>
          <div className="w-menu-wrap">
            <IconButton label="خيارات المحادثة" onClick={() => setMenu(!menu)}>
              <MoreVertical size={22} />
            </IconButton>
            {menu && (
              <>
                <button
                  className="w-menu-scrim"
                  aria-label="إغلاق القائمة"
                  onClick={() => setMenu(false)}
                />
                <div className="w-dropdown">
                  <button
                    onClick={() => {
                      setInfo(true);
                      setMenu(false);
                    }}
                  >
                    <Info size={17} />
                    معلومات المحادثة
                  </button>
                  <button
                    onClick={() => {
                      onStatuses();
                      setMenu(false);
                    }}
                  >
                    <CircleDashed size={17} />
                    الحالات
                  </button>
                  <button
                    onClick={() => {
                      onSettings();
                      setMenu(false);
                    }}
                  >
                    <Settings size={17} />
                    الإعدادات والملف الشخصي
                  </button>
                  {admin && (
                    <>
                      <button
                        onClick={() => {
                          onUpdate({ pinned: !chat.pinned });
                          setMenu(false);
                        }}
                      >
                        <Pin size={17} />
                        {chat.pinned ? "إلغاء التثبيت" : "تثبيت المحادثة"}
                      </button>
                      <button
                        onClick={() => {
                          onUpdate({ archived: !chat.archived });
                          setMenu(false);
                        }}
                      >
                        <Archive size={17} />
                        {chat.archived ? "إلغاء الأرشفة" : "أرشفة المحادثة"}
                      </button>
                      <button
                        className="w-danger"
                        onClick={() => {
                          onUpdate("delete");
                          setMenu(false);
                        }}
                      >
                        <Trash2 size={17} />
                        حذف المحادثة من قائمتي
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      {searchOpen && (
        <div className="w-thread-search">
          <Search size={18} />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث في الرسائل المحمّلة"
            aria-label="بحث داخل المحادثة"
          />
          <IconButton
            label="إغلاق البحث"
            onClick={() => {
              setSearch("");
              setSearchOpen(false);
            }}
          >
            <X size={19} />
          </IconButton>
        </div>
      )}
      <div
        className="w-messages"
        ref={scroller}
        onScroll={() => {
          const el = scroller.current;
          if (el)
            nearBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 130;
          markRead(messages);
        }}
      >
        <div className="w-chat-notice">
          <ShieldCheck size={14} />
          محادثتك الخاصة على وصال مع صاحب الموقع فقط.
        </div>
        {hasMore && (
          <button className="w-load-older" onClick={() => void loadOlder()}>
            تحميل رسائل أقدم
          </button>
        )}
        {loading ? (
          <div className="w-inline-empty">
            <LoaderCircle className="w-spin" size={26} />
          </div>
        ) : fetchError ? (
          <div className="w-inline-empty">
            <WifiOff size={28} />
            <p>{fetchError}</p>
            <button className="w-text-button" onClick={() => void load()}>
              إعادة المحاولة
            </button>
          </div>
        ) : (
          !filtered.length && (
            <div className="w-chat-welcome">
              <Avatar user={peer} />
              <Name user={peer} />
              <p>
                {search
                  ? "لا توجد نتائج لهذه الكلمة."
                  : "ابدأ المحادثة بإرسال رسالة."}
              </p>
            </div>
          )
        )}
        {filtered.map((message, index) => {
          const mine = message.senderId === session.user.id,
            previous = filtered[index - 1];
          return (
            <div className="w-message-entry" key={message.id}>
              {(!previous ||
                dayText(previous.createdAt) !== dayText(message.createdAt)) && (
                <span className="w-day">{dayText(message.createdAt)}</span>
              )}
              <div data-message-id={message.id} className={`w-message-row ${mine ? "mine" : "theirs"}`}>
                <div className="w-bubble">
                  {chat.isGroup && !mine && (
                    <span className="w-message-sender">
                      {members.find((m) => m.id === message.senderId)?.name}
                    </span>
                  )}
                  <Media attachment={message.attachment} />
                  {message.text && <p dir="auto">{message.text}</p>}
                  <div className="w-message-meta">
                    <time dateTime={new Date(message.createdAt).toISOString()}>
                      {timeText(message.createdAt)}
                    </time>
                    {mine && <ReceiptIcon message={message} />}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <footer className="w-composer-wrap">
        {emoji && (
          <div className="w-emojis">
            {[
              "😊",
              "❤️",
              "👍",
              "😂",
              "🙏",
              "🌿",
              "✨",
              "🎉",
              "👋",
              "😍",
              "🤍",
              "👏",
              "☕",
              "🌸",
              "🤔",
              "💚",
            ].map((value) => (
              <button
                key={value}
                onClick={() => {
                  setDraft(draft + value);
                  pendingId.current = null;
                  input.current?.focus();
                }}
              >
                {value}
              </button>
            ))}
          </div>
        )}
        {(attachment || uploading) && (
          <div className="w-upload-preview">
            {uploading ? (
              <LoaderCircle className="w-spin" size={22} />
            ) : attachment?.mime.startsWith("image/") && preview ? (
              <img src={preview} alt="المرفق" />
            ) : attachment?.mime.startsWith("video/") ? (
              <Video size={24} />
            ) : attachment?.mime.startsWith("audio/") ? (
              <Mic size={24} />
            ) : (
              <FileText size={24} />
            )}
            <span>
              <strong>
                {uploading ? "جارٍ رفع الملف…" : attachment?.name}
              </strong>
              <small>{uploading ? "يرجى الانتظار" : "جاهز للإرسال"}</small>
            </span>
            <IconButton
              label="إزالة المرفق"
              disabled={uploading || busy}
              onClick={() => {
                setAttachment(null);
                setPreview("");
                pendingId.current = null;
              }}
            >
              <X size={19} />
            </IconButton>
          </div>
        )}
        <form className="w-composer" onSubmit={send}>
          <input
            className="w-hidden"
            ref={picker}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav,application/pdf,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              void choose(file, file?.name);
              e.target.value = "";
            }}
          />
          {recording ? (
            <>
              <i className="w-record-dot" />
              <span className="w-record-time">
                جارٍ التسجيل {Math.floor(seconds / 60)}:
                {String(seconds % 60).padStart(2, "0")}
              </span>
              <IconButton
                label="إلغاء التسجيل"
                onClick={() => {
                  cancelRecording.current = true;
                  recorder.current?.stop();
                }}
              >
                <X size={22} />
              </IconButton>
              <IconButton
                label="إنهاء التسجيل"
                onClick={() => recorder.current?.stop()}
              >
                <Square size={22} />
              </IconButton>
            </>
          ) : (
            <>
              <IconButton
                label="الرموز التعبيرية"
                onClick={() => setEmoji(!emoji)}
                disabled={busy}
              >
                <Smile size={25} />
              </IconButton>
              <IconButton
                label="إرفاق صورة أو فيديو أو ملف"
                onClick={() => picker.current?.click()}
                disabled={busy || uploading}
              >
                <Paperclip size={24} />
              </IconButton>
              <textarea
                ref={input}
                rows={1}
                dir="auto"
                value={draft}
                maxLength={10000}
                aria-label="نص الرسالة"
                placeholder="اكتب رسالة"
                disabled={busy}
                onChange={(e) => {
                  setDraft(e.target.value);
                  pendingId.current = null;
                  if (Date.now() - lastTyped.current > 1800) {
                    lastTyped.current = Date.now();
                    void request(`/conversations/${chat.id}/typing`, "POST", {
                      active: Boolean(e.target.value),
                    }).catch(() => {});
                  }
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              {draft.trim() || attachment ? (
                <button
                  className="w-send"
                  aria-label="إرسال الرسالة"
                  disabled={busy || uploading}
                >
                  {busy ? (
                    <LoaderCircle className="w-spin" size={23} />
                  ) : (
                    <Send size={23} />
                  )}
                </button>
              ) : (
                <IconButton
                  label="تسجيل رسالة صوتية"
                  onClick={() => void record()}
                  disabled={uploading}
                >
                  <Mic size={25} />
                </IconButton>
              )}
            </>
          )}
        </form>
      </footer>
      {info && !admin && <OwnerInfo owner={session.owner} statuses={statuses} onClose={() => setInfo(false)} onStatus={id => { setInfo(false); onStatuses(id); }} />}
      {info && admin && (
        <Modal title="معلومات المحادثة" onClose={() => setInfo(false)}>
          <div className="w-info-profile">
            <Avatar user={peer} />
            <Name user={peer} />
            <p dir="auto">{peer.about}</p>
          </div>
          <p className="w-modal-description">
            {admin ? "المشاركون في هذه المحادثة" : "أنت وصاحب الموقع فقط"}
          </p>
          {members.map((member) => (
            <div className="w-member" key={member.id}>
              <Avatar user={member} small />
              <span>
                <Name user={member} />
                <small>
                  {member.id === session.user.id
                    ? "أنت"
                    : member.role === "admin"
                      ? "صاحب الموقع"
                      : "زائر"}
                </small>
                {member.phone && (admin || member.id === session.user.id) && (
                  <small dir="ltr">{member.phone} · غير مؤكد</small>
                )}
              </span>
            </div>
          ))}
        </Modal>
      )}
    </section>
  );
}

function Inbox({
  initial,
  theme,
  onTheme,
  onSession,
}: {
  initial: Session;
  theme: string;
  onTheme: () => void;
  onSession: (session: Session) => void;
}) {
  const [session, setSession] = useState(initial),
    [chats, setChats] = useState<Conversation[]>([]),
    [statuses, setStatuses] = useState<Status[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
      initial.conversationId,
    ),
    [refreshId, setRefreshId] = useState(0),
    [connected, setConnected] = useState(false),
    [reconnect, setReconnect] = useState(0);
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [archived, setArchived] = useState(false),
    [loading, setLoading] = useState(true),
    [listError, setListError] = useState("");
  const [totalUnread, setTotalUnread] = useState(0),
    [hasMore, setHasMore] = useState(false),
    [nextOffset, setNextOffset] = useState(50),
    [loadingMore, setLoadingMore] = useState(false);
  const [activeStatus, setActiveStatus] = useState<string | undefined>();
  const [modal, setModal] = useState<"settings" | "statuses" | null>(null),
    [toast, setToast] = useState(""),
    [deleting, setDeleting] = useState(false);
  const [presence, setPresence] = useState<
      Record<string, { online: boolean; lastSeen: number }>
    >({}),
    [typing, setTyping] = useState<
      { conversationId: string; userId: string }[]
    >([]);
  const connectionId = useRef(""),
    admin = session.user.role === "admin";
  const sound = useMessageSound();
  const soundSnapshot = useRef<{
    ready: boolean;
    unread: number;
    incoming: number;
  }>({ ready: false, unread: 0, incoming: 0 });
  const refresh = useCallback(() => setRefreshId((n) => n + 1), []);
  useEffect(() => {
    setSession(initial);
  }, [initial]);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 260);
    return () => clearTimeout(timer);
  }, [query]);
  const listPath = useCallback(
    (offset = 0) =>
      "/conversations?" +
      new URLSearchParams({
        q: admin ? search : "",
        archived: archived ? "1" : "0",
        filter,
        offset: String(offset),
      }),
    [search, archived, filter, admin],
  );
  useEffect(() => {
    const abort = new AbortController();
    void request<{
      conversations: Conversation[];
      totalUnread: number;
      hasMore: boolean;
      nextOffset: number;
    }>(listPath(), "GET", undefined, abort.signal)
      .then((data) => {
        const latest = Math.max(
          0,
          ...data.conversations
            .filter((chat) => chat.lastMessage?.senderId !== session.user.id)
            .map((chat) => chat.lastMessage?.id || 0),
        );
        const previous = soundSnapshot.current;
        if (
          previous.ready &&
          (data.totalUnread > previous.unread || latest > previous.incoming)
        )
          sound.play();
        soundSnapshot.current = {
          ready: true,
          unread: data.totalUnread,
          incoming: Math.max(previous.incoming, latest),
        };
        setChats(data.conversations);
        setTotalUnread(data.totalUnread);
        setHasMore(data.hasMore);
        setNextOffset(data.nextOffset);
        setListError("");
      })
      .catch((err: any) => {
        if (err.name !== "AbortError") setListError(errorText(err));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [listPath, refreshId]);
  const loadStatuses = useCallback(() => {
    void request<{ statuses: Status[] }>("/statuses")
      .then((data) => setStatuses(data.statuses))
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadStatuses();
    const timer = setInterval(loadStatuses, 30000);
    return () => clearInterval(timer);
  }, [loadStatuses, refreshId]);
  useEffect(() => {
    void request<{ profile: User }>("/profile")
      .then((data) =>
        setSession((current) => ({ ...current, owner: data.profile })),
      )
      .catch(() => {});
  }, [refreshId]);
  useEffect(() => {
    connectionId.current ||= crypto.randomUUID();
    const stream = new EventSource(
      apiPath("/events?connection=" + connectionId.current),
    );
    stream.onopen = () => setConnected(true);
    stream.onerror = () => {
      setConnected(false);
      setTyping([]);
    };
    stream.addEventListener("refresh", refresh);
    stream.addEventListener('messages', event => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { messages: Message[] };
        void acknowledgeMessages(payload.messages, session.user.id).then(refresh).catch(() => {});
      } catch { /* An invalid event is retried on reconnect. */ }
    });
    stream.addEventListener("state", (event) => {
      const state = JSON.parse((event as MessageEvent).data) as {
        peers: { id: string; online: boolean; lastSeen: number }[];
        typing: { conversationId: string; userId: string }[];
      };
      setPresence(
        Object.fromEntries(
          state.peers.map((peer) => [
            peer.id,
            { online: peer.online, lastSeen: peer.lastSeen },
          ]),
        ),
      );
      setTyping(state.typing);
    });
    const disconnect = () => {
      void fetch(apiPath("/disconnect"), {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json", "X-Chat-Request": "1" },
        body: JSON.stringify({ connectionId: connectionId.current }),
      }).catch(() => {});
    };
    const offline = () => {
      setConnected(false);
      setTyping([]);
    };
    const online = () => {
      setReconnect((n) => n + 1);
      refresh();
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) online();
    };
    window.addEventListener("pagehide", disconnect);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    window.addEventListener("pageshow", restored);
    const fallback = setInterval(() => {
      if (stream.readyState !== EventSource.OPEN) refresh();
    }, 10000);
    return () => {
      stream.close();
      disconnect();
      clearInterval(fallback);
      window.removeEventListener("pagehide", disconnect);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.removeEventListener("pageshow", restored);
    };
  }, [refresh, reconnect, session.user.id]);
  useEffect(() => {
    document.title = `${totalUnread ? "(" + totalUnread + ") " : ""}وصال | ${admin ? "لوحة المحادثات" : session.owner.name}`;
  }, [totalUnread, admin, session.owner.name]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  const fallbackChat: Conversation | null =
    !admin && session.conversationId
      ? {
          id: session.conversationId,
          title: "",
          isGroup: false,
          members: [session.user, session.owner],
          archived: false,
          pinned: false,
          unread: 0,
          lastMessage: null,
        }
      : null;
  const selected =
    chats.find((chat) => chat.id === selectedId) ||
    (!admin ? fallbackChat : null);
  async function update(changes: object | "delete") {
    if (!selected || !admin) return;
    if (changes === "delete") {
      setDeleting(true);
      return;
    }
    try {
      await request("/conversations/" + selected.id, "PATCH", changes);
      if ("archived" in changes) setSelectedId(null);
      refresh();
    } catch (err) {
      setToast(errorText(err));
    }
  }
  async function deleteChat() {
    if (!selected) return;
    try {
      await request("/conversations/" + selected.id, "DELETE");
      setDeleting(false);
      setSelectedId(null);
      refresh();
    } catch (err) {
      setToast(errorText(err));
    }
  }
  async function more() {
    setLoadingMore(true);
    try {
      const data = await request<{
        conversations: Conversation[];
        hasMore: boolean;
        nextOffset: number;
      }>(listPath(nextOffset));
      setChats((prev) => [
        ...prev,
        ...data.conversations.filter(
          (c) => !prev.some((old) => old.id === c.id),
        ),
      ]);
      setHasMore(data.hasMore);
      setNextOffset(data.nextOffset);
    } catch (err) {
      setToast(errorText(err));
    } finally {
      setLoadingMore(false);
    }
  }
  function saved(user: User) {
    const next = {
      ...session,
      user,
      owner: user.role === "admin" ? user : session.owner,
    };
    setSession(next);
    onSession(next);
    refresh();
  }
  return (
    <main
      className={`w-shell ${selected ? "thread-open" : ""} ${admin ? "is-admin" : "is-guest"}`}
      dir="rtl"
    >
      <nav className="w-rail" aria-label="التنقل">
        <span className="w-rail-logo">
          <MessageCircle size={27} />
        </span>
        <IconButton
          label="المحادثات"
          active
          onClick={() => {
            if (admin) {
              setSelectedId(null);
              setArchived(false);
            }
          }}
        >
          <MessageCircle size={24} />
          {admin && totalUnread > 0 && (
            <b className="w-rail-count">
              {totalUnread > 99 ? "99+" : totalUnread}
            </b>
          )}
        </IconButton>
        <IconButton label="الحالات" onClick={() => setModal("statuses")}>
          <CircleDashed size={25} />
          {statuses.length > 0 && <i className="w-status-dot" />}
        </IconButton>
        {admin && (
          <IconButton
            label="المحادثات المؤرشفة"
            onClick={() => {
              setArchived(true);
              setSelectedId(null);
            }}
          >
            <Archive size={23} />
          </IconButton>
        )}
        <span className="w-spacer" />
        <IconButton
          label={theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
          onClick={onTheme}
        >
          {theme === "dark" ? <Sun size={23} /> : <Moon size={23} />}
        </IconButton>
        <IconButton label="الإعدادات" onClick={() => setModal("settings")}>
          <Settings size={24} />
        </IconButton>
        <button
          className="w-me-button"
          aria-label="ملفي الشخصي"
          onClick={() => setModal("settings")}
        >
          <Avatar user={session.user} small />
        </button>
      </nav>
      <aside className="w-sidebar">
        <header className="w-sidebar-header">
          <Brand />
          <div>
            <IconButton label="الحالات" onClick={() => setModal("statuses")}>
              <CircleDashed size={23} />
              {statuses.length > 0 && <i className="w-status-dot" />}
            </IconButton>
            <IconButton
              label="الإعدادات والملف الشخصي"
              onClick={() => setModal("settings")}
            >
              <MoreVertical size={23} />
            </IconButton>
          </div>
        </header>
        <div className="w-sidebar-title">
          <h1>
            {admin ? (archived ? "المؤرشفة" : "المحادثات") : "محادثتك الخاصة"}
          </h1>
          {admin ? (
            <span className="w-role-label">
              <ShieldCheck size={13} />
              المدير
            </span>
          ) : (
            <span className="w-role-label">
              <ShieldCheck size={13} />
              ضيف
            </span>
          )}
        </div>
        {admin ? (
          <>
            <div className="w-search">
              <Search size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث عن محادثة"
                aria-label="البحث عن المحادثات"
              />
              {query && (
                <IconButton label="مسح البحث" onClick={() => setQuery("")}>
                  <X size={17} />
                </IconButton>
              )}
            </div>
            <div className="w-filters">
              {[
                ["all", "الكل"],
                ["unread", "غير المقروءة"],
                ["groups", "المجموعات"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  className={filter === value ? "selected" : ""}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="w-archive-row"
              onClick={() => {
                setArchived(!archived);
                setSelectedId(null);
              }}
            >
              <Archive size={20} />
              <span>{archived ? "العودة للمحادثات" : "المؤرشفة"}</span>
              <ChevronLeft size={17} />
            </button>
          </>
        ) : (
          <div className="w-guest-hint">
            <ShieldCheck size={17} />
            <p>
              أنت وصاحب الموقع فقط.
              <br />
              تعود إلى محادثتك من هذا المتصفح.
            </p>
          </div>
        )}
        <div className="w-chat-list">
          {loading ? (
            <div className="w-inline-empty">
              <LoaderCircle className="w-spin" size={24} />
            </div>
          ) : listError ? (
            <div className="w-inline-empty">
              <WifiOff />
              <p>{listError}</p>
              <button className="w-text-button" onClick={refresh}>
                إعادة المحاولة
              </button>
            </div>
          ) : !chats.length && admin ? (
            <div className="w-inline-empty">
              <MessageCircle size={35} />
              <p>
                {search
                  ? "لا توجد محادثات مطابقة."
                  : archived
                    ? "لا توجد محادثات مؤرشفة."
                    : "ستظهر محادثات الزوار هنا."}
              </p>
            </div>
          ) : (
            (admin
              ? chats
              : chats.length
                ? chats
                : fallbackChat
                  ? [fallbackChat]
                  : []
            ).map((chat) => {
              const peer =
                  chat.members.find((user) => user.id !== session.user.id) ||
                  session.owner,
                last = chat.lastMessage;
              const writing = typing.some(
                (item) =>
                  item.conversationId === chat.id &&
                  item.userId !== session.user.id,
              );
              return (
                <button
                  className={`w-chat-row ${chat.id === selectedId ? "selected" : ""}`}
                  key={chat.id}
                  onClick={() => setSelectedId(chat.id)}
                >
                  <span className="w-avatar-wrap">
                    <Avatar user={peer} group={chat.isGroup} />
                    {(presence[peer.id]?.online ?? peer.online) && (
                      <i className="w-online-indicator" />
                    )}
                  </span>
                  <span className="w-chat-details">
                    <span className="w-chat-title">
                      <Name
                        user={chat.isGroup ? undefined : peer}
                        text={chat.isGroup ? chat.title : undefined}
                      />
                      <time className={chat.unread ? "unread" : ""}>
                        {last
                          ? new Date(last.createdAt).toDateString() ===
                            new Date().toDateString()
                            ? timeText(last.createdAt)
                            : dayText(last.createdAt)
                          : ""}
                      </time>
                    </span>
                    <span className="w-chat-preview">
                      <span className={writing ? "w-typing" : ""}>
                        {writing ? (
                          "يكتب الآن…"
                        ) : last ? (
                          <>
                            {last.senderId === session.user.id && (
                              <ReceiptIcon message={last} size={15} />
                            )}
                            {last.text ||
                              (last.attachment?.mime.startsWith("image/")
                                ? "صورة"
                                : last.attachment?.mime.startsWith("video/")
                                  ? "فيديو"
                                  : last.attachment?.mime.startsWith("audio/")
                                    ? "رسالة صوتية"
                                    : "ملف")}
                          </>
                        ) : (
                          "ابدأ المحادثة"
                        )}
                      </span>
                      <span className="w-chat-badges">
                        {chat.pinned && <Pin size={13} />}
                        {chat.unread > 0 && (
                          <b>{chat.unread > 99 ? "99+" : chat.unread}</b>
                        )}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })
          )}
          {hasMore && admin && (
            <button
              className="w-load-list"
              onClick={() => void more()}
              disabled={loadingMore}
            >
              {loadingMore ? "جارٍ التحميل…" : "تحميل محادثات أخرى"}
            </button>
          )}
        </div>
        <footer className={`w-connection ${connected ? "" : "offline"}`}>
          <i />
          {connected ? "متصل بوصال" : "جارٍ إعادة الاتصال…"}
        </footer>
      </aside>
      {selected ? (
        <Thread
          key={selected.id}
          chat={selected}
          session={session}
          refreshId={refreshId}
          presence={presence}
          typing={typing}
          onBack={() => setSelectedId(null)}
          onUpdate={(changes) => void update(changes)}
          onError={setToast}
          onRefresh={refresh}
          onSettings={() => setModal("settings")}
          statuses={statuses}
          onStatuses={id => { setActiveStatus(id); setModal("statuses"); }}
        />
      ) : (
        <section className="w-welcome">
          <span className="w-welcome-art">
            <MessageCircle size={79} strokeWidth={1.2} />
            <span>وصال</span>
          </span>
          <h2>محادثاتك، في مكان واحد</h2>
          <p>
            اختر محادثة للرد على زائر.
            <br />
            كل زائر يرى حديثه معك فقط.
          </p>
          <span className="w-welcome-security">
            <ShieldCheck size={17} />
            لوحة خاصة بصاحب الموقع
          </span>
        </section>
      )}
      {modal === "settings" && (
        <ProfileSettings
          session={session}
          sound={sound}
          theme={theme}
          onTheme={onTheme}
          onClose={() => setModal(null)}
          onSave={saved}
          onError={setToast}
        />
      )}
      {modal === "statuses" && (
        <StatusPanel
          initialId={activeStatus}
          session={session}
          statuses={statuses}
          onClose={() => { setModal(null); setActiveStatus(undefined); }}
          refresh={loadStatuses}
          onError={setToast}
        />
      )}
      {deleting && (
        <Modal
          title="حذف المحادثة من قائمتي"
          onClose={() => setDeleting(false)}
        >
          <p className="w-modal-description">
            تُحذف الرسائل من عرضك أنت، وتبقى لدى الزائر. تظهر المحادثة مجددًا
            إذا أرسل رسالة جديدة.
          </p>
          <button
            className="w-primary w-delete-button"
            onClick={() => void deleteChat()}
          >
            <Trash2 size={18} />
            حذف من قائمتي
          </button>
        </Modal>
      )}
      {toast && (
        <div className="w-toast" role="alert">
          <span>{toast}</span>
          <IconButton label="إغلاق التنبيه" onClick={() => setToast("")}>
            <X size={18} />
          </IconButton>
        </div>
      )}
    </main>
  );
}

const bootTasks = new Map<string, Promise<Session>>();
function bootstrap(admin: boolean): Promise<Session> {
  const key = admin ? "admin" : "guest";
  const existing = bootTasks.get(key);
  if (existing) return existing;
  const task: Promise<Session> = (async () => {
    const begin = () => request<Session>("/session", "POST", { mode: key });
    if (typeof navigator !== "undefined" && navigator.locks)
      return await navigator.locks.request(
        "wisal-session",
        async () => await begin(),
      );
    return await begin();
  })().finally(() => bootTasks.delete(key));
  bootTasks.set(key, task);
  return task;
}
const LegacyMessenger = lazy(() => import("./legacy/ChatApp"));
export default function Messenger({
  mode,
}: {
  mode?: "guest" | "admin" | "classic";
}) {
  const [session, setSession] = useState<Session | null>(null),
    [error, setError] = useState<Error | null>(null),
    [authMode, setAuthMode] = useState("chatgpt"),
    [attempt, setAttempt] = useState(0),
    [theme, setTheme] = useState("light");
  const [adminPage, setAdminPage] = useState(
      mode === "admin" || mode === "classic",
    ),
    [classic, setClassic] = useState(mode === "classic");
  useEffect(() => {
    setAdminPage(
      mode === "admin" ||
        mode === "classic" ||
        /^\/(admin|classic)(\/|$)/.test(location.pathname),
    );
    setClassic(
      mode === "classic" || /^\/classic(\/|$)/.test(location.pathname),
    );
    const saved = localStorage.getItem("wisal.theme");
    setTheme(
      saved === "dark" || saved === "light"
        ? saved
        : matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light",
    );
  }, [mode]);
  useEffect(() => {
    let alive = true;
    const asAdmin =
      mode === "admin" ||
      mode === "classic" ||
      /^\/(admin|classic)(\/|$)/.test(location.pathname);
    setError(null);
    void request<{ authMode: string }>("/profile")
      .then((data) => {
        if (alive) setAuthMode(data.authMode);
      })
      .catch(() => {});
    void bootstrap(asAdmin)
      .then((data) => {
        if (alive) setSession(data);
      })
      .catch((err) => {
        if (alive) setError(err);
      });
    return () => {
      alive = false;
    };
  }, [mode, attempt]);
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("wisal.theme", next);
  }
  return (
    <div className="wisal-app" data-theme={theme} dir="rtl">
      {session ? (
        classic && session.user.role === "admin" ? (
          <Suspense
            fallback={
              <div className="w-boot">
                <LoaderCircle className="w-spin" />
              </div>
            }
          >
            <LegacyMessenger />
          </Suspense>
        ) : (
          <Inbox
            initial={session}
            theme={theme}
            onTheme={toggleTheme}
            onSession={setSession}
          />
        )
      ) : adminPage &&
        error instanceof ApiError &&
        [401, 403].includes(error.status) ? (
        <Login
          authMode={authMode}
          error={
            error.status === 403
              ? "هذا الحساب غير مخوّل لإدارة الموقع. استخدم حساب صاحب الموقع."
              : ""
          }
          onSuccess={() => setAttempt((n) => n + 1)}
        />
      ) : (
        <div className="w-boot">
          <Brand />
          {error ? (
            <>
              <WifiOff size={36} />
              <p>{errorText(error)}</p>
              <button
                className="w-primary"
                onClick={() => setAttempt((n) => n + 1)}
              >
                <RefreshCw size={18} />
                إعادة المحاولة
              </button>
            </>
          ) : (
            <>
              <LoaderCircle className="w-spin" size={27} />
              <p>
                {adminPage ? "نتحقق من صلاحية المدير…" : "نفتح محادثتك الخاصة…"}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
