export interface MessageTextPart {
  text: string;
  href?: string;
}

const closingBrackets: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

function trimUrlPunctuation(candidate: string) {
  const unmatched = new Map(
    Object.entries(closingBrackets).map(([close, open]) => [
      close,
      candidate.split(close).length - candidate.split(open).length,
    ]),
  );
  let end = candidate.length;
  while (end > 0) {
    const last = candidate[end - 1];
    if (/[.,!?;:…。，！”’»]/u.test(last)) {
      end -= 1;
    } else if ((unmatched.get(last) ?? 0) > 0) {
      unmatched.set(last, unmatched.get(last)! - 1);
      end -= 1;
    } else {
      break;
    }
  }
  return candidate.slice(0, end);
}

export function messageTextParts(text: string): MessageTextPart[] {
  const parts: MessageTextPart[] = [];
  const urls = /https?:\/\/[^\s<>"'`،؛؟\u200e\u200f\u202a-\u202e\u2066-\u2069]+/giu;
  let cursor = 0;

  for (const match of text.matchAll(urls)) {
    const href = trimUrlPunctuation(match[0]);
    try {
      const url = new URL(href);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    } catch {
      continue;
    }
    if (match.index > cursor) parts.push({ text: text.slice(cursor, match.index) });
    parts.push({ text: href, href });
    cursor = match.index + href.length;
  }

  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
