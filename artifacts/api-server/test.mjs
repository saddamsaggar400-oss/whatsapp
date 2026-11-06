import { build } from "esbuild";
import { mkdir, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const outputDirectory = ".test-dist";
try {
  await mkdir(outputDirectory, { recursive: true });
  await build({
    entryPoints: ["tests/*.test.ts"],
    outdir: outputDirectory,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
  });

  const testFiles = (await readdir(outputDirectory))
    .filter((file) => file.endsWith(".test.js"))
    .map((file) => `${outputDirectory}/${file}`);
  const result = spawnSync(
    process.execPath,
    ["--test", ...testFiles],
    { stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}