import assert from "node:assert/strict";
import test from "node:test";
import { messageTextParts } from "../../wisal-hosted/components/message-links";

test("HTTP and HTTPS links retain their original text, query parameters and surrounding Arabic paragraphs", () => {
  const text = "مرحبًا، افتح https://example.com/المساعدة?item=1&lang=ar#details\nأو HTTP://example.org/help ثم تابع معنا.";
  const parts = messageTextParts(text);
  assert.equal(parts.map(part => part.text).join(""), text);
  assert.deepEqual(parts.filter(part => part.href).map(part => part.href), [
    "https://example.com/المساعدة?item=1&lang=ar#details", "HTTP://example.org/help",
  ]);
});

test("sentence punctuation and unmatched brackets stay outside the link while balanced URL parentheses are retained", () => {
  const text = "(https://example.com/a(b))، ثم https://example.org/help. وأيضًا https://example.net/x؟ نعم";
  const parts = messageTextParts(text);
  assert.equal(parts.map(part => part.text).join(""), text);
  assert.deepEqual(parts.filter(part => part.href).map(part => part.href), [
    "https://example.com/a(b)", "https://example.org/help", "https://example.net/x",
  ]);
});

test("unsupported schemes and incomplete URLs stay plain text, and text resembling markup is never interpreted as HTML", () => {
  const text = '<img src=x onerror=alert(1)> javascript:alert(1) data:text/html,x ftp://example.net https:// ??? https://example.com/?q=<script>';
  const parts = messageTextParts(text);
  assert.equal(parts.map(part => part.text).join(""), text);
  assert.deepEqual(parts.filter(part => part.href), [
    { text: "https://example.com/?q=", href: "https://example.com/?q=" },
  ]);
  assert.deepEqual(messageTextParts("نص عادي\nبدون روابط"), [{ text: "نص عادي\nبدون روابط" }]);
  assert.deepEqual(messageTextParts(""), []);
});
