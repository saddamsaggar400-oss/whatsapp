import {
  Info,
  MessageCircle,
  MessageSquarePlus,
  Send,
  UserRound,
} from "lucide-react";
import type { User } from "./api";
import VerifiedBadge from "./VerifiedBadge";

export default function ProfileLanding({
  profile,
  onStart,
}: {
  profile: User;
  onStart: () => void;
}) {
  return (
    <main className="chat-shell public-profile chat-is-open" dir="rtl">
      <nav className="rail" aria-label="الحساب">
        <span className="rail-logo">
          <MessageCircle size={25} />
        </span>
        <button
          className="icon-button rail-active"
          aria-label="بدء المحادثة"
          onClick={onStart}
        >
          <MessageCircle size={23} />
        </button>
        <span className="rail-spacer" />
        <button
          className="icon-button"
          aria-label="تسجيل الدخول"
          onClick={onStart}
        >
          <UserRound size={23} />
        </button>
      </nav>
      <aside className="chat-sidebar public-sidebar">
        <div className="public-sidebar-heading">
          <MessageCircle size={21} />
          <span>المحادثات</span>
        </div>
        <div className="public-account-card">
          <img src={profile.avatarUrl} alt={profile.name} />
          <span className="account-name public-handle">
            <strong dir="ltr">{profile.handle}</strong>
            <VerifiedBadge />
          </span>
          <h1>{profile.name}</h1>
          <p dir="auto">{profile.about}</p>
          <button className="primary-button" onClick={onStart}>
            <MessageSquarePlus size={18} />
            بدء المحادثة
          </button>
        </div>
        <div className="public-signin-note">
          <Info size={17} />
          <p>سجّل الدخول أو أنشئ حسابًا لحفظ رسائلك ومتابعة الردود.</p>
        </div>
      </aside>
      <section className="conversation-pane">
        <header className="conversation-header">
          <div className="conversation-person">
            <span className="avatar">
              <img src={profile.avatarUrl} alt="" />
            </span>
            <span>
              <strong className="account-name">
                <span dir="ltr">{profile.handle}</span>
                <VerifiedBadge />
              </strong>
              <small>{profile.name}</small>
            </span>
          </div>
          <button className="public-login-button" onClick={onStart}>
            تسجيل الدخول
          </button>
        </header>
        <div className="messages-area public-messages">
          <div className="conversation-start">
            <MessageCircle size={15} />
            المحادثة مع {profile.handle}
          </div>
          <div className="public-welcome-card">
            <img
              className="public-portrait"
              src={profile.avatarUrl}
              alt={profile.name}
            />
            <span className="account-name public-handle">
              <strong dir="ltr">{profile.handle}</strong>
              <VerifiedBadge />
            </span>
            <h2>{profile.name}</h2>
            <p className="public-bio" dir="auto">
              {profile.about}
            </p>
            <div className="public-card-divider" />
            <p className="public-description">
              أرسل رسالتك هنا، وتابع المحادثة من حسابك.
            </p>
            <button className="primary-button" onClick={onStart}>
              <MessageCircle size={19} />
              إرسال رسالة
            </button>
          </div>
        </div>
        <footer className="composer-wrap">
          <button className="public-composer" onClick={onStart}>
            <span>اكتب رسالتك إلى {profile.handle}…</span>
            <span className="send-button">
              <Send size={20} />
            </span>
          </button>
          <span className="composer-hint">سجّل الدخول لإرسال رسالتك</span>
        </footer>
      </section>
    </main>
  );
}
