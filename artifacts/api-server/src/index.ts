import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import app from "./app";

const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT");
const publicDirectory = fileURLToPath(
  new URL("../../turki-official-page/dist/public/", import.meta.url),
);
if (existsSync(publicDirectory)) {
  app.use(express.static(publicDirectory));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(`${publicDirectory}/index.html`);
  });
}
const server = app.listen(port, "0.0.0.0", () =>
  console.log(`Wisal: http://localhost:${port}`),
);
const shutdown = () => {
  server.close();
  server.closeAllConnections();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
