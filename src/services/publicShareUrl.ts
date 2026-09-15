/** Share only a public entry point, never account routes or native localhost. */
export function publicShareUrl(href: string) {
  const url = new URL(href);
  if (!["https://nava-app-preview-cz.chizhang1031.chatgpt.site", "https://chizhang-805.github.io"].includes(url.origin)) return "https://nava-app-preview-cz.chizhang1031.chatgpt.site/";
  url.username = ""; url.password = ""; url.search = ""; url.hash = "";
  url.pathname = url.hostname === "chizhang-805.github.io" ? "/nava-app-preview/" : "/";
  return url.toString();
}
