import type { Metadata } from "next";
import Messenger from "../components/Messenger";
export const metadata: Metadata = { title: "التحدث عبر الواتس اب", openGraph: { title: "التحدث عبر الواتس اب", description: "محادثة مباشرة مع صاحب الحساب." } };
export default function Home() { return <Messenger mode="guest" />; }
