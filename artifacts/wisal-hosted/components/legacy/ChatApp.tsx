'use client';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  MessageCircle,
  MessageSquarePlus,
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
  Users,
  Archive,
  Pin,
  Settings,
  LogOut,
  ChevronLeft,
  Download,
  FileText,
  Info,
  WifiOff,
  LoaderCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  AtSign,
  Plus,
  CheckCircle2,
} from "lucide-react";
import {
  API,
  ApiError,
  api,
  attachmentUrl,
  dayOf,
  timeOf,
  titleOf,
  uploadFromBlob,
  type User,
  type Conversation,
  type Message,
  type MessagePage,
  type Upload,
} from "./api";
import "./chat.css";
import VerifiedBadge from "./VerifiedBadge";
import ProfileLanding from "./ProfileLanding";

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "تعذّر إتمام العملية.";
function IconButton({
  label,
  children,
  onClick,
  className = "",
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Avatar({
  user,
  group = false,
  name,
  small = false,
}: {
  user?: User;
  group?: boolean;
  name?: string;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar ${small ? "small" : ""} ${group ? "group-avatar" : ""}`}
      style={
        { "--avatar-color": user?.color || "#448274" } as React.CSSProperties
      }
    >
      {!group && user?.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.name} />
      ) : group ? (
        <Users size={small ? 19 : 24} />
      ) : (
        (name || user?.name || "و").trim().slice(0, 2)
      )}
    </span>
  );
}
function Brand() {
  return (
    <span className="brand">
      <span className="brand-icon">
        <MessageCircle size={24} />
      </span>
      <span>
        وصال<span className="brand-dot">.</span>
      </span>
    </span>
  );
}

function Auth({
  onSuccess,
  profile,
  onBack,
}: {
  onSuccess: (user: User) => void;
  profile?: User;
  onBack: () => void;
}) {
  const [register, setRegister] = useState(true),
    [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>(
        `/auth/${register ? "register" : "login"}`,
        "POST",
        Object.fromEntries(form),
      );
      onSuccess(result.user);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell" dir="rtl">
      <section className="auth-form-section">
        <div className="auth-top">
          <Brand />
          <IconButton label="العودة إلى الحساب" onClick={onBack}>
            <ArrowRight size={21} />
          </IconButton>
        </div>
        {profile && (
          <div className="auth-account">
            <Avatar user={profile} small />
            <span className="account-name">
              <span dir="ltr">{profile.handle}</span>
              <VerifiedBadge />
            </span>
          </div>
        )}
        <div className="auth-form-wrap">
          <span className="eyebrow">كل محادثة تقرّبنا</span>
          <h1>{register ? "أهلاً بك في وصال" : "سعداء بعودتك"}</h1>
          <p className="muted">
            {register
              ? "مساحة بسيطة تجمعك بمن تحب. أنشئ حسابك وابدأ الحديث."
              : "سجّل دخولك لتكمل محادثاتك من حيث توقفت."}
          </p>
          <div className="auth-tabs">
            <button
              className={register ? "active" : ""}
              onClick={() => {
                setRegister(true);
                setError("");
              }}
            >
              حساب جديد
            </button>
            <button
              className={!register ? "active" : ""}
              onClick={() => {
                setRegister(false);
                setError("");
              }}
            >
              تسجيل الدخول
            </button>
          </div>
          <form onSubmit={submit}>
            {register && (
              <label>
                الاسم الظاهر
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="كيف يناديك أصدقاؤك؟"
                  maxLength={60}
                  required
                />
              </label>
            )}
            <label>
              اسم المستخدم
              <div className="input-with-icon">
                <AtSign size={18} />
                <input
                  name="handle"
                  dir="ltr"
                  placeholder="your_name"
                  autoComplete="username"
                  minLength={3}
                  maxLength={32}
                  pattern="[a-zA-Z0-9_]{3,32}"
                  required
                />
              </div>
              <small>حروف إنجليزية وأرقام، بدون مسافات.</small>
            </label>
            <label>
              كلمة المرور
              <div className="input-with-icon">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={register ? "new-password" : "current-password"}
                  minLength={8}
                  maxLength={128}
                  placeholder="8 أحرف على الأقل"
                  required
                />
                <IconButton
                  label={
                    showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"
                  }
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </IconButton>
              </div>
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="primary-button auth-submit" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={20} />
              ) : (
                <>
                  {register ? "إنشاء حساب وبدء المحادثة" : "دخول إلى محادثاتي"}
                  <ChevronLeft size={18} />
                </>
              )}
            </button>
          </form>
          <p className="auth-note">
            <ShieldCheck size={17} /> حسابك يحفظ محادثاتك عبر الأجهزة.
          </p>
        </div>
        <span className="auth-footer">وصال · حديث أقرب، كل يوم</span>
      </section>
      <section className="auth-art" aria-label="معاينة تصميم المحادثات">
        <span className="art-orbit orbit-one" />
        <span className="art-orbit orbit-two" />
        <span className="art-spark">✳</span>
        <div className="art-copy">
          <span className="art-kicker">مسافة أقل. كلام أكثر.</span>
          <h2>
            أحاديث صغيرة،
            <br />
            روابط كبيرة.
          </h2>
          <p>
            للسؤال عن الحال، وللفكرة الجديدة،
            <br />
            ولكل «اشتقنا لك» لم تُرسل بعد.
          </p>
        </div>
        <div className="preview-chat">
          <div className="preview-chat-head">
            <Avatar user={profile} name="سارة" />
            <div>
              <strong className="account-name">
                {profile?.handle || "سارة أحمد"}
                {profile?.verified ? <VerifiedBadge /> : null}
              </strong>
              <small>معاينة للمحادثة</small>
            </div>
            <MessageCircle size={22} />
          </div>
          <span className="preview-day">اليوم</span>
          <div className="preview-bubble">
            مرحباً! كيف كان يومك؟ 🌿<small>١٠:٢٤ ص</small>
          </div>
          <div className="preview-bubble outgoing">
            أجمل لما سمعت منك ✨
            <small>
              ١٠:٢٥ ص <CheckCheck size={13} />
            </small>
          </div>
          <div className="preview-typing">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="art-bottom">
          <span>
            <MessageCircle size={17} /> محادثات مباشرة
          </span>
          <span>
            <Users size={18} /> مجموعات تجمعكم
          </span>
        </div>
      </section>
    </main>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      dir="rtl"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <IconButton label="إغلاق" onClick={onClose}>
          <X size={21} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
function NewConversation({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [group, setGroup] = useState(false);
  const [selected, setSelected] = useState<User[]>([]),
    [title, setTitle] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(query), 300);
    return () => clearTimeout(timeout);
  }, [query]);
  const result = useQuery({
    queryKey: ["users", search],
    queryFn: ({ signal }) =>
      api<{ users: User[] }>(
        `/users?q=${encodeURIComponent(search)}`,
        "GET",
        undefined,
        signal,
      ),
    enabled: search.trim().length >= 2,
  });
  async function create(users: User[]) {
    setBusy(true);
    setError("");
    try {
      const { id } = await api<{ id: string }>("/conversations", "POST", {
        userIds: users.map((u) => u.id),
        isGroup: group,
        title,
      });
      onCreated(id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={group ? "مجموعة جديدة" : "محادثة جديدة"} onClose={onClose}>
      <div className="mode-toggle">
        <button
          className={!group ? "active" : ""}
          onClick={() => {
            setGroup(false);
            setSelected([]);
          }}
        >
          <MessageCircle size={17} />
          محادثة فردية
        </button>
        <button
          className={group ? "active" : ""}
          onClick={() => setGroup(true)}
        >
          <Users size={17} />
          مجموعة
        </button>
      </div>
      {group && (
        <label className="modal-label">
          اسم المجموعة
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="مثلاً: العائلة"
          />
        </label>
      )}
      <div className="search-field">
        <Search size={18} />
        <input
          autoFocus={!group}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بالاسم أو @اسم_المستخدم"
          aria-label="البحث عن مستخدم"
        />
      </div>
      {!!selected.length && (
        <div className="selected-users">
          {selected.map((user) => (
            <button
              key={user.id}
              onClick={() =>
                setSelected(selected.filter((u) => u.id !== user.id))
              }
            >
              {user.name}
              <X size={13} />
            </button>
          ))}
        </div>
      )}
      <div className="user-results">
        {search.trim().length < 2 ? (
          <div className="inline-empty">
            <AtSign size={28} />
            <p>ابحث عن صديق مسجّل في وصال.</p>
            <small>
              اكتب حرفين على الأقل. يمكنك مشاركة اسم مستخدمك مع أصدقائك.
            </small>
          </div>
        ) : result.isPending ? (
          <LoaderCircle className="spin" />
        ) : result.error ? (
          <p className="form-error">{errorText(result.error)}</p>
        ) : !result.data?.users.length ? (
          <div className="inline-empty">
            <Search size={28} />
            <p>لم نعثر على مستخدم بهذا الاسم.</p>
          </div>
        ) : (
          result.data.users.map((user) => (
            <button
              className="user-result"
              key={user.id}
              disabled={busy}
              onClick={() =>
                group
                  ? setSelected(
                      selected.some((u) => u.id === user.id)
                        ? selected.filter((u) => u.id !== user.id)
                        : [...selected, user],
                    )
                  : void create([user])
              }
            >
              <Avatar user={user} />
              <span>
                <strong className="account-name">
                  {user.name}
                  {user.verified ? <VerifiedBadge /> : null}
                </strong>
                <small dir="ltr">@{user.handle}</small>
              </span>
              {group ? (
                <span
                  className={`selection-check ${selected.some((u) => u.id === user.id) ? "checked" : ""}`}
                >
                  <Check size={15} />
                </span>
              ) : (
                <ChevronLeft size={18} />
              )}
            </button>
          ))
        )}
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {group && (
        <button
          className="primary-button"
          disabled={
            !title.trim() || !selected.length || selected.length > 31 || busy
          }
          onClick={() => void create(selected)}
        >
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <>
              <Plus size={18} /> إنشاء المجموعة ({selected.length + 1})
            </>
          )}
        </button>
      )}
    </Modal>
  );
}
function Profile({
  user,
  onClose,
  onSave,
  onLogout,
}: {
  user: User;
  onClose: () => void;
  onSave: (user: User) => void;
  onLogout: () => void;
}) {
  const [name, setName] = useState(user.name),
    [about, setAbout] = useState(user.about),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api<{ user: User }>("/me", "PATCH", { name, about });
      onSave(data.user);
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="الملف الشخصي" onClose={onClose}>
      <div className="profile-top">
        <Avatar user={user} />
        <strong className="account-name">
          {user.name}
          {user.verified ? <VerifiedBadge /> : null}
        </strong>
        <span dir="ltr">@{user.handle}</span>
      </div>
      <form onSubmit={save}>
        <label>
          الاسم الظاهر
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
        </label>
        <label>
          نبذة عنك
          <input
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            maxLength={140}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={18} /> : "حفظ التغييرات"}
        </button>
      </form>
      <button className="logout-button" onClick={onLogout}>
        <LogOut size={18} /> تسجيل الخروج
      </button>
    </Modal>
  );
}

function AttachmentView({ message }: { message: Message }) {
  const file = message.attachment;
  if (!file) return null;
  const url = attachmentUrl(file.id);
  if (file.mime.startsWith("image/"))
    return (
      <a href={url} target="_blank" rel="noreferrer" className="message-image">
        <img src={url} alt={file.name} loading="lazy" />
      </a>
    );
  if (file.mime.startsWith("audio/"))
    return (
      <audio
        className="message-audio"
        src={url}
        controls
        preload="metadata"
        aria-label="رسالة صوتية"
      />
    );
  return (
    <a className="message-file" href={url} download={file.name}>
      <FileText size={28} />
      <span>
        <strong>{file.name}</strong>
        <small>{(file.size / 1024).toFixed(0)} KB</small>
      </span>
      <Download size={19} />
    </a>
  );
}

function ConversationPane({
  chat,
  user,
  onBack,
  onUpdate,
  onError,
}: {
  chat: Conversation;
  user: User;
  onBack: () => void;
  onUpdate: (values: object) => void;
  onError: (text: string) => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(""),
    [upload, setUpload] = useState<Upload | null>(null),
    [sending, setSending] = useState(false);
  const [emoji, setEmoji] = useState(false),
    [info, setInfo] = useState(false),
    [menu, setMenu] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [search, setSearch] = useState("");
  const [older, setOlder] = useState<Message[]>([]),
    [hasOlder, setHasOlder] = useState(true),
    [loadingOlder, setLoadingOlder] = useState(false),
    [typingName, setTypingName] = useState("");
  const [recording, setRecording] = useState(false),
    [recordSeconds, setRecordSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null),
    recordingStream = useRef<MediaStream | null>(null),
    recordingCancelled = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null),
    scrollArea = useRef<HTMLDivElement>(null),
    bottom = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null);
  const [typingPing, setTypingPing] = useState(0);
  const markReadRef = useRef<() => void>(() => {});
  const lastTyped = useRef(0),
    readIds = useRef(new Set<number>()),
    pendingId = useRef<string | null>(null),
    isNearBottom = useRef(true);
  const messagesQuery = useQuery({
    queryKey: ["messages", chat.id],
    queryFn: () => api<MessagePage>(`/conversations/${chat.id}/messages`),
    refetchInterval: 15_000,
  });
  const recent = messagesQuery.data?.messages || [];
  const messages = [
    ...older.filter((m) => !recent.some((r) => r.id === m.id)),
    ...recent,
  ];
  const members = messagesQuery.data?.members || chat.members;
  const peer = members.find((u) => u.id !== user.id);
  const lastId = recent.at(-1)?.id;
  useEffect(() => {
    if (isNearBottom.current)
      bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [lastId]);
  useEffect(() => {
    const incoming = messages.filter(message => message.senderId !== user.id && !message.deliveredAt).map(message => message.id);
    for (let offset = 0; offset < incoming.length; offset += 100) void api('/receipts/delivered', 'POST', { messageIds: incoming.slice(offset, offset + 100) }).catch(() => {});
    function markRead() {
      if (document.visibilityState !== 'visible' || !scrollArea.current || document.querySelector('dialog[open]')) return;
      const frame = scrollArea.current.getBoundingClientRect();
      const visible = new Set(Array.from(scrollArea.current.querySelectorAll<HTMLElement>('[data-message-id]')).filter(el => { const rect = el.getBoundingClientRect(); return rect.bottom > Math.max(0,frame.top) && rect.top < Math.min(window.innerHeight, frame.bottom); }).map(el => Number(el.dataset.messageId)));
      const ids = messages.filter(message => message.senderId !== user.id && !message.readAt && visible.has(message.id) && !readIds.current.has(message.id)).map(message => message.id);
      ids.forEach(id => readIds.current.add(id));
      for (let offset = 0; offset < ids.length; offset += 100) { const batch = ids.slice(offset, offset + 100); void api(`/conversations/${chat.id}/read`, 'POST', { messageIds: batch }).catch(() => batch.forEach(id => readIds.current.delete(id))); }
    }
    markReadRef.current = markRead;
    const frame = requestAnimationFrame(markRead);
    const observer = new IntersectionObserver(markRead, { root: scrollArea.current });
    scrollArea.current?.querySelectorAll('[data-message-id]').forEach(el => observer.observe(el));
    document.addEventListener('visibilitychange', markRead);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', markRead); };
  }, [messagesQuery.dataUpdatedAt, older, chat.id, user.id]);
  useEffect(() => {
    function typingEvent(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (detail.conversationId === chat.id) {
        setTypingPing(Date.now());
        setTypingName(
          members.find((u) => u.id === detail.userId)?.name || "المستخدم",
        );
      }
    }
    window.addEventListener("wisal-typing", typingEvent);
    return () => window.removeEventListener("wisal-typing", typingEvent);
  }, [chat.id, members]);
  useEffect(() => {
    if (!typingName) return;
    const timer = setTimeout(() => setTypingName(""), 4_000);
    return () => clearTimeout(timer);
  }, [typingName, typingPing]);
  useEffect(
    () => () => {
      recordingCancelled.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      recordingStream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    if (recordSeconds >= 120 && recorder.current?.state === "recording")
      recorder.current.stop();
  }, [recordSeconds]);
  async function send(event?: FormEvent) {
    event?.preventDefault();
    if ((!draft.trim() && !upload) || sending || recording) return;
    setSending(true);
    const clientId = pendingId.current || crypto.randomUUID();
    pendingId.current = clientId;
    try {
      await api(`/conversations/${chat.id}/messages`, "POST", {
        clientId,
        text: draft,
        attachment: upload
          ? { name: upload.name, mime: upload.mime, data: upload.data }
          : null,
      });
      pendingId.current = null;
      setDraft("");
      setUpload(null);
      setEmoji(false);
      isNearBottom.current = true;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["messages", chat.id] }),
        qc.invalidateQueries({ queryKey: ["conversations"] }),
      ]);
      input.current?.focus();
    } catch (err) {
      onError(errorText(err));
    } finally {
      setSending(false);
    }
  }
  async function attach(file?: File) {
    if (!file) return;
    try {
      setUpload(await uploadFromBlob(file, file.name));
      pendingId.current = null;
    } catch (err) {
      onError(errorText(err));
    }
  }
  async function record() {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      onError("التسجيل الصوتي يحتاج متصفحًا يدعمه واتصال HTTPS أو localhost.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStream.current = stream;
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const media = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = media;
      const chunks: BlobPart[] = [];
      recordingCancelled.current = false;
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      media.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (!recordingCancelled.current) {
          const type = media.mimeType || "audio/webm";
          void uploadFromBlob(
            new Blob(chunks, { type }),
            `voice-${Date.now()}.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`,
          )
            .then((file) => {
              setUpload(file);
              pendingId.current = null;
            })
            .catch((err) => onError(errorText(err)));
        }
      };
      media.start();
      setRecordSeconds(0);
      setRecording(true);
    } catch {
      onError(
        "تعذّر الوصول إلى الميكروفون. اسمح باستخدامه من إعدادات المتصفح.",
      );
    }
  }
  async function loadOlder() {
    if (!messages.length || loadingOlder) return;
    setLoadingOlder(true);
    const previousHeight = scrollArea.current?.scrollHeight || 0;
    try {
      const page = await api<MessagePage>(
        `/conversations/${chat.id}/messages?before=${messages[0].id}`,
      );
      setOlder((prev) => [...page.messages, ...prev]);
      setHasOlder(page.hasMore);
      requestAnimationFrame(() => {
        if (scrollArea.current)
          scrollArea.current.scrollTop +=
            scrollArea.current.scrollHeight - previousHeight;
      });
    } catch (err) {
      onError(errorText(err));
    } finally {
      setLoadingOlder(false);
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
    <section className="conversation-pane">
      <header className="conversation-header">
        <IconButton
          label="العودة للمحادثات"
          className="mobile-back"
          onClick={onBack}
        >
          <ArrowRight size={22} />
        </IconButton>
        <button className="conversation-person" onClick={() => setInfo(true)}>
          <Avatar user={peer} group={chat.isGroup} />
          <span>
            <strong className="account-name">
              <span className="name-text">{titleOf(chat, user.id)}</span>
              {!chat.isGroup && peer?.verified ? <VerifiedBadge /> : null}
            </strong>
            <small className={typingName ? "typing-text" : ""}>
              {typingName ? (
                `${typingName} يكتب الآن…`
              ) : chat.isGroup ? (
                `${members.length} أعضاء`
              ) : peer && Date.now() - peer.lastSeen < 45_000 ? (
                <>
                  <i className="online-dot" />
                  متصل الآن
                </>
              ) : peer?.lastSeen ? (
                `آخر ظهور ${dayOf(peer.lastSeen)}، ${timeOf(peer.lastSeen)}`
              ) : (
                "غير متصل"
              )}
            </small>
          </span>
        </button>
        <div className="header-actions">
          <IconButton
            label="البحث في المحادثة"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search size={21} />
          </IconButton>
          <IconButton label="معلومات المحادثة" onClick={() => setInfo(true)}>
            <Info size={21} />
          </IconButton>
          <div className="menu-wrap">
            <IconButton label="خيارات المحادثة" onClick={() => setMenu(!menu)}>
              <MoreVertical size={21} />
            </IconButton>
            {menu && (
              <>
                <button
                  className="menu-dismiss"
                  aria-label="إغلاق القائمة"
                  onClick={() => setMenu(false)}
                />
                <div className="dropdown">
                  <button
                    onClick={() => {
                      onUpdate({ pinned: !chat.pinned });
                      setMenu(false);
                    }}
                  >
                    <Pin size={16} />
                    {chat.pinned ? "إلغاء التثبيت" : "تثبيت المحادثة"}
                  </button>
                  <button
                    onClick={() => {
                      onUpdate({ archived: !chat.archived });
                      setMenu(false);
                    }}
                  >
                    <Archive size={16} />
                    {chat.archived ? "إلغاء الأرشفة" : "أرشفة المحادثة"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      {searchOpen && (
        <div className="conversation-search">
          <Search size={17} />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث في الرسائل المحمّلة"
            aria-label="البحث في الرسائل"
          />
          <IconButton
            label="إغلاق البحث"
            onClick={() => {
              setSearch("");
              setSearchOpen(false);
            }}
          >
            <X size={18} />
          </IconButton>
        </div>
      )}
      <div
        className="messages-area"
        ref={scrollArea}
        onScroll={() => {
          const el = scrollArea.current;
          if (el)
            isNearBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 150;
          if (isNearBottom.current) markReadRef.current();
        }}
      >
        <div className="conversation-start">
          <MessageCircle size={15} />
          هذه بداية حديثكم على وصال.
        </div>
        {(messagesQuery.data?.hasMore || older.length > 0) && hasOlder && (
          <button
            className="load-older"
            onClick={() => void loadOlder()}
            disabled={loadingOlder}
          >
            {loadingOlder ? "جارٍ التحميل…" : "تحميل رسائل أقدم"}
          </button>
        )}
        {messagesQuery.isPending ? (
          <div className="inline-empty">
            <LoaderCircle className="spin" />
          </div>
        ) : messagesQuery.error ? (
          <div className="inline-empty">
            <WifiOff />
            <p>{errorText(messagesQuery.error)}</p>
            <button
              className="text-button"
              onClick={() => void messagesQuery.refetch()}
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          !filtered.length && (
            <div className="chat-empty">
              <span>🌿</span>
              <h3>{search ? "لا توجد نتائج" : "الكلمة الأولى تصنع البداية"}</h3>
              <p>
                {search
                  ? "جرّب كلمة أخرى أو حمّل الرسائل الأقدم."
                  : "أرسل تحية وابدأ المحادثة."}
              </p>
            </div>
          )
        )}
        {filtered.map((message, index) => {
          const mine = message.senderId === user.id,
            sender = members.find((m) => m.id === message.senderId);
          const read = Boolean(message.readAt);
          const previous = filtered[index - 1];
          return (
            <div key={message.id} className="message-entry">
              {(!previous ||
                dayOf(previous.createdAt) !== dayOf(message.createdAt)) && (
                <div className="day-divider">{dayOf(message.createdAt)}</div>
              )}
              <div data-message-id={message.id} className={`message-line ${mine ? "mine" : "theirs"}`}>
                <div className="message-bubble">
                  {chat.isGroup && !mine && (
                    <strong
                      className="message-sender"
                      style={{ color: sender?.color }}
                    >
                      {sender?.name || "عضو"}
                    </strong>
                  )}
                  <AttachmentView message={message} />
                  {message.text && <p dir="auto">{message.text}</p>}
                  <span className="message-meta">
                    <time dateTime={new Date(message.createdAt).toISOString()}>
                      {timeOf(message.createdAt)}
                    </time>
                    {mine && (message.deliveredAt || read ? <CheckCheck size={16} className={read ? 'read-receipt' : ''} aria-label={read ? 'تمت القراءة' : 'تم الاستلام'} /> : <Check size={16} aria-label="تم الإرسال" />)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <footer className="composer-wrap">
        {emoji && (
          <div className="emoji-picker">
            {[
              "😊",
              "❤️",
              "👍",
              "🌿",
              "😂",
              "✨",
              "🙏",
              "🎉",
              "☕",
              "👋",
              "😍",
              "💚",
              "🤍",
              "👏",
              "🌸",
              "🤔",
            ].map((value) => (
              <button
                key={value}
                type="button"
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
        {upload && (
          <div className="upload-preview">
            {upload.preview ? (
              <img src={upload.preview} alt="معاينة الملف" />
            ) : upload.mime.startsWith("audio/") ? (
              <Mic />
            ) : (
              <FileText />
            )}
            <span>
              <strong>
                {upload.mime.startsWith("audio/")
                  ? "رسالة صوتية جاهزة للإرسال"
                  : upload.name}
              </strong>
              <small>اضغط إرسال لمشاركة الملف</small>
            </span>
            <IconButton
              label="إزالة المرفق"
              onClick={() => {
                setUpload(null);
                pendingId.current = null;
              }}
            >
              <X size={18} />
            </IconButton>
          </div>
        )}
        <form className="composer" onSubmit={send}>
          <input
            ref={fileInput}
            type="file"
            className="visually-hidden"
            onChange={(e) => {
              void attach(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {recording ? (
            <>
              <span className="recording-dot" />
              <span className="recording-time">
                جارٍ التسجيل {Math.floor(recordSeconds / 60)}:
                {String(recordSeconds % 60).padStart(2, "0")}
              </span>
              <IconButton
                label="إلغاء التسجيل"
                onClick={() => {
                  recordingCancelled.current = true;
                  recorder.current?.stop();
                }}
              >
                <X size={21} />
              </IconButton>
              <IconButton
                label="إنهاء التسجيل"
                onClick={() => recorder.current?.stop()}
                className="stop-recording"
              >
                <Square size={20} />
              </IconButton>
            </>
          ) : (
            <>
              <IconButton
                label="إضافة رمز تعبيري"
                disabled={sending}
                onClick={() => setEmoji(!emoji)}
              >
                <Smile size={23} />
              </IconButton>
              <IconButton
                label="إرفاق ملف أو صورة"
                disabled={sending}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip size={22} />
              </IconButton>
              <textarea
                ref={input}
                rows={1}
                maxLength={10_000}
                value={draft}
                disabled={sending}
                dir="auto"
                aria-label="نص الرسالة"
                placeholder="اكتب رسالتك هنا…"
                onChange={(e) => {
                  setDraft(e.target.value);
                  pendingId.current = null;
                  if (Date.now() - lastTyped.current > 2_000) {
                    lastTyped.current = Date.now();
                    void api(`/conversations/${chat.id}/typing`, "POST").catch(
                      () => {},
                    );
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
              {draft.trim() || upload ? (
                <button
                  className="send-button"
                  title="إرسال الرسالة"
                  aria-label="إرسال الرسالة"
                  disabled={sending}
                >
                  {sending ? (
                    <LoaderCircle className="spin" size={22} />
                  ) : (
                    <Send size={21} />
                  )}
                </button>
              ) : (
                <IconButton
                  label="تسجيل رسالة صوتية"
                  className="record-button"
                  onClick={() => void record()}
                >
                  <Mic size={23} />
                </IconButton>
              )}
            </>
          )}
        </form>
        <span className="composer-hint">
          Enter للإرسال · Shift + Enter لسطر جديد
        </span>
      </footer>
      {info && (
        <Modal title="معلومات المحادثة" onClose={() => setInfo(false)}>
          <div className="profile-top">
            <Avatar user={peer} group={chat.isGroup} />
            <strong className="account-name">
              <span className="name-text">{titleOf(chat, user.id)}</span>
              {!chat.isGroup && peer?.verified ? <VerifiedBadge /> : null}
            </strong>
            <span>
              {chat.isGroup ? `${members.length} أعضاء` : peer?.about}
            </span>
          </div>
          <p className="section-label">
            {chat.isGroup ? "أعضاء المجموعة" : "المشاركون"}
          </p>
          {members.map((member) => (
            <div className="member-row" key={member.id}>
              <Avatar user={member} small />
              <span>
                <strong>
                  {member.name}
                  {member.id === user.id ? " (أنت)" : ""}
                </strong>
                <small dir="ltr">@{member.handle}</small>
              </span>
            </div>
          ))}
        </Modal>
      )}
    </section>
  );
}

function Workspace({
  user,
  onUser,
  onLogout,
  featured,
}: {
  user: User;
  onUser: (user: User) => void;
  onLogout: () => void;
  featured?: User;
}) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"),
    [archived, setArchived] = useState(false),
    [modal, setModal] = useState<"new" | "profile" | null>(null);
  const [connected, setConnected] = useState(true),
    [toast, setToast] = useState("");
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<{ conversations: Conversation[] }>("/conversations"),
    refetchInterval: 15_000,
  });
  const chats = conversations.data?.conversations || [];
  const selected = chats.find((c) => c.id === selectedId);
  const totalUnread = chats.reduce((n, c) => n + c.unread, 0);
  const featuredStarted = useRef(false);
  async function startFeatured() {
    if (!featured || featured.id === user.id) return;
    const existing = chats.find(
      (c) => !c.isGroup && c.members.some((m) => m.id === featured.id),
    );
    try {
      const id =
        existing?.id ||
        (
          await api<{ id: string }>("/conversations", "POST", {
            userIds: [featured.id],
          })
        ).id;
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      setSelectedId(id);
      setArchived(false);
      setFilter("all");
      setSearch("");
    } catch (error) {
      setToast(errorText(error));
    }
  }
  useEffect(() => {
    if (
      !featuredStarted.current &&
      conversations.isSuccess &&
      featured &&
      featured.id !== user.id
    ) {
      featuredStarted.current = true;
      void startFeatured();
    }
  }, [conversations.isSuccess, featured?.id, user.id]);

  useEffect(() => {
    const stream = new EventSource(`${API}/events`);
    stream.onopen = () => setConnected(true);
    stream.addEventListener('messages', event => {
      const messages = JSON.parse((event as MessageEvent).data).messages as Message[];
      const ids = messages.filter(message => message.senderId !== user.id).map(message => message.id);
      if (ids.length) void api('/receipts/delivered', 'POST', { messageIds: ids }).then(() => { void qc.invalidateQueries({ queryKey: ['messages'] }); }).catch(() => {});
    });
    stream.onerror = () => setConnected(false);
    stream.addEventListener("refresh", () => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      void qc.invalidateQueries({ queryKey: ["messages"] });
    });
    stream.addEventListener("typing", (event) => {
      window.dispatchEvent(
        new CustomEvent("wisal-typing", {
          detail: JSON.parse((event as MessageEvent).data),
        }),
      );
    });
    const heartbeat = () => {
      void api("/heartbeat", "POST").catch((err) => {
        if (err instanceof ApiError && err.status === 401) onLogout();
      });
    };
    heartbeat();
    const timer = setInterval(heartbeat, 20_000);
    return () => {
      stream.close();
      clearInterval(timer);
    };
  }, [qc, onLogout]);
  useEffect(() => {
    document.title = `${totalUnread ? `(${totalUnread}) ` : ""}وصال | محادثاتك`;
  }, [totalUnread]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6_000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function update(values: object) {
    if (!selected) return;
    try {
      await api(`/conversations/${selected.id}`, "PATCH", values);
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      if ("archived" in values) setSelectedId(null);
    } catch (err) {
      setToast(errorText(err));
    }
  }
  const visibleChats = chats.filter(
    (chat) =>
      chat.archived === archived &&
      (filter !== "unread" || chat.unread > 0) &&
      (filter !== "groups" || chat.isGroup) &&
      titleOf(chat, user.id).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <main className={`chat-shell ${selected ? "chat-is-open" : ""}`} dir="rtl">
      <nav className="rail" aria-label="التنقل الرئيسي">
        <span className="rail-logo">
          <MessageCircle size={25} />
        </span>
        <IconButton
          label="المحادثات"
          className={!archived ? "rail-active" : ""}
          onClick={() => {
            setArchived(false);
            setSelectedId(null);
          }}
        >
          <MessageCircle size={23} />
          {!!totalUnread && (
            <b className="rail-badge">
              {totalUnread > 99 ? "99+" : totalUnread}
            </b>
          )}
        </IconButton>
        <IconButton
          label="المحادثات المؤرشفة"
          className={archived ? "rail-active" : ""}
          onClick={() => {
            setArchived(true);
            setSelectedId(null);
          }}
        >
          <Archive size={22} />
        </IconButton>
        <span className="rail-spacer" />
        <IconButton label="الإعدادات" onClick={() => setModal("profile")}>
          <Settings size={23} />
        </IconButton>
        <button
          className="profile-button"
          aria-label="الملف الشخصي"
          onClick={() => setModal("profile")}
        >
          <Avatar user={user} small />
        </button>
      </nav>
      <aside className="chat-sidebar">
        <header className="sidebar-heading">
          <Brand />
          <div>
            <IconButton
              label="الملف الشخصي والإعدادات"
              className="mobile-settings"
              onClick={() => setModal("profile")}
            >
              <Settings size={22} />
            </IconButton>
            <IconButton label="محادثة جديدة" onClick={() => setModal("new")}>
              <MessageSquarePlus size={23} />
            </IconButton>
          </div>
        </header>
        {featured && featured.id !== user.id && (
          <button
            className="featured-contact"
            onClick={() => void startFeatured()}
          >
            <Avatar user={featured} small />
            <span>
              <strong className="account-name">
                <span dir="ltr">{featured.handle}</span>
                <VerifiedBadge />
              </strong>
              <small>{featured.name}</small>
            </span>
            <ChevronLeft size={17} />
          </button>
        )}
        <div className="sidebar-title">
          <h1>{archived ? "المؤرشفة" : "المحادثات"}</h1>
          <span>{visibleChats.length} محادثة</span>
        </div>
        <div className="sidebar-search search-field">
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث عن محادثة"
            aria-label="البحث في المحادثات"
          />
          {search && (
            <IconButton label="مسح البحث" onClick={() => setSearch("")}>
              <X size={16} />
            </IconButton>
          )}
        </div>
        <div className="chat-filters" aria-label="تصفية المحادثات">
          {[
            ["all", "الكل"],
            ["unread", "غير المقروءة"],
            ["groups", "المجموعات"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
              {value === "unread" && totalUnread > 0 && (
                <small>{totalUnread}</small>
              )}
            </button>
          ))}
        </div>
        <button
          className="archive-row"
          onClick={() => {
            setArchived(!archived);
            setSelectedId(null);
          }}
        >
          <Archive size={18} />
          <span>{archived ? "العودة إلى المحادثات" : "المؤرشفة"}</span>
          <small>{chats.filter((c) => c.archived).length || ""}</small>
          <ChevronLeft size={15} />
        </button>
        <div className="chat-list">
          {conversations.isPending ? (
            <div className="inline-empty">
              <LoaderCircle className="spin" />
              <p>نحمّل محادثاتك…</p>
            </div>
          ) : conversations.error ? (
            <div className="inline-empty">
              <WifiOff />
              <p>{errorText(conversations.error)}</p>
              <button
                className="text-button"
                onClick={() => void conversations.refetch()}
              >
                إعادة المحاولة
              </button>
            </div>
          ) : !visibleChats.length ? (
            <div className="sidebar-empty">
              <span>
                <MessageCircle size={30} />
              </span>
              <h3>
                {search
                  ? "لا توجد نتائج"
                  : filter === "unread"
                    ? "كل محادثاتك مقروءة"
                    : archived
                      ? "لا توجد محادثات مؤرشفة"
                      : "أول محادثة تبدأ منك"}
              </h3>
              <p>
                {search ? "جرّب اسمًا آخر." : "ابحث عن صديق وقل له مرحباً."}
              </p>
              {!search && !archived && (
                <button className="text-button" onClick={() => setModal("new")}>
                  بدء محادثة <Plus size={15} />
                </button>
              )}
            </div>
          ) : (
            visibleChats.map((chat) => {
              const peer = chat.members.find((u) => u.id !== user.id),
                last = chat.lastMessage;
              return (
                <button
                  key={chat.id}
                  className={`chat-row ${selectedId === chat.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(chat.id)}
                >
                  <span className="avatar-wrap">
                    <Avatar user={peer} group={chat.isGroup} />
                    {!chat.isGroup &&
                      peer &&
                      Date.now() - peer.lastSeen < 45_000 && (
                        <i className="avatar-online" />
                      )}
                  </span>
                  <span className="chat-row-content">
                    <span className="chat-row-title">
                      <strong className="account-name">
                        <span className="name-text">
                          {titleOf(chat, user.id)}
                        </span>
                        {!chat.isGroup && peer?.verified ? (
                          <VerifiedBadge />
                        ) : null}
                      </strong>
                      <time className={chat.unread ? "unread-time" : ""}>
                        {last
                          ? new Date(last.createdAt).toDateString() ===
                            new Date().toDateString()
                            ? timeOf(last.createdAt)
                            : dayOf(last.createdAt)
                          : ""}
                      </time>
                    </span>
                    <span className="chat-row-preview">
                      <span>
                        {last?.senderId === user.id && (last.deliveredAt || last.readAt ? <CheckCheck size={15} className={last.readAt ? "read-receipt" : ""} /> : <Check size={15} />)}
                        {last
                          ? last.text ||
                            (last.attachment?.mime.startsWith("audio/")
                              ? "🎙 رسالة صوتية"
                              : last.attachment?.mime.startsWith("image/")
                                ? "📷 صورة"
                                : "📎 ملف")
                          : "ابدأ المحادثة"}
                      </span>
                      <span className="chat-row-indicators">
                        {chat.pinned && <Pin size={13} />}
                        {chat.unread > 0 && (
                          <b className="unread-badge">
                            {chat.unread > 99 ? "99+" : chat.unread}
                          </b>
                        )}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
        <footer className="sidebar-footer">
          <span className={`connection-dot ${connected ? "" : "offline"}`} />
          {connected ? "متصل · كل حديث له مكان" : "جارٍ إعادة الاتصال…"}
        </footer>
      </aside>
      {selected ? (
        <ConversationPane
          key={selected.id}
          chat={selected}
          user={user}
          onBack={() => setSelectedId(null)}
          onUpdate={(values) => void update(values)}
          onError={setToast}
        />
      ) : (
        <section className="welcome-pane">
          <div className="welcome-illustration">
            <span className="welcome-ring" />
            <span className="welcome-main-icon">
              <MessageCircle size={65} strokeWidth={1.4} />
            </span>
            <span className="mini-bubble one">مرحباً 👋</span>
            <span className="mini-bubble two">أهلاً بك 🌿</span>
            <span className="welcome-spark">✳</span>
          </div>
          <span className="eyebrow">أنت هنا. والباقي حديث.</span>
          <h2>قريب، مهما كانت المسافة.</h2>
          <p>
            اختر محادثة من القائمة، أو ابدأ حديثًا جديدًا.
            <br />
            لأن أجمل اللحظات تبدأ برسالة.
          </p>
          <button className="primary-button" onClick={() => setModal("new")}>
            <MessageSquarePlus size={19} />
            بدء محادثة جديدة
          </button>
          <div className="your-handle">
            <AtSign size={15} />
            <span>اسمك على وصال</span>
            <strong dir="ltr">@{user.handle}</strong>
          </div>
          <div className="welcome-footer">
            <CheckCircle2 size={16} />
            رسائلك محفوظة في حسابك
          </div>
        </section>
      )}
      {modal === "new" && (
        <NewConversation
          onClose={() => setModal(null)}
          onCreated={(id) => {
            void qc.invalidateQueries({ queryKey: ["conversations"] });
            setSelectedId(id);
            setArchived(false);
            setFilter("all");
            setSearch("");
            setModal(null);
          }}
        />
      )}
      {modal === "profile" && (
        <Profile
          user={user}
          onClose={() => setModal(null)}
          onSave={onUser}
          onLogout={onLogout}
        />
      )}
      {toast && (
        <div className="toast" role="alert">
          <span>{toast}</span>
          <IconButton label="إغلاق التنبيه" onClick={() => setToast("")}>
            <X size={18} />
          </IconButton>
        </div>
      )}
    </main>
  );
}

function Session() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: User }>("/me"),
    retry: false,
  });
  const profileQuery = useQuery({
    queryKey: ["featured-profile"],
    queryFn: () => api<{ profile: User }>("/profile"),
  });
  const [authOpen, setAuthOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const setUser = (user: User) => {
    setAuthOpen(false);
    qc.setQueryData(["me"], { user });
  };
  const logout = async () => {
    try {
      const config = await api<{ authMode?: string }>('/profile');
      if (config.authMode === 'chatgpt') { window.location.assign('/signout-with-chatgpt?return_to=%2F'); return; }
      await api("/logout", "POST");
      qc.clear();
      setAuthOpen(false);
      qc.setQueryData(["me"], null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        qc.clear();
        setAuthOpen(false);
        qc.setQueryData(["me"], null);
      } else setLogoutError(errorText(err));
    }
  };
  if (me.isPending)
    return (
      <div className="boot-screen">
        <Brand />
        <LoaderCircle className="spin" size={25} />
        <p>لحظة ونكون معك…</p>
      </div>
    );
  if (me.error && !(me.error instanceof ApiError && me.error.status === 401))
    return (
      <div className="boot-screen">
        <Brand />
        <WifiOff size={38} />
        <h2>تعذّر الاتصال بوصال</h2>
        <p>تأكد من تشغيل الخادم واتصالك بالإنترنت.</p>
        <button className="primary-button" onClick={() => void me.refetch()}>
          إعادة المحاولة
        </button>
      </div>
    );
  if (!me.data?.user) {
    if (authOpen)
      return (
        <Auth
          onSuccess={setUser}
          profile={profileQuery.data?.profile}
          onBack={() => setAuthOpen(false)}
        />
      );
    if (profileQuery.data?.profile)
      return (
        <ProfileLanding
          profile={profileQuery.data.profile}
          onStart={() => setAuthOpen(true)}
        />
      );
    return (
      <div className="boot-screen">
        <Brand />
        <p>
          {profileQuery.error ? "تعذّر تحميل الحساب." : "جارٍ تحميل الحساب…"}
        </p>
        <button
          className="primary-button"
          onClick={() => void profileQuery.refetch()}
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }
  return (
    <>
      <Workspace
        user={me.data.user}
        featured={profileQuery.data?.profile}
        onUser={setUser}
        onLogout={() => void logout()}
      />
      {logoutError && (
        <div className="toast" role="alert">
          {logoutError}
          <IconButton label="إغلاق التنبيه" onClick={() => setLogoutError("")}>
            <X size={18} />
          </IconButton>
        </div>
      )}
    </>
  );
}
export default function ChatApp() {
  return (
    <QueryClientProvider client={client}>
      <Session />
    </QueryClientProvider>
  );
}
