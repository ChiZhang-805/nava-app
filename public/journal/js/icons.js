/* Main category/navigation icons: Lucide (ISC/Feather MIT), verified upstream SVGs.
 * See licenses/Lucide-LICENSE.txt and docs/v11-icons.md for sources.
 * Shared small controls retain local normalized geometry; status-bar artwork is independent. */
window.FluffyIcons = (() => {
    "use strict";
    const paths = Object.freeze({
        "home": "<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\"/><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/>",
        "mood": "<path d=\"M15 10V9M16.472 15a6 6 0 0 1-8.943 0M9 10V9\"/><circle cx=\"12\" cy=\"12\" r=\"10\"/>",
        "food": "<path d=\"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7\"/>",
        "sport": "<path d=\"M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z\"/><path d=\"m2.5 21.5 1.4-1.4m16.2-16.2 1.4-1.4M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829zm4.257-7.085 4.8-4.8\"/>",
        "focus": "<path d=\"M10 2h4M12 14l3-3\"/><circle cx=\"12\" cy=\"14\" r=\"8\"/>",
        "sleep": "<path d=\"M18 5h4M20 3v4M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401\"/>",
        "face": "<path d=\"M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01\"/>",
        "chat": "<path d=\"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719M8 12h.01M12 12h.01M16 12h.01\"/>",
        "history": "<path d=\"M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4M2 6h4M2 10h4M2 14h4M2 18h4M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z\"/>",
        "tasks": "<path d=\"M13 5h8M13 12h8M13 19h8m-18-2 2 2 4-4M3 7l2 2 4-4\"/>",
        "profile": "<path d=\"M17.925 20.056a6 6 0 0 0-11.851.001\"/><circle cx=\"12\" cy=\"11\" r=\"4\"/><circle cx=\"12\" cy=\"12\" r=\"10\"/>",
        "menu": "<path d=\"M5 6h14M5 12h14M5 18h14\"/>",
        "close": "<path d=\"m6 6 12 12M18 6 6 18\"/>",
        "back": "<path d=\"m15 4-8 8 8 8\"/>",
        "arrow": "<path d=\"m9 4 8 8-8 8\"/>",
        "check": "<path d=\"m5 12 4 4L19 6\"/>",
        "leaf": "<path d=\"M20 3C8 2 1 10 6 17s16-2 14-14ZM5 21 16 8\"/>",
        "ring": "<circle cx=\"12\" cy=\"12\" r=\"8\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
        "mic": "<rect x=\"9\" y=\"2\" width=\"6\" height=\"12\" rx=\"3\"/><path d=\"M6 10v2a6 6 0 0 0 12 0v-2M12 18v4M8 22h8\"/>",
        "camera": "<path d=\"M14.5 4h-5L7.5 7H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2.5z\"/><circle cx=\"12\" cy=\"13.5\" r=\"3.5\"/>",
        "photo": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"3\"/><circle cx=\"8\" cy=\"8\" r=\"1.5\"/><path d=\"m4 18 6-6 4 3 3-4 4 5\"/>",
        "sparkle": "<path d=\"m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4Z\"/>",
        "pause": "<path d=\"M8 5v14M16 5v14\" stroke-width=\"3.5\"/>",
        "play": "<path d=\"m8 4 12 8-12 8Z\"/>",
        "stop": "<rect x=\"5\" y=\"5\" width=\"14\" height=\"14\" rx=\"2\"/>",
        "reset": "<path d=\"M4 10a8 8 0 1 1 1 7M4 4v6h6\"/>",
        "coffee": "<path d=\"M4 8h12v8a5 5 0 0 1-12 0ZM16 8h2a3 3 0 0 1 0 6h-2M3 22h16M7 2v3M12 2v3\"/>",
        "move": "<path d=\"M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3\"/>",
        "edit": "<path d=\"m16 3 5 5-12.5 12.5-6 1 1-6Z M13.5 5.5l5 5\"/>",
        "trash": "<path d=\"M3 6h18M9 3h6M5 6l1 15h12l1-15M10 10v7M14 10v7\"/>",
        "export": "<path d=\"M12 3v12M8 7l4-4 4 4M4 13v8h16v-8\"/>",
        "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2\"/>",
        "heart": "<path d=\"M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z\"/>",
        "send": "<path d=\"m3 3 18 9-18 9 4-9ZM7 12h14\"/>",
        "more": "<circle cx=\"5\" cy=\"12\" r=\"1\" fill=\"currentColor\"/><circle cx=\"12\" cy=\"12\" r=\"1\" fill=\"currentColor\"/><circle cx=\"19\" cy=\"12\" r=\"1\" fill=\"currentColor\"/>",
        "language": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><ellipse cx=\"12\" cy=\"12\" rx=\"4\" ry=\"9\"/><path d=\"M3 12h18\"/>",
        "info": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v6M12 7h.01\"/>",
        "calendar": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"3\"/><path d=\"M7 3v4M17 3v4M3 11h18M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01\"/>",
        "plus": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M8 12h8M12 8v8\"/>",
        "undo": "<path d=\"M3 10h10a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5\"/>",
        "clock": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 6v6l4 2\"/>",
        "chevronDown": "<path d=\"m6 9 6 6 6-6\"/>",
        "list": "<path d=\"M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01\"/>"
    });
    /**
     * 输入：name（白名单名称）、className（可选样式类）。
     * 输出：受控SVG字符串。
     * 功能：统一24单位网格、圆角与1.8描边；无字体或CDN依赖，不插入用户文本。
     */
    function svg(name, className = "") {
        const safe = String(className).replace(/[^a-zA-Z0-9_ -]/g, "");
        const key = Object.hasOwn(paths, name) ? name : "sparkle";
        return `<svg class="icon ${safe}" data-icon-name="${key}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[key]}</svg>`;
    }
    return { svg };
})();
