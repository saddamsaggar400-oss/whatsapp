import { useState, type FormEvent, useEffect } from "react";
import {
  Star, ChevronLeft, MoreHorizontal, MessageSquare, Camera, Send, X,
  Play, Heart, MessageCircle, Forward, Plus, ImagePlus
} from "lucide-react";
import "./SocialProfile.css";

const portrait = "/__mockup/images/turki_al_alshikh_portrait.jpeg";
const cover = "/__mockup/images/turki_al_alshikh_cover.jpeg";
const MOCK_VISITOR_ID = "mock-visitor";

type TabKey = "spotlight" | "stories" | "all";

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
    copy: "سعدت بهذا اللقاء للحديث عن توسيع آفاق البرامج التي تصنع أثراً حقيقياً في حياة الناس.",
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
    copy: "تمكين المواهب السعودية ودعم الأفكار الطموحة مسؤولية نؤمن بها.",
    image: portrait,
    likes: 61700,
    comments: 2140,
    shares: 1740,
    liked: false,
  },
  {
    id: "weekend",
    time: "أمس",
    copy: "نحتفي بكل من يضيف قيمة إلى المشهد الرياضي والترفيهي والثقافي.",
    likes: 44900,
    comments: 1260,
    shares: 980,
    liked: false,
  },
];

const TABS: { key: TabKey; label: string }[] = [
  { key: "spotlight", label: "منصة الأضواء" },
  { key: "stories", label: "القصص" },
];

function formatArabicNumber(value: number) {
  return value.toLocaleString("ar-SA");
}

