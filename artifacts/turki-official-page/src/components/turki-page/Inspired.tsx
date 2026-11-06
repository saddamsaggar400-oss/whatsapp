import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useAuth } from "@clerk/react";
import {
  Home, Search, Compass, MessageCircle, Heart as HeartSolid, PlusSquare, Menu,
  MoreHorizontal, Grid, MonitorPlay, UserSquare, ChevronUp, Edit,
  Send, Share2, Download, X, ImagePlus, Heart, Trash2
} from "lucide-react";
import "./turki-page.css";

const portrait = "/images/latifa/profile-detailed.png";
const cover = "/images/turki_al_alshikh_cover.jpeg";

type TabKey = "all" | "spotlight" | "related" | "stories";

type Post = {
  id: string;
  time: string;
  copy: string;
  image?: string;
  likes: number;
  comments: number;
  shares: number;
  liked: boolean;
  pinned?: boolean;
};

type ChatMessage = {
  id: string;
  visitorId: string;
  sender: string;
  body: string;
  createdAt: string;
  read: boolean;
};

type Appearance = {
  primaryColor: string;
  profileImageSize: number;
  highlightSize: number;
  contentWidth: number;
  buttonRadius: number;
};

type Story = {
  slot: number;
  imagePath: string;
};

type DisplayComment = {
  id: string;
  body: string;
  authorName: string;
};

const defaultAppearance: Appearance = {
  primaryColor: "#4051F5",
  profileImageSize: 150,
  highlightSize: 58,
  contentWidth: 935,
  buttonRadius: 8,
};

const initialPosts: Post[] = [
  {
    id: "pinned",
    time: "منذ ساعة",
    copy: "سعدت بهذا اللقاء للحديث عن توسيع آفاق البرامج التي تصنع أثراً حقيقياً في حياة الناس. نواصل العمل مع شركائنا لدعم المبادرات الرياضية والثقافية والمجتمعية في المملكة.",
    image: cover,
    likes: 84200,
    comments: 3820,
    shares: 2450,
    liked: true,
    pinned: true,
  },
  {
    id: "community",
    time: "منذ 3 ساعات",
    copy: "تمكين المواهب السعودية ودعم الأفكار الطموحة مسؤولية نؤمن بها. كل مشروع جديد يفتح مساحة أكبر للإبداع، وكل قصة نجاح تضيف فصلاً جميلاً إلى مسيرة وطننا.",
    image: portrait,
    likes: 61700,
    comments: 2140,
    shares: 1740,
    liked: false,
  },
  {
    id: "weekend",
    time: "أمس",
    copy: "نحتفي بكل من يضيف قيمة إلى المشهد الرياضي والترفيهي والثقافي. شكراً لكل فريق يعمل بإخلاص خلف الكواليس، فالتفاصيل الصغيرة هي التي تصنع التجربة الكبيرة.",
    likes: 44900,
    comments: 1260,
    shares: 980,
    liked: false,
  },
];

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "المنشورات", icon: <Grid size={12} /> },
  { key: "spotlight", label: "REELS", icon: <MonitorPlay size={12} /> },
  { key: "related", label: "الإشارات", icon: <UserSquare size={12} /> },
];

function formatArabicNumber(value: number) {
  if (value >= 1000000) {
    return (value / 1000000).toFixed(1).replace(/\.0$/, "") + " مليون";
  }
  return value.toLocaleString("ar-SA");
}

function VerifiedBadge() {
  return (
    <svg aria-label="مُحقق" color="rgb(0, 149, 246)" fill="rgb(0, 149, 246)" height="18" role="img" viewBox="0 0 40 40" width="18">
      <title>مُحقق</title>
      <path d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Zm7.415 11.225 2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z" fillRule="evenodd"></path>
    </svg>
  );
}

