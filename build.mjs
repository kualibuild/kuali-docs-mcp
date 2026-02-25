import { build } from "esbuild";
import { createWriteStream, readFileSync } from "fs";
import { mkdir, copyFile, rm } from "fs/promises";
import { join } from "path";
import { execSync } from "child_process";

// 1. Bundle with esbuild into a single dist/index.js
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  outfile: "dist/index.js",
  external: [],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});

console.log("✓ Bundled dist/index.js");

// 2. Package as .dxt (zip of manifest.json + dist/)
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const dxtName = `${manifest.name}-v${manifest.version}.dxt`;

// Use zip command to create the .dxt archive
execSync(`zip -r ${dxtName} manifest.json dist/`, { stdio: "inherit" });

console.log(`✓ Packaged ${dxtName}`);
console.log("\nDone! Distribute the .dxt file to your team.");
