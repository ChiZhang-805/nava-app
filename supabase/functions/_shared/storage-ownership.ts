export function assertOwnedStoragePath(path: string | undefined, userId: string, label: string) {
  if (!path) return;
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized.startsWith(`${userId}/`) || normalized.includes("../") || normalized.includes("/..")) {
    throw new Error(`${label}不属于当前登录账号。`);
  }
}
