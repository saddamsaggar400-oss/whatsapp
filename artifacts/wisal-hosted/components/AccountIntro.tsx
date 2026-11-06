"use client";

import { ChevronLeft } from "lucide-react";
import type { User } from "../lib/chat/types";
import { apiPath } from "./messaging-api";
import VerifiedBadge from "./legacy/VerifiedBadge";

export default function AccountIntro({ owner, onOpen }: { owner: User; onOpen: () => void }) {
  const photo = owner.avatarUrl.startsWith("/api/chat")
    ? apiPath(owner.avatarUrl.slice(9))
    : owner.avatarUrl;
  return (
    <button className="w-account-intro" onClick={onOpen} aria-label={`عرض معلومات حساب ${owner.name}`}>
      <img className="w-account-intro-photo" src={photo} alt={owner.name} />
      <span className="w-account-intro-name"><span>{owner.name}</span>{owner.verified ? <VerifiedBadge /> : null}</span>
      <span className="w-account-intro-handle" dir="ltr">@{owner.handle}</span>
      {owner.about && <span className="w-account-intro-about" dir="auto">{owner.about}</span>}
      <span className="w-account-intro-action">معلومات الحساب <ChevronLeft size={17} /></span>
    </button>
  );
}
