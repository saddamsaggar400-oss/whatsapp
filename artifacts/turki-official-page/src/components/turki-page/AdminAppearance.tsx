import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { SignInButton, useAuth } from "@clerk/react";
import { ArrowRight, LogIn, Palette, RotateCcw, Save } from "lucide-react";
import "./admin-appearance.css";

type Appearance = {
  primaryColor: string;
  profileImageSize: number;
  highlightSize: number;
  contentWidth: number;
  buttonRadius: number;
};

const defaults: Appearance = {
  primaryColor: "#4051F5",
  profileImageSize: 150,
  highlightSize: 58,
  contentWidth: 935,
  buttonRadius: 8,
};

export default function AdminAppearance() {
  const { isLoaded, isSignedIn } = useAuth();
  const [settings, setSettings] = useState<Appearance>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/appearance");
      if (!response.ok) throw new Error();
      setSettings(await response.json() as Appearance);
    } catch {
      setMessage("تعذر تحميل إعدادات المظهر.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/appearance", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (response.status === 401 || response.status === 403) {
        setMessage("هذا الحساب غير مخول لتعديل المظهر.");
      } else if (!response.ok) {
        setMessage("تعذر حفظ الإعدادات.");
      } else {
        setSettings(await response.json() as Appearance);
        setMessage("تم حفظ المظهر وتطبيقه على الصفحة.");
      }
    } catch {
      setMessage("تعذر الاتصال بالخادم.");
    } finally {
      setSaving(false);
    }
  }

  if (!isLoaded) return <main className="appearance-page" dir="rtl">جارٍ التحقق من جلسة الدخول...</main>;
  if (!isSignedIn) {
    return (
      <main className="appearance-page" dir="rtl">
        <section className="appearance-login">
          <LogIn size={38} />
          <h1>سجل الدخول لتعديل المظهر</h1>
          <SignInButton mode="redirect" forceRedirectUrl="/admin/appearance">
            <button type="button">تسجيل الدخول</button>
          </SignInButton>
        </section>
      </main>
    );
  }

  const previewStyle = {
    "--preview-color": settings.primaryColor,
    "--preview-radius": `${settings.buttonRadius}px`,
    "--preview-avatar": `${Math.min(settings.profileImageSize, 130)}px`,
    "--preview-highlight": `${settings.highlightSize}px`,
  } as CSSProperties;

  return (
    <main className="appearance-page" dir="rtl">
      <header className="appearance-header">
        <div><span>APPEARANCE</span><h1><Palette size={28} /> مظهر الصفحة</h1><p>غيّر الألوان والأحجام، ثم احفظها لتظهر لجميع الزوار.</p></div>
        <nav><a href="/admin/inbox">لوحة الرسائل</a><a href="/admin/posts">المنشورات</a><a href="/"><ArrowRight size={16} /> الصفحة</a></nav>
      </header>
      <div className="appearance-layout">
        <section className="appearance-controls">
          <label>اللون الأساسي <input type="color" value={settings.primaryColor} onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })} /></label>
          <Range label="حجم صورة الحساب" value={settings.profileImageSize} min={80} max={220} unit="px" onChange={(value) => setSettings({ ...settings, profileImageSize: value })} />
          <Range label="حجم دوائر القصص" value={settings.highlightSize} min={36} max={110} unit="px" onChange={(value) => setSettings({ ...settings, highlightSize: value })} />
          <Range label="عرض محتوى الصفحة" value={settings.contentWidth} min={680} max={1200} unit="px" onChange={(value) => setSettings({ ...settings, contentWidth: value })} />
          <Range label="استدارة الأزرار" value={settings.buttonRadius} min={0} max={28} unit="px" onChange={(value) => setSettings({ ...settings, buttonRadius: value })} />
          <div className="appearance-actions">
            <button type="button" className="save" onClick={() => void save()} disabled={saving || loading}><Save size={17} /> {saving ? "جارٍ الحفظ..." : "حفظ وتطبيق"}</button>
            <button type="button" onClick={() => setSettings(defaults)}><RotateCcw size={17} /> الافتراضي</button>
          </div>
          {message && <p className="appearance-message" role="status">{message}</p>}
        </section>
        <section className="appearance-preview" style={previewStyle}>
          <p>معاينة مباشرة</p>
          <div className="preview-profile"><img src="/images/latifa/profile-detailed.png" alt="" /><div><strong>hhshklatifa</strong><span>Latifa M R Al Maktoum</span></div></div>
          <div className="preview-buttons"><button>متابعة</button><button>مراسلة</button></div>
          <div className="preview-highlights">{["my-dubai", "family", "wef-davos"].map((name) => <img key={name} src={`/images/latifa/${name}.png`} alt="" />)}</div>
        </section>
      </div>
    </main>
  );
}

function Range({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void }) {
  return <label>{label}<span>{value}{unit}</span><input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}