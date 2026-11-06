import { env } from "cloudflare:workers";
import Messenger from "../../components/Messenger";
import { requireChatGPTUser, chatGPTSignOutPath } from "../chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireChatGPTUser("/admin");
  if (
    !env.ADMIN_EMAIL ||
    user.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()
  ) {
    return (
      <div className="wisal-app" data-theme="light" dir="rtl">
        <main className="w-login">
          <section className="w-login-card">
            <h1>هذا الحساب غير مخوّل</h1>
            <p>لوحة وصال خاصة بحساب صاحب الموقع المعتمد.</p>
            <a
              className="w-primary"
              href={chatGPTSignOutPath("/admin")}
              target="_top"
            >
              تغيير حساب تسجيل الدخول
            </a>
            <a className="w-text-button" href="/">
              العودة إلى محادثة الزائر
            </a>
          </section>
        </main>
      </div>
    );
  }
  return <Messenger mode="admin" />;
}
