import { Fragment } from "react";
import { messageTextParts } from "./message-links";

export default function MessageText({ text }: { text: string }) {
  return messageTextParts(text).map((part, index) => (
    part.href ? (
      <a key={index} className="w-message-link" href={part.href}
        target="_blank" rel="noopener noreferrer" dir="ltr">
        {part.text}
      </a>
    ) : (
      <Fragment key={index}>{part.text}</Fragment>
    )
  ));
}
