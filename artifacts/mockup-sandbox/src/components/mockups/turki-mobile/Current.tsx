import { useState, type FormEvent } from "react";
import {
  Grip, PlaySquare, MonitorPlay, MessageCircle, Sparkles, Search,
  Star, Forward, UserPlus, UserCheck, Link2, MapPin, ChevronDown,
  Play, ThumbsUp, Heart, Share2, X, Send, Info, ImagePlus, Settings
} from "lucide-react";
import "./_group.css";

const portrait = "/__mockup/images/turki_al_alshikh_portrait.jpeg";
const cover = "/__mockup/images/turki_al_alshikh_cover.jpeg";
const MOCK_VISITOR_ID = "mock-visitor";

type TabKey = "all" | "stories" | "spotlight" | "related";

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

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "stories", label: "القصص" },
  { key: "spotlight", label: "منصة الأضواء" },
  { key: "related", label: "محتويات ذات صلة" },
];

function formatArabicNumber(value: number) {
  return value.toLocaleString("ar-SA");
}

function TabMessage({ tab }: { tab: string }) {
  const content: Record<string, { title: string, text: string }> = {
    stories: {
      title: "القصص",
      text: "تصفح الصور الرسمية واللحظات المختارة من أرشيف الصفحة."
    },
    spotlight: {
      title: "منصة الأضواء",
      text: "هنا ستجد المقاطع والتغطيات المرئية المنشورة من الحساب الرسمي."
    },
    related: {
      title: "محتويات ذات صلة",
      text: "صفحة رسمية تهتم بمشاركة الأخبار والمبادرات والفعاليات التي تعكس نبض الرياضة والترفيه والثقافة في المملكة."
    }
  };
  const selected = content[tab] || content.related;
  
  return (
    <div className="tp-empty">
      <MessageCircle size={32} color="#888" style={{ margin: '0 auto 16px' }} />
      <h2 style={{ color: '#fff', marginBottom: 8, marginTop: 0 }}>{selected.title}</h2>
      <p style={{ margin: 0 }}>{selected.text}</p>
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

  return (
    <div className="tp-dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tp-dialog-content">
        <button className="tp-dialog-close" onClick={onClose} aria-label="إغلاق"><X size={18} /></button>

        {post.image ? (
          <img src={post.image} className="tp-dialog-media" alt="محتوى المنشور" />
        ) : (
          <div className="tp-dialog-media-placeholder" />
        )}

        <div className="tp-dialog-body">
          <div className="tp-author-row">
            <img src={portrait} className="tp-author-avatar" alt="تركي آل الشيخ" />
            <div>
              <div className="tp-author-name">
                تركي آل الشيخ
                <span className="tp-verified is-small" title="حساب موثّق">
                  <Star size={10} fill="#000" color="#000" />
                </span>
              </div>
              <div className="tp-author-time">{post.time}</div>
            </div>
          </div>

          <p className="tp-dialog-copy">{post.copy}</p>

          <div className="tp-dialog-stats">
            <span>{formatArabicNumber(post.likes)} إعجاب</span>
            <span>{formatArabicNumber(post.comments)} تعليق</span>
            <span>{formatArabicNumber(post.shares)} مشاركة</span>
          </div>

          <div className="tp-dialog-actions">
            <button className={`tp-action-btn ${post.liked ? 'active' : ''}`} onClick={() => onLike(post.id)}>
              <ThumbsUp size={18} fill={post.liked ? "currentColor" : "none"} />
              {post.liked ? "أعجبني" : "إعجاب"}
            </button>
            <button className="tp-action-btn" onClick={() => document.getElementById(`comment-input-${post.id}`)?.focus()}>
              <MessageCircle size={18} />
              تعليق
            </button>
            <button className="tp-action-btn" onClick={() => onShare(post.id)}>
              <Share2 size={18} />
              مشاركة
            </button>
          </div>

          <form className="tp-comment-form" onSubmit={(e) => {
            e.preventDefault();
            if (comment.trim()) { onComment(post.id, comment); setComment(""); }
          }}>
            <img src={portrait} className="tp-comment-avatar" alt="حسابك" />
            <input id={`comment-input-${post.id}`} value={comment} onChange={e => setComment(e.target.value)} placeholder="اكتب تعليقاً..." />
            <button type="submit" disabled={!comment.trim()} aria-label="إرسال التعليق"><Send size={16} /></button>
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

  async function uploadImage(file: File) {
    if (!isSignedIn) {
      onRequireSignIn();
      return;
    }
    setUploading(true);
    try {
      // Keep uploads local to this isolated mockup; the production object-store
      // request is intentionally not carried over into the sandbox.
      setImagePath(URL.createObjectURL(file));
    } catch {
      setImagePath(null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="tp-dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tp-dialog-content" style={{ padding: 24, maxWidth: 500 }}>
        <button className="tp-dialog-close" style={{ top: 12, left: 12 }} onClick={onClose} aria-label="إغلاق"><X size={18} /></button>
         <h2 style={{ marginTop: 0, marginBottom: 16, color: 'var(--tp-text)' }}>إضافة منشور جديد</h2>
        <textarea
           value={text}
           onChange={e => setText(e.target.value)}
           placeholder="ماذا تود أن تشارك؟"
           className="tp-composer-textarea"
           rows={5}
        />
         <label className="tp-image-picker">
           <ImagePlus size={17} />
           <span>{uploading ? "جارٍ رفع الصورة..." : imagePath ? "تم حفظ الصورة" : "إضافة صورة محفوظة"}</span>
           <input
             type="file"
             accept="image/jpeg,image/png,image/webp"
             disabled={uploading}
             onChange={(event) => {
               const file = event.target.files?.[0];
               if (file) void uploadImage(file);
             }}
           />
         </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
           <button
             className="tp-primary-btn"
             disabled={uploading || !text.trim()}
             onClick={async () => {
               if (!text.trim() || uploading) return;
               const posted = await onPost(text.trim(), imagePath);
               if (posted) onClose();
             }}
           >
             {uploading ? "جارٍ الحفظ..." : "نشر"}
           </button>
        </div>
      </div>
    </div>
  );
}

function ChatDialog({
  visitorId,
  onClose,
}: {
  visitorId: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setBody("");
    setMessages((current) => [
      ...current,
      {
        id: `mock-message-${current.length + 1}`,
        visitorId,
        sender: "visitor",
        body: trimmed,
        createdAt: "الآن",
        read: true,
      },
    ]);
  }

  return (
    <div className="tp-dialog-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="tp-chat-dialog">
        <button className="tp-dialog-close" onClick={onClose} aria-label="إغلاق"><X size={18} /></button>
        <div className="tp-chat-heading">
          <div className="tp-chat-avatar"><MessageCircle size={18} /></div>
          <div>
            <strong>دردشة الصفحة الرسمية</strong>
            <span>رسائلك محفوظة ويمكنك العودة إليها لاحقاً</span>
          </div>
        </div>
        <div className="tp-chat-messages">
          {messages.length === 0 ? (
            <p className="tp-chat-empty">مرحباً بك. اكتب رسالتك هنا.</p>
          ) : (
            messages.map((message) => (
              <div className={`tp-chat-bubble ${message.sender === "visitor" ? "visitor" : "official"}`} key={message.id}>
                {message.body}
              </div>
            ))
          )}
        </div>
        <form className="tp-chat-form" onSubmit={sendMessage}>
          <input value={body} onChange={(event) => setBody(event.target.value)} placeholder="اكتب رسالتك..." />
          <button type="submit" disabled={!body.trim()} aria-label="إرسال الرسالة"><Send size={17} /></button>
        </form>
      </div>
    </div>
  );
}

export function Current() {
  // The sandbox behaves like a signed-in local preview so every interaction
  // remains available without Clerk, routing, or a backend.
  const isSignedIn = true;
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [isFollowing, setIsFollowing] = useState(false);
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [toast, setToast] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const visitorId = MOCK_VISITOR_ID;

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  }

  function toggleLike(postId: string) {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? { ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) }
          : post,
      ),
    );
  }

  async function addComment(postId: string, text: string) {
    setPosts((current) =>
      current.map((post) => (post.id === postId ? { ...post, comments: post.comments + 1 } : post)),
    );
    notify(`تمت إضافة تعليقك: ${text}`);
  }

  function sharePost(postId: string) {
    setShareOpen(true);
    setPosts((current) =>
      current.map((post) => (post.id === postId ? { ...post, shares: post.shares + 1 } : post)),
    );
  }

  function copyShareLink() {
    setShareOpen(false);
    notify("تم نسخ رابط الصفحة");
  }

  async function addPost(text: string, imagePath: string | null): Promise<boolean> {
    const post: Post = {
      id: `mock-post-${Date.now()}`,
      time: "الآن",
      copy: text,
      image: imagePath ?? undefined,
      likes: 0,
      comments: 0,
      shares: 0,
      liked: false,
    };
    setPosts((current) => [post, ...current]);
    notify("تم نشر منشورك وحفظه في المعاينة");
    return true;
  }

  const filteredPosts = posts.filter((post) => post.copy.includes(search.trim()) || !search.trim());
  const selectedPost = posts.find((p) => p.id === selectedPostId) || null;

  return (
    <div className="turki-page min-h-screen" dir="rtl">
      <header className="tp-header">
        <div className="tp-header-right-logical">
          <div className="tp-search-bar">
            <Search size={16} color="#888" />
            <input 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder="بحث" 
              aria-label="بحث في الصفحة" 
            />
          </div>
          <img src={portrait} className="tp-header-avatar" alt="صورة حسابك" />
        </div>
        
        <div className="tp-header-left-logical">
          <div className="tp-header-center hidden-mobile">
            <button className="tp-nav-item" onClick={() => setActiveTab("stories")}><PlaySquare size={20} /><span>القصص</span></button>
            <button className="tp-nav-item" onClick={() => setActiveTab("spotlight")}><MonitorPlay size={20} /><span>منصة الأضواء</span></button>
             <button className="tp-nav-item" onClick={() => setChatOpen(true)}><MessageCircle size={20} /><span>دردشة</span></button>
            <button className="tp-nav-item" onClick={() => notify("المميزات الإضافية قريباً")}><Sparkles size={20} /><span>المميزات</span></button>
             <button className="tp-nav-item" onClick={() => notify("لوحة التحكم متاحة في التطبيق الرسمي")}><Settings size={20} /><span>لوحة التحكم</span></button>
          </div>
          <button className="tp-icon-btn transparent" aria-label="القائمة"><Grip size={20} /></button>
        </div>
      </header>

      <main className="tp-main">
        <section className="tp-profile">
          <div className="tp-avatar-container">
            <div className="tp-avatar-ring">
              <img src={portrait} alt="صورة الحساب الرسمي" />
            </div>
          </div>
          
          <div className="tp-name-row">
            <h1>تركي آل الشيخ</h1>
            <span className="tp-verified" title="حساب موثّق"><Star size={12} fill="#000" color="#000" /></span>
            <button className="tp-mini-share" onClick={() => setShareOpen(true)} title="مشاركة الصفحة" aria-label="مشاركة الصفحة"><Forward size={12} /></button>
            <button className={`tp-mini-share ${isFollowing ? 'following' : ''}`} onClick={() => {
              setIsFollowing(!isFollowing);
              notify(!isFollowing ? "تمت متابعة الصفحة" : "تم إلغاء المتابعة");
            }} title={isFollowing ? "إلغاء المتابعة" : "متابعة"} aria-label={isFollowing ? "إلغاء المتابعة" : "متابعة"}>
              {isFollowing ? <UserCheck size={12} /> : <UserPlus size={12} />}
            </button>
          </div>
          
          <div className="tp-handle">alalshikhturki</div>
          <div className="tp-last-updated">آخر تحديث 2024/9/10</div>

          <div className="tp-pills-row">
            <button className="tp-pill" onClick={() => notify("تم نسخ الرابط")} aria-label="رابط الصفحة"><Link2 size={14}/> https://link.me/turki</button>
            <button className="tp-pill" onClick={() => notify("الموقع: الرياض، المملكة العربية السعودية")} aria-label="الموقع"><MapPin size={14}/> Riyadh, Saudi Arabia</button>
          </div>

          <p className="tp-bio">
            A personal account reflecting personal opinions ... could be right, could be wrong
          </p>
        </section>

        <section className="tp-tabs-container">
          <div className="tp-tabs" role="tablist">
            {TABS.map(tab => (
              <button 
                key={tab.key} 
                className={`tp-tab ${activeTab === tab.key ? 'active' : ''}`} 
                onClick={() => setActiveTab(tab.key)}
                role="tab"
                aria-selected={activeTab === tab.key}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        <div className="tp-controls-row">
          <button className="tp-sort" aria-label="ترتيب حسب">
            <span>التصنيف حسب: الأحدث</span>
            <ChevronDown size={14} />
          </button>
          <button className="tp-primary-btn" onClick={() => {
            if (isSignedIn) setComposerOpen(true);
            else notify("سجّل الدخول من التطبيق الرسمي لإضافة منشور");
          }}>
            إضافة منشور
          </button>
        </div>

        <section className="tp-grid">
          {activeTab === "all" ? (
            filteredPosts.length > 0 ? (
              filteredPosts.map(post => (
                <button key={post.id} className="tp-video-card" onClick={() => setSelectedPostId(post.id)} aria-label="عرض المنشور">
                  {post.image ? <img src={post.image} alt="" /> : <div className="tp-video-placeholder" />}
                  
                  {post.pinned && (
                    <div className="tp-pinned-badge">
                      <Star size={10} fill="#000" color="#000" />
                      <span>مثبت</span>
                    </div>
                  )}
                  
                  <div className="tp-video-overlay">
                    <div className="tp-play-icon">
                      <Play fill="currentColor" size={12} style={{ marginLeft: -2 }} />
                    </div>
                    
                    {post.copy && <div className="tp-video-title">{post.copy}</div>}
                    
                    <div className="tp-video-bottom">
                       <div className="tp-video-stat" title="المشاركات"><Forward size={12}/> {formatArabicNumber(post.shares)}</div>
                       <div className="tp-video-stat" title="التعليقات"><MessageCircle size={12}/> {formatArabicNumber(post.comments)}</div>
                       <div className="tp-video-stat" title="الإعجابات"><Heart size={12} fill={post.liked ? "currentColor" : "none"}/> {formatArabicNumber(post.likes)}</div>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="tp-empty">
                <Search size={32} color="#888" style={{ margin: '0 auto 16px' }} />
                <p>لا توجد نتائج مطابقة للبحث.</p>
              </div>
            )
          ) : (
             <TabMessage tab={activeTab} />
          )}
        </section>
      </main>

      {/* Dialogs and Notifications */}
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
            onRequireSignIn={() => notify("سجّل الدخول من التطبيق الرسمي لإضافة صورة")}
        />
      )}

      {chatOpen && visitorId && (
        <ChatDialog visitorId={visitorId} onClose={() => setChatOpen(false)} />
      )}
      
      {shareOpen && (
        <div className="tp-dialog-overlay" onClick={(e) => e.target === e.currentTarget && setShareOpen(false)}>
          <div className="tp-dialog-content" style={{ padding: 24, maxWidth: 400 }}>
            <button className="tp-dialog-close" style={{ top: 12, left: 12 }} onClick={() => setShareOpen(false)} aria-label="إغلاق"><X size={18} /></button>
            <h2 style={{ marginTop: 0, color: '#fff' }}>مشاركة الصفحة</h2>
            <p style={{ color: '#aaa', fontSize: 14, lineHeight: 1.6 }}>شارك الرابط مع من يهمه متابعة الأخبار والمبادرات من الحساب الرسمي.</p>
            <div className="tp-share-url">https://turki-alalshikh.sa/official</div>
            <button className="tp-primary-btn" style={{ width: '100%', marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={copyShareLink}>
              <Link2 size={16} /> نسخ الرابط
            </button>
          </div>
        </div>
      )}
      
      {toast && (
        <div className="tp-toast" role="status">
          <Info size={16} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

export default Current;