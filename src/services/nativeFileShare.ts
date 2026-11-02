import { Capacitor } from "@capacitor/core";

type ShareDriver = {
  write: (path: string, data: string) => Promise<string>;
  share: (uri: string, title: string) => Promise<unknown>;
  remove: (path: string) => Promise<unknown>;
};

function encodeBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to prepare export file"));
    reader.onload = () => {
      const value = String(reader.result);
      const comma = value.indexOf(",");
      if (comma < 0) reject(new Error("Invalid export file"));
      else resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export function createNativeFileShare(driver: ShareDriver, encode = encodeBlob) {
  let active = false;
  return async (filename: string, blob: Blob, title = "NAVA") => {
    if (active) throw new Error("A file share is already open");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(filename)) throw new Error("Invalid export filename");
    active = true;
    const path = `nava-share/${crypto.randomUUID()}/${filename}`;
    let writeStarted = false;
    try {
      const data = await encode(blob);
      writeStarted = true;
      const uri = await driver.write(path, data);
      await driver.share(uri, title);
    } catch (error) {
      if (/\bcancell?ed\b/i.test(error instanceof Error ? error.message : String(error))) {
        throw new DOMException("Share cancelled", "AbortError");
      }
      throw error;
    } finally {
      if (writeStarted) {
        try { await driver.remove(path); }
        catch { console.warn("Temporary export cleanup deferred to the system cache."); }
      }
      active = false;
    }
  };
}

const nativeShare = createNativeFileShare({
  async write(path, data) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    return (await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true })).uri;
  },
  async share(uri, title) {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title, files: [uri] });
  },
  async remove(path) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    await Filesystem.rmdir({ path: path.slice(0, path.lastIndexOf('/')), directory: Directory.Cache, recursive: true });
  },
});

export const usesNativeFileShare = () => Capacitor.isNativePlatform();
export const shareNativeFile = nativeShare;
