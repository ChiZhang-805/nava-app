import { sevenDayDateRange, todayISO } from "./date.ts";

export type ReportModule = "mood" | "sleep" | "exercise" | "diet" | "focus" | "face" | "weekly";

export type ReportCardEntry = {
  date: string;
  value: number;
};

export type ReportCardOptions = {
  module: ReportModule;
  moduleLabel: string;
  entries: ReportCardEntry[];
  insights: string[];
  mascotUrl?: string;
  locale: "zh" | "en";
  valueFormatter: (value: number) => string;
  endDate: string;
  includeDates?: boolean;
  includeInsights?: boolean;
  insightsAreDemo?: boolean;
};

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function shortDate(date: string) {
  const [, month = "", day = ""] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function currentReportDateRange(date = new Date()) {
  return sevenDayDateRange(todayISO(date));
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load report mascot"));
    image.src = url;
  });
}

function drawContainedImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  try {
    const sample = document.createElement("canvas");
    sample.width = image.naturalWidth;
    sample.height = image.naturalHeight;
    const sampleContext = sample.getContext("2d", { willReadFrequently: true });
    sampleContext?.drawImage(image, 0, 0);
    const pixels = sampleContext?.getImageData(0, 0, sample.width, sample.height).data;
    if (pixels) {
      let minX = sample.width;
      let minY = sample.height;
      let maxX = -1;
      let maxY = -1;
      for (let pixelY = 0; pixelY < sample.height; pixelY += 1) {
        for (let pixelX = 0; pixelX < sample.width; pixelX += 1) {
          if (pixels[(pixelY * sample.width + pixelX) * 4 + 3] <= 8) continue;
          minX = Math.min(minX, pixelX);
          minY = Math.min(minY, pixelY);
          maxX = Math.max(maxX, pixelX);
          maxY = Math.max(maxY, pixelY);
        }
      }
      if (maxX >= minX && maxY >= minY) {
        const padding = Math.max(4, Math.round(Math.max(maxX - minX, maxY - minY) * 0.03));
        sourceX = Math.max(0, minX - padding);
        sourceY = Math.max(0, minY - padding);
        sourceWidth = Math.min(sample.width - sourceX, maxX - minX + 1 + padding * 2);
        sourceHeight = Math.min(sample.height - sourceY, maxY - minY + 1 + padding * 2);
      }
    }
  } catch {
    // Same-origin mascot assets are readable. If a future external asset is
    // not, retain the full-image contain behavior instead of blocking sharing.
  }
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function moduleAccent(module: ReportModule) {
  if (module === "sleep") return ["#315f86", "#76b9d5"] as const;
  if (module === "mood") return ["#177d9c", "#67c8da"] as const;
  if (module === "exercise") return ["#117d87", "#56c7b4"] as const;
  if (module === "face") return ["#536eaa", "#7bcbe0"] as const;
  if (module === "focus") return ["#376aa4", "#56b5d6"] as const;
  return ["#0879a7", "#43b8dc"] as const;
}

function wrappedLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const glyphs = Array.from(text);
  let line = "";
  const lines: string[] = [];
  glyphs.forEach((glyph) => {
    const candidate = line + glyph;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = glyph;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function writeWrappedLine(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const lines = wrappedLines(context, text, maxWidth);
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return y + Math.max(0, lines.length - 1) * lineHeight;
}

export async function createReportShareImage(options: ReportCardOptions) {
  const { module, moduleLabel, entries, insights, mascotUrl, locale, valueFormatter } = options;
  if (entries.length === 0) throw new Error("Cannot create a report card without entries");

  const { startDate, endDate } = sevenDayDateRange(options.endDate);
  const chartEntries = entries.filter((entry) => entry.date >= startDate && entry.date <= endDate && Number.isFinite(entry.value))
    .slice().sort((left, right) => left.date.localeCompare(right.date)).slice(-7);
  if (!chartEntries.length) throw new Error("No recorded values in the selected report period");
  const mascot = mascotUrl ? await loadImage(mascotUrl).catch(() => null) : null;

  const width = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  // Provider prose can itself contain calendar dates. Never promise date removal
  // while preserving that prose; the UI explains this coupled privacy choice.
  const sharedInsights = options.includeInsights && options.includeDates ? insights.slice(0, 4) : [];
  context.font = "500 28px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  const textHeight = sharedInsights.reduce((sum, insight) => sum + Math.max(0, wrappedLines(context, insight, mascot ? 540 : 790).length - 1) * 34 + 46, 0);
  const height = sharedInsights.length ? Math.max(1280, 878 + textHeight + 150) : 1120;
  if (height > 4096) throw new Error("Report text exceeds the supported image height");
  canvas.height = height;

  const [accent, accentSoft] = moduleAccent(module);
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#dff6ff");
  background.addColorStop(0.5, "#bdeaf7");
  background.addColorStop(1, "#6fc6e2");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.globalAlpha = 0.18;
  context.fillStyle = "#ffffff";
  for (let index = 0; index < 28; index += 1) {
    const x = 36 + ((index * 173) % 1020);
    const y = 42 + ((index * 239) % 1340);
    context.beginPath();
    context.arc(x, y, 2 + (index % 4), 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  roundedRect(context, 54, 56, 972, height - 112, 48);
  context.fillStyle = "rgba(248, 253, 255, 0.94)";
  context.fill();

  context.fillStyle = "#113348";
  context.font = "700 58px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  context.fillText(locale === "zh" ? `${moduleLabel}趋势报告` : `${moduleLabel} trend report`, 104, 158);
  context.fillStyle = "#78919d";
  context.font = "500 27px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  context.textAlign = "right";
  if (options.includeDates) context.fillText(`${shortDate(startDate)} — ${shortDate(endDate)}`, 976, 196);
  context.textAlign = "start";

  const average = chartEntries.reduce((sum, entry) => sum + entry.value, 0) / chartEntries.length;
  context.fillStyle = "#14394d";
  context.font = "750 34px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  context.fillText(locale === "zh" ? `近 7 日平均  ${valueFormatter(average)}` : `7-day average  ${valueFormatter(average)}`, 106, 236);

  const chartX = 104;
  const chartY = 292;
  const chartWidth = 872;
  const chartHeight = 430;
  roundedRect(context, chartX, chartY, chartWidth, chartHeight, 32);
  context.fillStyle = "rgba(225, 245, 252, 0.72)";
  context.fill();

  const values = chartEntries.map((entry) => entry.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const range = Math.max(1, rawMax - rawMin);
  const minimumBarRatio = 0.34;
  const plotLeft = chartX + 56;
  const plotRight = chartX + chartWidth - 56;
  const plotTop = chartY + 60;
  const plotBottom = chartY + chartHeight - 72;
  const yAt = (value: number) => {
    const valueRatio = rawMax === rawMin ? 0.5 : (value - rawMin) / range;
    const heightRatio = minimumBarRatio + valueRatio * (1 - minimumBarRatio);
    return plotBottom - heightRatio * (plotBottom - plotTop);
  };
  const xAt = (index: number) => plotLeft + (chartEntries.length <= 1 ? (plotRight - plotLeft) / 2 : (index / (chartEntries.length - 1)) * (plotRight - plotLeft));

  context.strokeStyle = "rgba(43, 121, 154, 0.16)";
  context.lineWidth = 2;
  [0.25, 0.5, 0.75].forEach((ratio) => {
    const y = plotTop + (plotBottom - plotTop) * ratio;
    context.beginPath();
    context.moveTo(plotLeft, y);
    context.lineTo(plotRight, y);
    context.stroke();
  });

  const barGradient = context.createLinearGradient(0, plotTop, 0, plotBottom);
  barGradient.addColorStop(0, accentSoft);
  barGradient.addColorStop(1, accent);
  chartEntries.forEach((entry, index) => {
    const x = xAt(index);
    const y = yAt(entry.value);
    roundedRect(context, x - 19, y, 38, plotBottom - y, 12);
    context.fillStyle = barGradient;
    context.fill();
    context.fillStyle = "#355d70";
    context.font = "650 19px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
    context.textAlign = "center";
    context.fillText(options.includeDates ? shortDate(entry.date) : `${index + 1}`, x, plotBottom + 36);
  });

  context.strokeStyle = accent;
  context.lineWidth = 7;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  chartEntries.forEach((entry, index) => {
    const x = xAt(index);
    const y = (yAt(entry.value) + plotBottom) / 2;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  chartEntries.forEach((entry, index) => {
    const x = xAt(index);
    const y = (yAt(entry.value) + plotBottom) / 2;
    context.beginPath();
    context.arc(x, y, 9, 0, Math.PI * 2);
    context.fillStyle = "#f8fdff";
    context.fill();
    context.strokeStyle = accent;
    context.lineWidth = 6;
    context.stroke();
  });
  context.textAlign = "start";

  context.fillStyle = "#173d51";
  context.font = "750 36px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  context.fillText(sharedInsights.length ? (options.insightsAreDemo ? (locale === "zh" ? "演示洞察" : "Demo insights") : (locale === "zh" ? "AI 状态洞察" : "AI status insights")) : (locale === "zh" ? "我的记录足迹" : "My check-ins"), 108, 806);
  context.font = "500 28px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  let insightY = 878;
  sharedInsights.forEach((insight) => {
    const y = insightY;
    context.beginPath();
    context.arc(123, y - 8, 7, 0, Math.PI * 2);
    context.fillStyle = accent;
    context.fill();
    context.fillStyle = "#31566a";
    insightY = writeWrappedLine(context, insight, 151, y, mascot ? 540 : 790, 34) + 46;
  });
  if (!sharedInsights.length) {
    context.fillStyle = "#31566a";
    writeWrappedLine(context, locale === "zh" ? `这一周期有 ${chartEntries.length} 天真实记录。` : `${chartEntries.length} recorded days in this period.`, 108, 894, 540, 36);
  }

  if (mascot) drawContainedImage(context, mascot, 706, 818, 270, sharedInsights.length ? 312 : 180);

  context.fillStyle = "#78919d";
  context.font = "500 24px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  context.fillText(locale === "zh" ? "每一次真实记录，都让个人节律更清晰。" : "Every real check-in makes your rhythm clearer.", 108, height - 114);
  context.fillStyle = accent;
  context.fillRect(108, height - 88, 180, 8);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Failed to encode report card")), "image/png", 0.95);
  });
}

// The exact previewed bytes are exported on a fresh user click; do not regenerate here.
export async function sharePreparedReportImage(blob: Blob, options: ReportCardOptions) {
  const fileName = `NAVA-${options.module}${options.includeDates ? `-${options.endDate}` : ""}.png`;
  const file = new File([blob], fileName, { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: `NAVA · ${options.moduleLabel}`,
      text: options.module === "weekly" ? (options.locale === "zh" ? "我的 NAVA 节律周报" : "My NAVA weekly rhythm report") : (options.locale === "zh" ? "我的近 7 日 NAVA 状态报告" : "My NAVA 7-day status report"),
      files: [file],
    });
    return "shared" as const;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded" as const;
}
