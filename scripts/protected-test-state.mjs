// Durable local recovery without storing account credentials or plaintext health records.
import { spawnSync } from "node:child_process";
import { open, readFile, rename } from "node:fs/promises";
const transform = (bytes, decrypt) => {
  if (process.platform !== "win32") throw new Error("This recovery journal requires Windows CurrentUser DPAPI.");
  const operation = decrypt ? "Unprotect" : "Protect";
  const command = `Add-Type -AssemblyName System.Security; $data = [Convert]::FromBase64String([Console]::In.ReadToEnd()); $result = [Security.Cryptography.ProtectedData]::${operation}($data, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($result))`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { input: bytes.toString("base64"), encoding: "utf8", windowsHide: true, timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0 || result.error) throw new Error("Protected local recovery journal failed; no external write is allowed.");
  return Buffer.from(result.stdout.trim(), "base64");
};
export async function writeProtectedTestState(path, value) {
  const encrypted = transform(Buffer.from(JSON.stringify(value)), false);
  const temporary = `${path}.pending`;
  const handle = await open(temporary, "w");
  try { await handle.writeFile(encrypted); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, path);
}
export async function readProtectedTestState(path) { return JSON.parse(transform(await readFile(path), true).toString("utf8")); }
