import { spawn } from "node:child_process";
const children = [];
function run(filter, port) {
  const child = spawn("pnpm", ["--filter", filter, "run", "dev"], {
    stdio: "inherit",
    env: { ...process.env, PORT: String(port) },
  });
  children.push(child);
  child.on("exit", (code) => {
    if (code) {
      for (const sibling of children) sibling.kill("SIGTERM");
      process.exitCode = code;
    }
  });
}
run("@workspace/api-server", process.env.API_PORT || 5000);
process.env.API_PROXY_TARGET = `http://127.0.0.1:${process.env.API_PORT || 5000}`;
run("@workspace/turki-official-page", process.env.PORT || 5173);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
  });
