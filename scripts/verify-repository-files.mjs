import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputDir = process.env.NAVA_FILE_AUDIT_OUTPUT || "Q:\\NAVA-Workspace\\Build\\TestRuns\\full-file-audit";
const textExtensions = new Set([
  ".css", ".csv", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".plist", ".ps1",
  ".sql", ".svg", ".toml", ".ts", ".tsx", ".txt", ".xml", ".yaml", ".yml",
  ".swift", ".strings", ".storyboard", ".xcprivacy", ".pbxproj", ".xcscheme", ".py", ".sh",
]);
const textNames = new Set([".gitignore", ".npmrc", "AGENTS.md", "LICENSE"]);
const decoder = new TextDecoder("utf-8", { fatal: true });

const listed = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root });
const files = [...new Set(listed.toString("utf8").split("\0").filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
const retired = new Map(JSON.parse(await readFile(path.join(root, 'scripts/retired-assets.json'), 'utf8')).files.map(item => [item.path, item]));
const approvedRetirements = [];
const sourceTexts = [];
const lower = new Map();
const failures = [];
const manifest = [];
let totalBytes = 0;
let textFiles = 0;
let jsonFiles = 0;
let imageFiles = 0;

function fail(file, check, detail) { failures.push({ file, check, detail }); }
function hasPrefix(buffer, values) { return values.every((value, index) => buffer[index] === value); }

for (const file of files) {
  const absolute = path.join(root, file);
  let info;
  let buffer;
  try {
    info = await stat(absolute);
    buffer = await import("node:fs/promises").then(({ readFile }) => readFile(absolute));
  } catch (error) {
    const retirement = retired.get(file);
    if (error.code === 'ENOENT' && retirement) {
      const blob = execFileSync('git', ['rev-parse', `HEAD:${file}`], {cwd:root, encoding:'utf8'}).trim();
      if (blob === retirement.gitBlob) { approvedRetirements.push(retirement); continue; }
    }
    fail(file, "read", error instanceof Error ? error.message : String(error));
    continue;
  }
  if (!info.isFile()) { fail(file, "type", "not a regular file"); continue; }
  if (buffer.length === 0) fail(file, "empty", "zero-byte file");
  totalBytes += buffer.length;
  const normalized = file.replaceAll("\\", "/");
  const key = normalized.toLocaleLowerCase("en-US");
  if (lower.has(key) && lower.get(key) !== normalized) fail(file, "case-collision", `collides with ${lower.get(key)}`);
  else lower.set(key, normalized);
  if (buffer.subarray(0, 128).toString("utf8").startsWith("version https://git-lfs.github.com/spec/v1")) fail(file, "lfs-pointer", "unresolved Git LFS pointer");

  const extension = path.extname(file).toLowerCase();
  const isText = textExtensions.has(extension) || textNames.has(path.basename(file));
  if (isText) {
    textFiles += 1;
    let text;
    try { text = decoder.decode(buffer); }
    catch (error) { fail(file, "utf8", error instanceof Error ? error.message : String(error)); }
    if (text != null) {
      if (/^(src|public|native|ios)\//.test(file) && !file.includes('/assets/')) sourceTexts.push({file,text});
      if (/^(<<<<<<< |=======\s*$|>>>>>>> )/m.test(text)) fail(file, "merge-marker", "unresolved merge conflict marker");
      if (extension === ".json") {
        jsonFiles += 1;
        try { JSON.parse(text); }
        catch (error) { fail(file, "json", error instanceof Error ? error.message : String(error)); }
      }
      if (extension === ".svg" && !/<svg(?:\s|\/?>)/i.test(text)) fail(file, "svg", "missing SVG root element");
    }
  }

  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(extension)) {
    imageFiles += 1;
    if (extension === ".png" && !hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) fail(file, "image-signature", "invalid PNG signature");
    if ([".jpg", ".jpeg"].includes(extension) && !(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9)) fail(file, "image-signature", "invalid JPEG boundaries");
    if (extension === ".gif" && !["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) fail(file, "image-signature", "invalid GIF signature");
    if (extension === ".webp" && !(buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP")) fail(file, "image-signature", "invalid WebP signature");
  }
  manifest.push({ file: normalized, bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") });
}

// Approved retirement is not permission to leave a dangling runtime reference.
for (const item of approvedRetirements) {
  const suffix = item.path.replace(/^(src|public)\//, '');
  const names = [suffix, item.path];
  if (!item.path.includes('/reference/')) names.push(path.basename(item.path));
  for (const source of sourceTexts) if (names.some(name => source.text.includes(name))) {
    fail(source.file, 'retired-reference', `still references retired asset ${item.path}`);
  }
}

const summary = {
  passed: failures.length === 0,
  scannedAt: new Date().toISOString(),
  files: files.length,
  bytes: totalBytes,
  textFiles,
  jsonFiles,
  imageFiles,
  approvedRetirements,
  failures,
};
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "tracked-files-report.json"), JSON.stringify(summary, null, 2));
await writeFile(path.join(outputDir, "tracked-files-manifest.json"), JSON.stringify(manifest, null, 2));
if (failures.length) {
  console.error(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Repository file scan passed: ${files.length} files, ${totalBytes} bytes, ${textFiles} text, ${jsonFiles} JSON, ${imageFiles} images.`);
  console.log(`Evidence: ${outputDir}`);
}