function TabMessage({ tab }: { tab: string }) {
  const content: Record<string, { title: string, text: string }> = {
    stories: {
      title: "القصص والمقتطفات",
      text: "تصفح الصور الرسمية واللحظات المختارة من أرشيف الصفحة."
    },
    spotlight: {
      title: "مقاطع ريلز",
      text: "هنا ستجد المقاطع والتغطيات المرئية المنشورة من الحساب الرسمي."
    },
    related: {
      title: "الإشارات",
      text: "صور ومقاطع فيديو تمت الإشارة إلى الحساب فيها."
    }
  };
  const selected = content[tab] || content.related;
  
  return (
    <div className="tp-empty" style={{ gridColumn: '1 / -1' }}>
      <MessageCircle size={32} color="#A8A8A8" style={{ margin: '0 auto 16px' }} />
      <h2 style={{ color: '#F5F5F5', marginBottom: 8, marginTop: 0 }}>{selected.title}</h2>
      <p style={{ margin: 0, color: '#A8A8A8' }}>{selected.text}</p>
    </div>
  );
}

function PostDetailDialog({
  post,
  onClose,
  onLike,
  onComment,
  onShare,
}: {
  post: Post;
  onClose: () => void;
  onLike: (id: string) => void;
  onComment: (id: string, text: string) => void;
  onShare: (id: string) => void;
}) {
  const [comment, setComment] = useState("");
  const [displayComments, setDisplayComments] = useState<DisplayComment[]>([]);

  useEffect(() => {
    fetch(`/api/posts/${encodeURIComponent(post.id)}/comments`)
      .then((response) => response.ok ? response.json() : [])
      .then((items: DisplayComment[]) => setDisplayComments(items))
      .catch(() => setDisplayComments([]));
  }, [post.id]);

  return (
    <div className="tp-dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tp-dialog-content">
        <button className="tp-dialog-close" onClick={onClose} aria-label="إغلاق"><X size={24} /></button>

        <div className="tp-dialog-media-container">
          {post.image ? (
            <img src={post.image} className="tp-dialog-media" alt="محتوى المنشور" />
          ) : (
            <div className="tp-dialog-media-placeholder" />
          )}
        </div>

        <div className="tp-dialog-body">
          <div className="tp-author-row">
            <img src={portrait} className="tp-author-avatar" alt="لطيفة بنت محمد بن راشد آل مكتوم" />
            <div>
              <div className="tp-author-name">
                hhshklatifa
                <VerifiedBadge />
              </div>
            </div>
          </div>

          <div className="tp-dialog-scrollable">
            <p className="tp-dialog-copy">{post.copy}</p>
            <div className="tp-featured-comments">
              {displayComments.map((item) => (
                <div className="tp-featured-comment" key={item.id}>
                  <strong>{item.authorName}<VerifiedBadge /></strong>
                  <span>{item.body}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="tp-dialog-stats-actions">
            <div className="tp-dialog-actions">
              <button className={`tp-action-btn ${post.liked ? 'active' : ''}`} onClick={() => onLike(post.id)}>
                {post.liked ? <HeartSolid size={24} fill="#ed4956" /> : <Heart size={24} />}
              </button>
              <button className="tp-action-btn" onClick={() => document.getElementById(`comment-input-${post.id}`)?.focus()}>
                <MessageCircle size={24} />
              </button>
              <button className="tp-action-btn" onClick={() => onShare(post.id)}>
                <Send size={24} />
              </button>
              {post.image && (
                <a
                  className="tp-action-btn"
                  style={{ marginRight: 'auto' }}
                  href={post.image}
                  download={`turki-${post.id}.jpg`}
                  aria-label="تنزيل صورة المنشور"
                >
                  <Download size={24} />
                </a>
              )}
            </div>
            
            <div className="tp-dialog-stats">
              <strong>{formatArabicNumber(post.likes)} إعجاب</strong>
            </div>
            <div className="tp-author-time">{post.time}</div>
          </div>

          <form className="tp-comment-form" onSubmit={(e) => {
            e.preventDefault();
            if (comment.trim()) { onComment(post.id, comment); setComment(""); }
          }}>
            <input id={`comment-input-${post.id}`} value={comment} onChange={e => setComment(e.target.value)} placeholder="إضافة تعليق..." />
            <button type="submit" disabled={!comment.trim()} aria-label="إرسال التعليق">نشر</button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ComposerDialog({
  onClose,
  onPost,
  isSignedIn,
  onRequireSignIn,
}: {
  onClose: () => void;
  onPost: (text: string, imagePath: string | null) => Promise<boolean>;
  isSignedIn: boolean;
  onRequireSignIn: () => void;
}) {
  const [text, setText] = useState("");
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);

  async function cleanupImagePath(objectPath: string) {
    try {
      await fetch("/api/media/cleanup", {
        method: "POST",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath }),
      });
    } catch {
      // The periodic orphan cleanup is the fallback when this request fails.
    }
  }

  async function clearUploadedImage() {
    if (!imagePath) {
      return;
    }

    await cleanupImagePath(imagePath);
    setImagePath(null);
  }

  async function cleanupUploadedImage() {
    await clearUploadedImage();
    onClose();
  }

  useEffect(() => {
    if (!imagePath) return;
    const handlePageHide = () => {
      const payload = new Blob([JSON.stringify({ objectPath: imagePath })], { type: "application/json" });
      navigator.sendBeacon("/api/media/cleanup", payload);
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [imagePath]);

  async function uploadImage(file: File) {
    if (!isSignedIn) {
      onRequireSignIn();
      return;
    }
    await clearUploadedImage();
    setUploading(true);
    setUploadError("");
    let requestedObjectPath: string | null = null;
    try {
      const urlResponse = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlResponse.ok) throw new Error("upload-url");
      const upload = (await urlResponse.json()) as { uploadURL: string; objectPath: string };
      if (!upload.uploadURL || !upload.objectPath) throw new Error("upload-url");
      requestedObjectPath = upload.objectPath;
      const putResponse = await fetch(upload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putResponse.ok) throw new Error("upload");
      setImagePath(upload.objectPath);
    } catch {
      if (requestedObjectPath) {
        await cleanupImagePath(requestedObjectPath);
      }
      setImagePath(null);
      setUploadError("تعذر رفع الصورة وحفظها. تحقق من نوع الملف وحاول مرة أخرى.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="tp-dialog-overlay" onClick={(e) => e.target === e.currentTarget && !uploading && void cleanupUploadedImage()}>
      <div className="tp-dialog-content" style={{ padding: 24, maxWidth: 500, flexDirection: 'column' }}>
        <button className="tp-dialog-close" disabled={uploading} onClick={() => void cleanupUploadedImage()} aria-label="إغلاق"><X size={24} /></button>
        <h2 style={{ marginTop: 0, marginBottom: 16, textAlign: 'center' }}>إنشاء منشور جديد</h2>
        <textarea
           value={text}
           onChange={e => setText(e.target.value)}
           placeholder="ماذا تود أن تشارك؟"
           className="tp-composer-textarea"
        />
        <label className="tp-image-picker">
          <ImagePlus size={20} />
          <span>{uploading ? "جارٍ رفع الصورة..." : imagePath ? "تم رفع الصورة" : "اختر صورة"}</span>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void uploadImage(file);
            }}
          />
        </label>
        {uploadError && (
          <p role="alert" style={{ color: "#ed4956", margin: "10px 0 0", fontSize: 13 }}>{uploadError}</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <button
            className="tp-primary-btn"
            disabled={uploading || !text.trim()}
            onClick={async () => {
              if (!text.trim() || uploading) return;
              const posted = await onPost(text.trim(), imagePath);
              if (posted) {
                setImagePath(null);
                onClose();
              }
            }}
          >
            {uploading ? "جارٍ الحفظ..." : "مشاركة"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatDialog({ visitorId, onClose }: { visitorId: string; onClose: () => void; }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/conversations/${encodeURIComponent(visitorId)}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json() as { messages: ChatMessage[] };
        if (active) setMessages(current => {
          const merged = new Map(current.map(message => [message.id, message]));
          data.messages.forEach(message => merged.set(message.id, message));
          return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
      } catch {
        if (active) setError("تعذر تحديث المحادثة. سنحاول الاتصال مجدداً تلقائياً.");
      } finally {
        if (active) {
          setLoading(false);
          timer = setTimeout(load, 4000);
        }
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [visitorId]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(visitorId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!response.ok) throw new Error();
      const message = (await response.json()) as ChatMessage;
      setMessages((current) => current.some(item => item.id === message.id) ? current : [...current, message]);
      setBody("");
    } catch {
      setError("لم تُرسل الرسالة. النص محفوظ هنا؛ حاول الإرسال مرة أخرى.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="tp-dialog-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="tp-chat-dialog" role="dialog" aria-modal="true" aria-label="مراسلة الصفحة">
        <div className="tp-chat-heading">
          <button className="tp-action-btn" onClick={onClose} aria-label="إغلاق" style={{ position: 'absolute', right: 16 }}><X size={24} /></button>
          <div className="tp-chat-avatar"><MessageCircle size={20} /></div>
          <div>
            <strong>دردشة الصفحة الرسمية</strong>
            <span>تظهر الردود هنا تلقائياً</span>
          </div>
        </div>
        <div className="tp-chat-messages">
          {loading ? (
            <p className="tp-chat-empty">جارٍ تحميل المحادثة...</p>
          ) : messages.length === 0 ? (
            <p className="tp-chat-empty">مرحباً بك. اكتب رسالتك هنا.</p>
          ) : (
            messages.map((message) => (
              <div className={`tp-chat-bubble ${message.sender === "visitor" ? "visitor" : "official"}`} key={message.id}>
                {message.body}
              </div>
            ))
          )}
        </div>
        {error && <p role="alert" style={{ color: "#ed4956", padding: "0 14px", fontSize: 13, margin: 0 }}>{error}</p>}
        <form className="tp-chat-form" onSubmit={sendMessage}>
          <input value={body} disabled={sending} aria-label="نص الرسالة" onChange={(event) => setBody(event.target.value)} placeholder="اكتب رسالة..." />
          <button type="submit" disabled={sending || !body.trim()} aria-label="إرسال الرسالة"><Send size={18} /></button>
        </form>
      </div>
    </div>
  );
}

export default function Inspired() {
  const { isSignedIn } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [isFollowing, setIsFollowing] = useState(false);
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [toast, setToast] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [visitorId, setVisitorId] = useState("");
  const [appearance, setAppearance] = useState(defaultAppearance);
  const [stories, setStories] = useState<Story[]>([]);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [storyUploadSlot, setStoryUploadSlot] = useState<number | null>(null);
  const [storyUploading, setStoryUploading] = useState(false);
  const storyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    const url = new URL(window.location.href);
    const shouldOpenComposer = url.searchParams.get("compose") === "1" || window.sessionStorage.getItem("turki-open-composer") === "1";
    if (!shouldOpenComposer) return;
    window.sessionStorage.removeItem("turki-open-composer");
    url.searchParams.delete("compose");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    setComposerOpen(true);
  }, [isSignedIn]);

  useEffect(() => {
    const savedVisitorId = window.localStorage.getItem("turki-visitor-id");
    const nextVisitorId = savedVisitorId ?? crypto.randomUUID();
    if (!savedVisitorId) window.localStorage.setItem("turki-visitor-id", nextVisitorId);
    setVisitorId(nextVisitorId);

    fetch("/api/posts")
      .then((response) => response.json())
      .then((data: Array<Post & { imagePath?: string | null }>) => {
        setPosts(data.map((post) => ({ ...post, image: post.imagePath ?? undefined })));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/appearance")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: Appearance) => setAppearance(data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/stories")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: Story[]) => setStories(data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!visitorId) return;
    const sendPresence = () => {
      void fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId }),
      }).catch(() => undefined);
    };
    sendPresence();
    const interval = window.setInterval(sendPresence, 15_000);
    const handleVisibilityChange = () => { if (document.visibilityState === "visible") sendPresence(); };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", handleVisibilityChange); };
  }, [visitorId]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  }

  function toggleLike(postId: string) {
    setPosts((current) => current.map((post) => post.id === postId ? { ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) } : post));
  }

  async function addComment(postId: string, text: string) {
    const response = await fetch(`/api/posts/${encodeURIComponent(postId)}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    if (!response.ok) return;
    setPosts((current) => current.map((post) => (post.id === postId ? { ...post, comments: post.comments + 1 } : post)));
    notify(`تمت إضافة تعليقك`);
  }

  function sharePost(postId: string) {
    setShareOpen(true);
    setPosts((current) => current.map((post) => (post.id === postId ? { ...post, shares: post.shares + 1 } : post)));
  }

  function openComposerOrSignIn() {
    if (isSignedIn) { setComposerOpen(true); return; }
    window.sessionStorage.setItem("turki-open-composer", "1");
    window.location.assign(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/sign-in`);
  }

  function selectStorySlot(slot: number) {
    const story = stories.find((item) => item.slot === slot);
    if (story) {
      setActiveStory(story);
      return;
    }
    if (!isSignedIn) {
      notify("سجّل الدخول كمشرف لإضافة قصة");
      return;
    }
    setStoryUploadSlot(slot);
    window.setTimeout(() => storyInputRef.current?.click(), 0);
  }

  async function uploadStory(file: File) {
    if (!storyUploadSlot || storyUploading) return;
    setStoryUploading(true);
    let objectPath: string | null = null;
    try {
      const urlResponse = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlResponse.ok) throw new Error("request-url");
      const upload = await urlResponse.json() as { uploadURL: string; objectPath: string };
      objectPath = upload.objectPath;
      const putResponse = await fetch(upload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putResponse.ok) throw new Error("upload");

      const saveResponse = await fetch(`/api/admin/stories/${storyUploadSlot}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath }),
      });
      if (!saveResponse.ok) throw new Error("save");
      const saved = await saveResponse.json() as Story;
      setStories((current) => [...current.filter((story) => story.slot !== saved.slot), saved]);
      setActiveStory(saved);
      notify("تمت إضافة القصة");
    } catch {
      if (objectPath) {
        void fetch("/api/storage/media/cleanup", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ objectPath }),
        });
      }
      notify("تعذر رفع القصة");
    } finally {
      setStoryUploading(false);
      setStoryUploadSlot(null);
      if (storyInputRef.current) storyInputRef.current.value = "";
    }
  }

  async function deleteStory() {
    if (!activeStory || !isSignedIn) return;
    try {
      const response = await fetch(`/api/admin/stories/${activeStory.slot}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("delete");
      setStories((current) => current.filter((story) => story.slot !== activeStory.slot));
      setActiveStory(null);
      notify("تم حذف القصة");
    } catch {
      notify("تعذر حذف القصة، حاول مرة أخرى");
    }
  }

  async function copyShareLink() {
    const link = window.location.href;
    try { await navigator.clipboard?.writeText(link); } catch { /* Ignore */ }
    setShareOpen(false);
    notify("تم نسخ الرابط الحافظة");
  }

  async function addPost(text: string, imagePath: string | null): Promise<boolean> {
    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copy: text, imagePath }),
      });
      if (response.status === 401) { notify("يجب تسجيل الدخول لنشر منشور"); return false; }
      if (!response.ok) { notify("تعذر حفظ المنشور، حاول مرة أخرى"); return false; }
      const post = (await response.json()) as Post & { imagePath?: string | null };
      setPosts((current) => [{ ...post, image: post.imagePath ?? undefined }, ...current]);
      notify("تم النشر بنجاح");
      return true;
    } catch {
      notify("تعذر الاتصال بالخادم");
      return false;
    }
  }

  const filteredPosts = posts.filter((post) => post.copy.includes(search.trim()) || !search.trim());
  const selectedPost = posts.find((p) => p.id === selectedPostId) || null;

  const appearanceStyle = {
    "--ig-primary": appearance.primaryColor,
    "--ig-primary-hover": appearance.primaryColor,
    "--ig-profile-size": `${appearance.profileImageSize}px`,
    "--ig-highlight-size": `${appearance.highlightSize}px`,
    "--ig-content-width": `${appearance.contentWidth}px`,
    "--ig-button-radius": `${appearance.buttonRadius}px`,
  } as CSSProperties;

  return (
    <div className="turki-page" dir="rtl" style={appearanceStyle}>
      {/* Sidebar Desktop */}
      <nav className="ig-sidebar">
        <button className="ig-sidebar-item" onClick={() => setActiveTab("all")} title="الرئيسية"><Home size={24} /></button>
        <button className="ig-sidebar-item" onClick={() => document.querySelector<HTMLInputElement>('.ig-search-input')?.focus()} title="بحث"><Search size={24} /></button>
        <button className="ig-sidebar-item" onClick={() => setActiveTab("spotlight")} title="استكشاف"><Compass size={24} /></button>
        <button className="ig-sidebar-item" onClick={() => setChatOpen(true)} title="الرسائل"><MessageCircle size={24} /></button>
        <button className="ig-sidebar-item" onClick={() => notify("لا توجد إشعارات جديدة")} title="الإشعارات"><Heart size={24} /></button>
        <button className="ig-sidebar-item" onClick={openComposerOrSignIn} title="إنشاء"><PlusSquare size={24} /></button>
        <button className="ig-sidebar-item" title="الملف الشخصي"><img src={portrait} className="avatar" alt="Profile" /></button>
        <div className="ig-sidebar-item spacer" />
        <button className="ig-sidebar-item" onClick={() => notify("المزيد من الخيارات")} title="المزيد"><Menu size={24} /></button>
      </nav>

      {/* Bottom Nav Mobile */}
      <nav className="ig-bottom-nav">
        <button className="ig-sidebar-item" onClick={() => setActiveTab("all")}><Home size={24} /></button>
        <button className="ig-sidebar-item" onClick={() => document.querySelector<HTMLInputElement>('.ig-search-input')?.focus()}><Search size={24} /></button>
        <button className="ig-sidebar-item" onClick={openComposerOrSignIn}><PlusSquare size={24} /></button>
        <button className="ig-sidebar-item" onClick={() => setActiveTab("spotlight")}><MonitorPlay size={24} /></button>
        <button className="ig-sidebar-item"><img src={portrait} className="avatar" alt="Profile" /></button>
      </nav>

      <main className="ig-main">
        <div className="ig-profile-container">
          <header className="ig-profile-header">
            <div className="ig-profile-avatar">
              <div className="ig-story-ring" onClick={() => setActiveTab("stories")}>
                <img src={portrait} alt="لطيفة بنت محمد بن راشد آل مكتوم" />
              </div>
            </div>
            
            <section className="ig-profile-info">
              <div className="ig-username-row">
                <h1 className="ig-username">hhshklatifa</h1>
                <VerifiedBadge />
                <button className="ig-more-btn" onClick={() => setShareOpen(true)}><MoreHorizontal size={24} /></button>
              </div>
              
              <div className="ig-stats-row">
                <span><strong>{formatArabicNumber(1724)}</strong> من المنشورات</span>
                <span><strong>{formatArabicNumber(1700000)}</strong> متابع</span>
                <span><strong>{formatArabicNumber(509)}</strong> أتابع</span>
              </div>

              <div className="ig-english-name">Latifa M R Al Maktoum</div>
              
              <div className="ig-bio">
                <h2 className="ig-real-name">لطيفة بنت محمد بن راشد آل مكتوم</h2>
                <div className="ig-bio-text">
                  Chairperson @DubaiCulture<br/>
                  Member @dubaicouncil &amp; @tecofdubai<br/>
                  VC @elfdubai<br/>
                  Creative... المزيد
                </div>
              </div>
              
              <div className="ig-action-buttons">
                <button className="ig-btn ig-btn-primary" onClick={() => {
                  setIsFollowing(!isFollowing);
                  notify(!isFollowing ? "تمت متابعة الصفحة" : "تم إلغاء المتابعة");
                }}>
                  {isFollowing ? "إلغاء المتابعة" : "متابعة"}
                </button>
                <button className="ig-btn ig-btn-secondary" onClick={() => setChatOpen(true)}>مراسلة</button>
              </div>
            </section>
          </header>

          <div className="ig-highlights">
            {Array.from({ length: 7 }, (_, index) => {
              const slot = index + 1;
              const story = stories.find((item) => item.slot === slot);
              return (
                <button key={slot} type="button" className="ig-highlight-item" onClick={() => selectStorySlot(slot)}>
                  <div className={`ig-highlight-ring ${story ? "" : "is-empty"}`}>
                    {story ? <img src={story.imagePath} alt={`القصة ${slot}`} /> : <ImagePlus size={22} />}
                  </div>
                  <span className="ig-highlight-name">{story ? `القصة ${slot}` : "إضافة قصة"}</span>
                </button>
              );
            })}
          </div>
          <input
            ref={storyInputRef}
            className="ig-story-file-input"
            type="file"
            accept="image/*"
            disabled={storyUploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadStory(file);
            }}
          />

          <div className="ig-search-container">
            <Search size={16} color="#A8A8A8" />
            <input 
              className="ig-search-input"
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder="بحث في المنشورات..." 
            />
          </div>

          <div className="ig-tabs">
            {TABS.map((tab) => (
              <button 
                key={tab.key}
                className={`ig-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "stories" ? (
            <TabMessage tab={activeTab} />
          ) : activeTab === "spotlight" || activeTab === "all" ? (
            <div className="ig-grid">
               {filteredPosts.length > 0 ? filteredPosts.map(post => (
                 <button key={post.id} className="ig-grid-item" onClick={() => setSelectedPostId(post.id)}>
                   {post.image ? <img src={post.image} alt="" /> : <div className="ig-grid-item-placeholder" />}
                   <div className="ig-grid-overlay">
                     <div className="ig-overlay-stat">
                       <HeartSolid size={18} fill="#fff" /> {formatArabicNumber(post.likes)}
                     </div>
                     <div className="ig-overlay-stat">
                       <MessageCircle size={18} fill="#fff" /> {formatArabicNumber(post.comments)}
                     </div>
                   </div>
                 </button>
               )) : (
                 <div className="tp-empty" style={{ gridColumn: '1 / -1' }}>لا توجد منشورات مطابقة للبحث</div>
               )}
            </div>
          ) : (
            <TabMessage tab={activeTab} />
          )}
        </div>
      </main>

      <button className="ig-floating-messages" onClick={() => setChatOpen(true)}>
        الرسائل
        <ChevronUp size={16} />
        <Edit size={16} />
      </button>

      {shareOpen && (
        <div className="tp-dialog-overlay" onClick={() => setShareOpen(false)}>
          <div className="tp-dialog-content" onClick={e => e.stopPropagation()} style={{ padding: 24, maxWidth: 400, margin: 'auto', display: 'flex', flexDirection: 'column' }}>
            <button className="tp-dialog-close" onClick={() => setShareOpen(false)} aria-label="إغلاق"><X size={24} /></button>
            <h3 style={{ marginTop: 0, textAlign: 'center' }}>مشاركة</h3>
            <div style={{ background: '#262626', padding: 12, borderRadius: 8, marginTop: 16, direction: 'ltr', textAlign: 'left', wordBreak: 'break-all' }}>
              hhshklatifa
            </div>
            <button className="tp-primary-btn" style={{ marginTop: 16 }} onClick={copyShareLink}>نسخ الرابط</button>
          </div>
        </div>
      )}

      {toast && <div className="tp-toast">{toast}</div>}
      
      {selectedPost && (
        <PostDetailDialog
          post={selectedPost}
          onClose={() => setSelectedPostId(null)}
          onLike={toggleLike}
          onComment={addComment}
          onShare={sharePost}
        />
      )}

      {composerOpen && (
        <ComposerDialog
          onClose={() => setComposerOpen(false)}
          onPost={addPost}
          isSignedIn={Boolean(isSignedIn)}
          onRequireSignIn={openComposerOrSignIn}
        />
      )}

      {chatOpen && (
        <ChatDialog
          visitorId={visitorId}
          onClose={() => setChatOpen(false)}
        />
      )}

      {activeStory && (
        <div className="ig-story-viewer" onClick={() => setActiveStory(null)}>
          <div className="ig-story-progress"><span /></div>
          <button className="ig-story-close" type="button" onClick={() => setActiveStory(null)} aria-label="إغلاق"><X size={28} /></button>
          {isSignedIn && (
            <button className="ig-story-delete" type="button" onClick={(event) => { event.stopPropagation(); void deleteStory(); }} aria-label="حذف القصة">
              <Trash2 size={23} />
            </button>
          )}
          <div className="ig-story-viewer-author">
            <img src={portrait} alt="" />
            <strong>hhshklatifa</strong>
          </div>
          <img className="ig-story-viewer-image" src={activeStory.imagePath} alt="ستوري" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
}