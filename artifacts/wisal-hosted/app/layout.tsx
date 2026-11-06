import type { Metadata } from "next";
import "./globals.css";
import "../components/messenger.css";
export const metadata: Metadata = {
  title: "وصال | محادثة مباشرة",
  description: "محادثة خاصة بينك وبين صاحب الموقع على وصال.",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
