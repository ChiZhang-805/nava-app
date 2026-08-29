export type ReportModule = "mood" | "sleep" | "exercise" | "diet" | "focus" | "face";

export type ReportCardEntry = {
  date: string;
  value: number;
};

type ReportCardOptions = {
  module: ReportModule;
  moduleLabel: string;
  entries: ReportCardEntry[];
  insights: string[];
  locale: "zh" | "en";
  valueFormatter: (value: number) => string;
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

function moduleAccent(module: ReportModule) {
  if (module === "sleep") return ["#315f86", "#76b9d5"] as const;
  if (module === "mood") return ["#177d9c", "#67c8da"] as const;
  if (module === "exercise") return ["#117d87", "#56c7b4"] as const;
  if (module === "face") return ["#536eaa", "#7bcbe0"] as const;
  if (module === "focus") return ["#376aa4", "#56b5d6"] as const;
  return ["#0879a7", "#43b8dc"] as const;
}

function writeWrappedLine(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const glyphs = Array.from(text);
  let line = "";
  let cursorY = y;
  glyphs.forEach((glyph) => {
    const candidate = line + glyph;
    if (line && context.measureText(candidate).width > maxWidth) {
      context.fillText(line, x, cursorY);
      cursorY += lineHeight;
      line = glyph;
    } else {
      line = candidate;
    }
  });
  if (line) context.fillText(line, x, cursorY);
  return cursorY;
}

export async function createReportShareImage(options: ReportCardOptions) {
  const { module, moduleLabel, entries, insights, locale, valueFormatter } = options;
  if (entries.length === 0) throw new Error("Cannot create a report card without entries");

  const width = 1080;
  const height = 1440;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

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

  roundedRect(context, 54, 56, 972, 1328, 48);
  context.fillStyle = "rgba(248, 253, 255, 0.94)";
  context.fill();

  context.fillStyle = "#113348";
  context.font = "700 58px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  context.fillText(locale === "zh" ? `${moduleLabel}趋势报告` : `${moduleLabel} trend report`, 104, 158);
  context.fillStyle = accent;
  context.font = "800 34px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  context.fillText("NAVA", 860, 152);

  const average = entries.reduce((sum, entry) => sum + entry.value, 0) / entries.length;
  context.fillStyle = "#78919d";
  context.font = "500 27px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  context.fillText(`${shortDate(entries[0].date)} — ${shortDate(entries[entries.length - 1].date)}`, 106, 210);
  context.fillStyle = "#14394d";
  context.font = "750 34px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  context.fillText(locale === "zh" ? `近 7 日平均  ${valueFormatter(average)}` : `7-day average  ${valueFormatter(average)}`, 106, 270);

  const chartX = 104;
  const chartY = 334;
  const chartWidth = 872;
  const chartHeight = 430;
  roundedRect(context, chartX, chartY, chartWidth, chartHeight, 32);
  context.fillStyle = "rgba(225, 245, 252, 0.72)";
  context.fill();

  const values = entries.map((entry) => entry.value);
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
  const xAt = (index: number) => plotLeft + (entries.length <= 1 ? (plotRight - plotLeft) / 2 : (index / (entries.length - 1)) * (plotRight - plotLeft));

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
  entries.forEach((entry, index) => {
    const x = xAt(index);
    const y = yAt(entry.value);
    roundedRect(context, x - 19, y, 38, plotBottom - y, 12);
    context.fillStyle = barGradient;
    context.fill();
    context.fillStyle = "#355d70";
    context.font = "650 19px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
    context.textAlign = "center";
    context.fillText(shortDate(entry.date), x, plotBottom + 36);
  });

  context.strokeStyle = accent;
  context.lineWidth = 7;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  entries.forEach((entry, index) => {
    const x = xAt(index);
    const y = (yAt(entry.value) + plotBottom) / 2;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  entries.forEach((entry, index) => {
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
  context.fillText(locale === "zh" ? "AI 状态洞察" : "AI status insights", 108, 858);
  context.font = "500 28px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  insights.slice(0, 4).forEach((insight, index) => {
    const y = 924 + index * 92;
    context.beginPath();
    context.arc(123, y - 8, 7, 0, Math.PI * 2);
    context.fillStyle = accent;
    context.fill();
    context.fillStyle = "#31566a";
    writeWrappedLine(context, insight, 151, y, 790, 36);
  });

  context.fillStyle = "#78919d";
  context.font = "500 24px system-ui, -apple-system, 'Microsoft YaHei', sans-serif";
  context.fillText(locale === "zh" ? "每一次真实记录，都让个人节律更清晰。" : "Every real check-in makes your rhythm clearer.", 108, 1326);
  context.fillStyle = accent;
  context.fillRect(108, 1352, 180, 8);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Failed to encode report card")), "image/png", 0.95);
  });
}

export async function shareReportImage(options: ReportCardOptions) {
  const blob = await createReportShareImage(options);
  const fileName = `NAVA-${options.module}-${options.entries[options.entries.length - 1].date}.png`;
  const file = new File([blob], fileName, { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: `NAVA · ${options.moduleLabel}`,
      text: options.locale === "zh" ? "我的近 7 日 NAVA 状态报告" : "My NAVA 7-day status report",
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
