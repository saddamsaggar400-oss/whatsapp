'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CircleDashed, Video, X, ChevronLeft } from 'lucide-react';
import type { Status, User } from '../lib/chat/types';
import { apiPath, dayText, fileUrl, timeText } from './messaging-api';
import VerifiedBadge from './legacy/VerifiedBadge';

const portraitUrl = (owner: User) => owner.avatarUrl.startsWith('/api/chat') ? apiPath(owner.avatarUrl.slice(9)) : owner.avatarUrl;
function Portrait({ owner, onClose }: { owner: User; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="w-photo-dialog" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === dialog.current) onClose(); }}><button className="w-photo-close" aria-label="إغلاق صورة الحساب" onClick={onClose}><X size={25} /></button><img src={portraitUrl(owner)} alt={owner.name} /></dialog>;
}
export default function OwnerInfo({ owner, statuses, onClose, onStatus }: { owner: User; statuses: Status[]; onClose: () => void; onStatus: (id?: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), [photo, setPhoto] = useState(false), [now, setNow] = useState(Date.now());
  useEffect(() => { dialog.current?.showModal(); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const visible = statuses.filter(status => status.expiresAt > now);
  return <><dialog ref={dialog} className="w-modal w-account-sheet" dir="rtl" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <header className="w-account-heading"><button className="w-icon" aria-label="العودة إلى المحادثة" onClick={onClose}><ArrowRight size={23} /></button><h2>معلومات الحساب</h2></header>
    <section className="w-account-identity"><button className="w-owner-photo" aria-label="عرض صورة الحساب" onClick={() => setPhoto(true)}><img src={portraitUrl(owner)} alt={owner.name} /></button><h3 className="w-name"><span>{owner.name}</span>{owner.verified ? <VerifiedBadge /> : null}</h3><span className="w-owner-handle" dir="ltr">@{owner.handle}</span></section>
    <section className="w-account-about"><h4>حول</h4><p dir="auto">{owner.about || 'لا توجد نبذة حاليًا.'}</p></section>
    <section className="w-account-statuses"><div className="w-account-section-title"><CircleDashed size={20} /><h4>الحالات</h4><small>آخر 24 ساعة</small></div>{visible.length ? visible.map(status => <button className="w-status-row" key={status.id} onClick={() => onStatus(status.id)}><span className="w-account-status-thumb" style={{ background: status.color }}>{status.attachment?.mime.startsWith('image/') ? <img src={fileUrl(status.attachment.id)} alt="صورة الحالة" /> : status.attachment?.mime.startsWith('video/') ? <Video size={22} /> : <span>{status.text.slice(0,2)}</span>}</span><span><strong>{status.attachment?.mime.startsWith('image/') ? status.text || 'حالة صورة' : status.attachment?.mime.startsWith('video/') ? status.text || 'حالة فيديو' : status.text.slice(0,50)}</strong><small>{dayText(status.createdAt)} · {timeText(status.createdAt)}</small></span><ChevronLeft size={18} /></button>) : <p className="w-account-empty">لا توجد حالات منشورة حاليًا.</p>}</section>
  </dialog>{photo && <Portrait owner={owner} onClose={() => setPhoto(false)} />}</>;
}
