import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { ChatStore, PROFILE_ID } from "./src/chat/store.ts";

const store = new ChatStore();
let hidden = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!hidden) process.stdout.write(chunk);
    callback();
  },
});
const input = createInterface({
  input: process.stdin,
  output,
  terminal: process.stdin.isTTY,
});
try {
  console.log("إعداد دخول صاحب حساب hhshklatifa على هذا الخادم.");
  process.stdout.write("كلمة مرور جديدة (8–128 حرفًا، لن تظهر): ");
  hidden = true;
  const password = await input.question("");
  hidden = false;
  process.stdout.write("\nأعد كلمة المرور: ");
  hidden = true;
  const confirmation = await input.question("");
  hidden = false;
  process.stdout.write("\n");
  if (password.length < 8 || password.length > 128 || password !== confirmation)
    throw new Error("الكلمتان يجب أن تتطابقا، والطول من 8 إلى 128 حرفًا.");
  const salt = randomBytes(16).toString("hex");
  const key = await promisify(scrypt)(password, salt, 64);
  store.transaction(() => {
    store.run(
      "UPDATE chat_users SET password = ? WHERE id = ?",
      `${salt}:${key.toString("hex")}`,
      PROFILE_ID,
    );
    store.run("DELETE FROM chat_sessions WHERE userId = ?", PROFILE_ID);
  });
  console.log(
    "تم إعداد الحساب. سجّل الدخول باسم hhshklatifa وكلمة المرور التي اخترتها.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  input.close();
  store.close();
}