export default function SocialProfile() {
  const [activeTab, setActiveTab] = useState<TabKey>("spotlight");
  const [isFollowing, setIsFollowing] = useState(false);
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [toast, setToast] = useState("");
  
  const [chatOpen, setChatOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");

  const [composerText, setComposerText] = useState("");
  const [composerImg, setComposerImg] = useState<string | null>(null);

  const selectedPost = posts.find((p) => p.id === selectedPostId) || null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedPostId) setSelectedPostId(null);
        else if (chatOpen) setChatOpen(false);
        else if (composerOpen) setComposerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPostId, chatOpen, composerOpen]);

  function notify(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2500);
  }

  function handleFollow() {
    setIsFollowing(!isFollowing);
    notify(!isFollowing ? "تم الاشتراك بالصفحة" : "تم إلغاء الاشتراك");
  }

  function handleSendChat(e: FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      visitorId: MOCK_VISITOR_ID,
      sender: "visitor",
      body: chatInput.trim(),
      createdAt: "الآن",
      read: true,
    };
    setChatMessages([...chatMessages, newMsg]);
    setChatInput("");
    
    // Auto reply for demo
    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        id: `reply-${Date.now()}`,
        visitorId: MOCK_VISITOR_ID,
        sender: "official",
        body: "رد تجريبي: مرحباً بك! هذه رسالة آلية لتأكيد استلام رسالتك.",
        createdAt: "الآن",
        read: true,
      }]);
    }, 1000);
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setComposerImg(URL.createObjectURL(file));
    }
  }

  function handlePost() {
    if (!composerText.trim() && !composerImg) return;
    const newPost: Post = {
      id: `post-${Date.now()}`,
      time: "الآن",
      copy: composerText.trim(),
      image: composerImg || undefined,
      likes: 0,
      comments: 0,
      shares: 0,
      liked: false,
    };
    setPosts([newPost, ...posts]);
    setComposerOpen(false);
    setComposerText("");
    setComposerImg(null);
    notify("تم إضافة القصة للمعاينة المحلية فقط");
  }

  function toggleLike(id: string) {
    setPosts(posts.map(p => 
      p.id === id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p
    ));
  }

  return (
    <div className="snap-profile-wrapper">
      <div className="snap-mobile-container">
        
        {/* Cover & Top Nav */}
        <div className="snap-cover-area">
          <img src={cover} className="snap-cover-img" alt="Cover" />
          <div className="snap-header-actions">
            <button className="snap-icon-btn" onClick={() => notify("العودة")} aria-label="العودة">
              <ChevronLeft size={24} />
            </button>
            <button className="snap-icon-btn" onClick={() => notify("زر تجريبي: لم يتم المشاركة فعلياً")} aria-label="خيارات إضافية">
              <MoreHorizontal size={24} />
            </button>
          </div>
        </div>

        {/* Profile Info */}
        <div className="snap-profile-sheet">
          <div className="snap-avatar-wrap">
            <div className="snap-avatar-ring">
              <img src={portrait} className="snap-avatar-img" alt="Profile" />
            </div>
          </div>
          
          <div className="snap-name-row">
            <h1 className="snap-name">تركي آل الشيخ</h1>
            <span className="snap-verified"><Star size={10} fill="#000" color="#000" /></span>
          </div>
          
          <div className="snap-handle">@alalshikhturki</div>
          
          <p className="snap-bio">
            A personal account reflecting personal opinions ... could be right, could be wrong
          </p>

          <div className="snap-actions-row">
            <button className={`snap-btn snap-btn-primary ${isFollowing ? 'active' : ''}`} onClick={handleFollow}>
              {isFollowing ? "تم الاشتراك" : "اشتراك"}
            </button>
            <button className="snap-btn snap-btn-chat" onClick={() => setChatOpen(true)}>
              <MessageSquare size={20} /> دردشة
            </button>
          </div>

          <div className="snap-tabs">
            {TABS.map(tab => (
              <button 
                key={tab.key} 
                className={`snap-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Grid */}
        <div className="snap-grid-wrapper">
          {posts.length > 0 ? (
            <div className="snap-grid">
              {posts.map(post => (
                <button key={post.id} className="snap-grid-item" onClick={() => setSelectedPostId(post.id)}>
                  {post.image ? (
                    <img src={post.image} className="snap-grid-img" alt="" />
                  ) : (
                    <div className="snap-grid-placeholder" />
                  )}
                  <div className="snap-grid-overlay">
                    <div className="snap-grid-stats">
                      <Play size={10} fill="#fff" /> {formatArabicNumber(post.likes + post.shares)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="snap-empty">
              <div className="snap-empty-title">لا توجد قصص بعد</div>
              <p>عند نشر قصص جديدة، ستظهر هنا.</p>
            </div>
          )}
        </div>

        {/* Floating Action Button for Posting */}
        <button className="snap-fab" onClick={() => setComposerOpen(true)} aria-label="إضافة قصة">
          <Plus size={28} />
        </button>

        {/* Dialogs */}
        
        {/* Chat Sheet */}
        {chatOpen && (
          <div className="snap-dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) setChatOpen(false); }}>
            <div className="snap-chat-sheet" role="dialog" aria-modal="true" aria-label="نافذة الدردشة">
              <div className="snap-chat-header">
                <div className="snap-chat-header-info">
                  <img src={portrait} className="snap-chat-avatar" alt="Avatar" />
                  <div className="snap-chat-title-wrap">
                    <h3 className="snap-chat-title">تركي آل الشيخ</h3>
                    <span className="snap-chat-subtitle">Official Page</span>
                  </div>
                </div>
                <button className="snap-icon-btn" style={{ background: '#F2F2F2', color: '#000' }} onClick={() => setChatOpen(false)} aria-label="إغلاق الدردشة">
                  <ChevronLeft size={20} />
                </button>
              </div>
              
              <div className="snap-chat-messages">
                <div className="snap-demo-notice">تجربة تصميم — الرسائل لا تُرسل فعلياً</div>
                {chatMessages.length === 0 ? (
                  <div className="snap-empty" style={{ margin: 'auto', padding: 0 }}>
                    <MessageSquare size={32} color="#CCC" style={{ margin: '0 auto 12px' }} />
                    <p style={{ margin: 0, fontSize: 14 }}>بدء المحادثة</p>
                  </div>
                ) : (
                  chatMessages.map(msg => (
                    <div key={msg.id} className={`snap-bubble ${msg.sender === 'visitor' ? 'visitor' : 'official'}`}>
                      {msg.body}
                    </div>
                  ))
                )}
              </div>

              <form className="snap-chat-input-bar" onSubmit={handleSendChat}>
                <div className="snap-chat-input-wrapper">
                  <Camera size={20} color="#888" />
                  <input 
                    value={chatInput} 
                    onChange={e => setChatInput(e.target.value)} 
                    placeholder="إرسال دردشة..." 
                  />
                </div>
                <button type="submit" className="snap-chat-send" disabled={!chatInput.trim()} aria-label="إرسال رسالة">
                  <Send size={18} />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Composer Sheet */}
        {composerOpen && (
          <div className="snap-dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) setComposerOpen(false); }}>
            <div className="snap-composer-sheet" role="dialog" aria-modal="true" aria-label="إضافة قصة">
              <div className="snap-composer-header">
                <h2 className="snap-composer-title">إضافة إلى القصة</h2>
                <button className="snap-icon-btn" style={{ background: '#F2F2F2', color: '#000' }} onClick={() => setComposerOpen(false)} aria-label="إغلاق إضافة قصة">
                  <X size={20} />
                </button>
              </div>
              
              <div className="snap-demo-notice">هذه واجهة تجريبية - المحتوى محلي ولن يتم نشره</div>

              <textarea 
                className="snap-textarea" 
                rows={4} 
                placeholder="اكتب شيئاً مميزاً..."
                value={composerText}
                onChange={e => setComposerText(e.target.value)}
              />
              
              <label className="snap-image-picker">
                <ImagePlus size={20} />
                {composerImg ? "تم اختيار الصورة (اضغط للتغيير)" : "إضافة صورة"}
                <input type="file" accept="image/*" onChange={handleImageUpload} />
              </label>

              <button 
                className="snap-composer-submit" 
                onClick={handlePost}
                disabled={!composerText.trim() && !composerImg}
              >
                إضافة
              </button>
            </div>
          </div>
        )}

        {/* Fullscreen Viewer */}
        {selectedPost && (
          <div className="snap-viewer" role="dialog" aria-modal="true" aria-label="عرض القصة">
            {selectedPost.image ? (
              <img src={selectedPost.image} className="snap-viewer-img" alt="" />
            ) : (
              <div className="snap-grid-placeholder" />
            )}
            <div className="snap-viewer-content">
              <div className="snap-viewer-top">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'white', fontWeight: 800 }}>
                  <img src={portrait} style={{ width: 32, height: 32, borderRadius: '50%' }} alt="" />
                  تركي آل الشيخ
                </div>
                <button className="snap-viewer-close" onClick={() => setSelectedPostId(null)} aria-label="إغلاق العرض">
                  <X size={20} />
                </button>
              </div>
              
              <div className="snap-viewer-bottom">
                <p className="snap-viewer-copy">{selectedPost.copy}</p>
                <div className="snap-viewer-actions-row">
                  <button 
                    className={`snap-viewer-btn ${selectedPost.liked ? 'active' : ''}`}
                    onClick={() => toggleLike(selectedPost.id)}
                  >
                    <Heart size={20} fill={selectedPost.liked ? "currentColor" : "none"} /> 
                    {formatArabicNumber(selectedPost.likes)}
                  </button>
                  <button className="snap-viewer-btn" onClick={() => notify("التعليقات غير مفعلة في هذه المعاينة")}>
                    <MessageCircle size={20} /> 
                    {formatArabicNumber(selectedPost.comments)}
                  </button>
                  <button className="snap-viewer-btn" onClick={() => notify("زر تجريبي للمشاركة")}>
                    <Forward size={20} /> 
                    {formatArabicNumber(selectedPost.shares)}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="snap-toast">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
