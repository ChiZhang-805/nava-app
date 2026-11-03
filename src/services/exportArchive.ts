export function archivePath(value: string) {
  const parts = value.replace(/\\/g, "/").split("/");
  if (parts.some(part => !part || part === "." || part === ".." || part.includes(":") || [...part].some(char => char.charCodeAt(0) < 32))) throw new Error("导出文件路径无效。");
  return parts.join("/");
}

function tarPathFields(path: string) {
  const bytes = (value: string) => new TextEncoder().encode(value).length;
  if (bytes(path) <= 100) return { name: path, prefix: "" };
  // POSIX ustar stores a 155-byte prefix separately from its 100-byte name.
  for (let split = path.lastIndexOf('/'); split > 0; split = path.lastIndexOf('/', split - 1)) {
    const prefix = path.slice(0, split);
    const name = path.slice(split + 1);
    if (bytes(prefix) <= 155 && bytes(name) <= 100) return { prefix, name };
  }
  throw new Error("导出文件路径过长，无法安全打包。");
}

export function buildTar(entries: Array<{ name: string; bytes: Uint8Array; modifiedAt?: string }>) {
  const chunks: Uint8Array[] = [];
  for (const entry of entries) {
    const header = new Uint8Array(512);
    const { name, prefix } = tarPathFields(archivePath(entry.name));
    writeTarText(header, 0, 100, name);
    writeTarText(header, 345, 155, prefix);
    writeTarOctal(header, 100, 8, 0o600);
    writeTarOctal(header, 108, 8, 0);
    writeTarOctal(header, 116, 8, 0);
    writeTarOctal(header, 124, 12, entry.bytes.byteLength);
    const modified = entry.modifiedAt ? new Date(entry.modifiedAt).getTime() : Date.now();
    writeTarOctal(header, 136, 12, Math.floor((Number.isFinite(modified) ? modified : Date.now()) / 1000));
    header.fill(32, 148, 156);
    header[156] = "0".charCodeAt(0);
    writeTarText(header, 257, 6, "ustar\0");
    writeTarText(header, 263, 2, "00");
    const checksum = header.reduce((sum, value) => sum + value, 0);
    const checksumText = checksum.toString(8).padStart(6, "0");
    writeTarText(header, 148, 6, checksumText);
    header[154] = 0;
    header[155] = 32;
    chunks.push(header, entry.bytes);
    const padding = (512 - entry.bytes.byteLength % 512) % 512;
    if (padding > 0) chunks.push(new Uint8Array(padding));
  }
  chunks.push(new Uint8Array(1024));
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function writeTarText(target: Uint8Array, offset: number, length: number, value: string) {
  target.set(new TextEncoder().encode(value).slice(0, length), offset);
}

function writeTarOctal(target: Uint8Array, offset: number, length: number, value: number) {
  writeTarText(target, offset, length, Math.max(0, Math.floor(value)).toString(8).padStart(length - 1, "0"));
}
