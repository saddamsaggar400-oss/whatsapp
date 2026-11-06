import { useCallback, useEffect, useState } from "react";
import { SignInButton, useAuth } from "@clerk/react";
import { Archive, ArrowRight, Image, LogIn, RefreshCw, RotateCcw, Send } from "lucide-react";
import "./admin-posts.css";

type AdminPost = {
  id: string;
  copy: string;
  imagePath: string | null;
  time: string;
  status: "published" | "archived";
  likes: number;
  comments: number;
  shares: number;
  pinned: boolean;
  archivedAt: string | null;
  restoredAt: string | null;
};

type RequestErrorKind = "auth" | "forbidden" | "invalid" | "request";

class AdminPostsRequestError extends Error {
  constructor(public readonly kind: RequestErrorKind) {
    super(kind);
    this.name = "AdminPostsRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePosts(value: unknown): AdminPost[] {
  if (!Array.isArray(value)) {
    throw new AdminPostsRequestError("invalid");
  }

  return value.map((post) => {
    if (
      !isRecord(post) ||
      typeof post.id !== "string" ||
      typeof post.copy !== "string" ||
      (post.imagePath !== null && typeof post.imagePath !== "string") ||
      typeof post.time !== "string" ||
      (post.status !== "published" && post.status !== "archived") ||
      typeof post.likes !== "number" ||
      typeof post.comments !== "number" ||
      typeof post.shares !== "number" ||
      typeof post.pinned !== "boolean" ||
      (post.archivedAt !== null && typeof post.archivedAt !== "string") ||
      (post.restoredAt !== null && typeof post.restoredAt !== "string")
    ) {
      throw new AdminPostsRequestError("invalid");
    }
    return post as unknown as AdminPost;
  });
}

function formatLifecycleDate(value: string): string {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function errorMessage(error: unknown, action: string): string {
  if (error instanceof AdminPostsRequestError) {
    if (error.kind === "auth") return "انتهت جلسة الدخول. سجل الدخول مرة أخرى.";
    if (error.kind === "forbidden") return "هذا الحساب ليس مخولًا لإدارة المنشورات.";
    if (error.kind === "invalid") return "وصلت بيانات غير صالحة من الخادم.";
  }
  return `تعذر ${action}. حاول مرة أخرى.`;
}

export default function AdminPosts() {
  const { isLoaded, isSignedIn } = useAuth();
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingPostId, setUpdatingPostId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [commentAuthor, setCommentAuthor] = useState<Record<string, string>>({});
  const [likesInput, setLikesInput] = useState<Record<string, string>>({});

  const royalAuthors = [
    "الشيخة روضة بنت مكتوم بن راشد بن سعيد آل مكتوم",
    "مريم بنت محمد بن راشد آل مكتوم",
  ];

  async function addRoyalComment(post: AdminPost) {
    const body = commentText[post.id]?.trim();
    const authorName = commentAuthor[post.id] || royalAuthors[0];
    if (!body) return;
    setUpdatingPostId(post.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/posts/${encodeURIComponent(post.id)}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, authorName }),
      });
      if (!response.ok) throw new AdminPostsRequestError("request");
      setCommentText((current) => ({ ...current, [post.id]: "" }));
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, comments: item.comments + 1 } : item));
    } catch (requestError) {
      setError(errorMessage(requestError, "إضافة التعليق"));
    } finally {
      setUpdatingPostId(null);
    }
  }

  async function saveLikes(post: AdminPost) {
    const likes = Number(likesInput[post.id] ?? post.likes);
    if (!Number.isInteger(likes) || likes < 0) return;
    setUpdatingPostId(post.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/posts/${encodeURIComponent(post.id)}/likes`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ likes }),
      });
      if (!response.ok) throw new AdminPostsRequestError("request");
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, likes } : item));
      setLikesInput((current) => ({ ...current, [post.id]: String(likes) }));
    } catch (requestError) {
      setError(errorMessage(requestError, "تحديث عدد الإعجابات"));
    } finally {
      setUpdatingPostId(null);
    }
  }

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/posts", {
        credentials: "include",
      });
      if (response.status === 401) throw new AdminPostsRequestError("auth");
      if (response.status === 403) throw new AdminPostsRequestError("forbidden");
      if (!response.ok) throw new AdminPostsRequestError("request");
      setPosts(parsePosts(await response.json()));
    } catch (requestError) {
      if (!isAbortError(requestError)) {
        setError(errorMessage(requestError, "تحميل المنشورات"));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      void loadPosts();
    }
  }, [isLoaded, isSignedIn, loadPosts]);

  async function archivePost(post: AdminPost) {
    if (
      !window.confirm(
        "سيتم إخفاء هذا المنشور عن الصفحة العامة مع الاحتفاظ به وصورته لإمكانية استعادته لاحقًا. هل تريد المتابعة؟",
      )
    ) {
      return;
    }

    setUpdatingPostId(post.id);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/posts/${encodeURIComponent(post.id)}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      if (response.status === 401) throw new AdminPostsRequestError("auth");
      if (response.status === 403) throw new AdminPostsRequestError("forbidden");
      if (response.status === 404) {
        setPosts((current) => current.filter((item) => item.id !== post.id));
        return;
      }
      if (!response.ok) throw new AdminPostsRequestError("request");
      await loadPosts();
    } catch (requestError) {
      if (!isAbortError(requestError)) {
        setError(errorMessage(requestError, "أرشفة المنشور"));
      }
    } finally {
      setUpdatingPostId(null);
    }
  }

  async function restorePost(post: AdminPost) {
    setUpdatingPostId(post.id);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/posts/${encodeURIComponent(post.id)}/restore`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (response.status === 401) throw new AdminPostsRequestError("auth");
      if (response.status === 403) throw new AdminPostsRequestError("forbidden");
      if (response.status === 404) {
        setPosts((current) => current.filter((item) => item.id !== post.id));
        return;
      }
      if (!response.ok) throw new AdminPostsRequestError("request");
      await loadPosts();
    } catch (requestError) {
      if (!isAbortError(requestError)) {
        setError(errorMessage(requestError, "استعادة المنشور"));
      }
    } finally {
      setUpdatingPostId(null);
    }
  }

  if (!isLoaded) {
    return <main className="admin-posts-page" dir="rtl"><p>جارٍ التحقق من جلسة الدخول...</p></main>;
  }

  if (!isSignedIn) {
    return (
      <main className="admin-posts-page" dir="rtl">
        <div className="admin-posts-empty">
          <LogIn size={38} />
          <h1>سجل الدخول لإدارة المنشورات</h1>
          <p>هذه الصفحة مخصصة لمالك الصفحة الرسمي.</p>
          <SignInButton mode="redirect" forceRedirectUrl="/admin/posts">
            <button className="admin-posts-primary-btn" type="button">تسجيل الدخول</button>
          </SignInButton>
          <a className="admin-posts-link" href="/">العودة إلى الصفحة الرسمية</a>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-posts-page" dir="rtl">
      <header className="admin-posts-header">
        <div>
          <span className="admin-posts-eyebrow">OFFICIAL PAGE</span>
          <h1>إدارة المنشورات</h1>
          <p>أخفِ المنشورات أو استعدها مع الحفاظ على محتواها وصورها.</p>
        </div>
        <div className="admin-posts-actions">
          <button
            className="admin-posts-refresh"
            type="button"
            onClick={() => void loadPosts()}
            disabled={loading || updatingPostId !== null}
            aria-label="تحديث المنشورات"
            title="تحديث المنشورات"
          >
            <RefreshCw size={17} className={loading ? "admin-posts-spin" : ""} />
          </button>
          <a className="admin-posts-link admin-posts-back" href="/admin/inbox">لوحة الرسائل</a>
          <a className="admin-posts-link admin-posts-back" href="/admin/appearance">مظهر الصفحة</a>
          <a className="admin-posts-link admin-posts-back" href="/">
            <ArrowRight size={16} /> الصفحة الرسمية
          </a>
        </div>
      </header>

      {error && <div className="admin-posts-error" role="alert">{error}</div>}

      {loading && posts.length === 0 ? (
        <div className="admin-posts-empty">جارٍ تحميل المنشورات...</div>
      ) : posts.length === 0 ? (
        <div className="admin-posts-empty">
          <Image size={38} />
          <h2>لا توجد منشورات</h2>
          <p>ستظهر المنشورات المنشورة والمؤرشفة هنا.</p>
        </div>
      ) : (
        <section className="admin-posts-grid" aria-label="المنشورات المنشورة والمؤرشفة">
          {posts.map((post) => (
            <article className={`admin-post-card ${post.status === "archived" ? "admin-post-card-archived" : ""}`} key={post.id}>
              {post.imagePath ? (
                <img src={post.imagePath} alt="" className="admin-post-image" />
              ) : (
                <div className="admin-post-image admin-post-image-empty"><Image size={28} /></div>
              )}
              <div className="admin-post-card-body">
                <div className="admin-post-card-meta">
                  <span>{post.time}</span>
                  {post.pinned && <strong>مثبت</strong>}
                  {post.status === "archived" && <strong className="admin-post-status">مؤرشف</strong>}
                </div>
                <p>{post.copy}</p>
                {post.status === "published" && (
                  <div className="admin-likes-counter">
                    <label htmlFor={`likes-${post.id}`}>عداد الإعجابات</label>
                    <div>
                      <input
                        id={`likes-${post.id}`}
                        type="number"
                        min="0"
                        max="999999999"
                        value={likesInput[post.id] ?? String(post.likes)}
                        onChange={(event) => setLikesInput((current) => ({ ...current, [post.id]: event.target.value }))}
                      />
                      <button type="button" onClick={() => void saveLikes(post)} disabled={updatingPostId !== null}>
                        حفظ العدد
                      </button>
                    </div>
                  </div>
                )}
                {post.status === "published" && (
                  <div className="admin-royal-comment">
                    <select value={commentAuthor[post.id] || royalAuthors[0]} onChange={(event) => setCommentAuthor((current) => ({ ...current, [post.id]: event.target.value }))}>
                      {royalAuthors.map((name) => <option key={name}>{name}</option>)}
                    </select>
                    <textarea value={commentText[post.id] || ""} onChange={(event) => setCommentText((current) => ({ ...current, [post.id]: event.target.value }))} placeholder="اكتبي التعليق الذي سيظهر على الصورة..." />
                    <button type="button" onClick={() => void addRoyalComment(post)} disabled={!commentText[post.id]?.trim() || updatingPostId !== null}>
                      <Send size={14} /> إضافة تعليق موثق
                    </button>
                  </div>
                )}
                {(post.archivedAt || post.restoredAt) && (
                  <div className="admin-post-history" aria-label="سجل حالة المنشور">
                    {post.archivedAt && (
                      <span>
                        <Archive size={13} />
                        آخر أرشفة: {formatLifecycleDate(post.archivedAt)}
                      </span>
                    )}
                    {post.restoredAt && (
                      <span>
                        <RotateCcw size={13} />
                        آخر استعادة: {formatLifecycleDate(post.restoredAt)}
                      </span>
                    )}
                  </div>
                )}
                <div className="admin-post-card-footer">
                  <span>{post.likes.toLocaleString("ar-SA")} إعجاب</span>
                  <button
                    type="button"
                     className={post.status === "archived" ? "admin-post-restore" : "admin-post-delete"}
                     onClick={() => void (post.status === "archived" ? restorePost(post) : archivePost(post))}
                     disabled={updatingPostId !== null}
                  >
                     {post.status === "archived" ? <RotateCcw size={15} /> : <Archive size={15} />}
                     {updatingPostId === post.id
                       ? post.status === "archived" ? "جارٍ الاستعادة..." : "جارٍ الأرشفة..."
                       : post.status === "archived" ? "استعادة المنشور" : "أرشفة المنشور"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}