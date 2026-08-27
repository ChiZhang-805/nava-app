/**
 * NAVA-FDNB Health research adapter.
 *
 * This is an independently implemented longitudinal-health adaptation of the
 * FDNB window-scoring mechanism. It does not run the single-cell h5ad pipeline,
 * does not treat health features as genes, and must not be described as a
 * clinical or diagnostic model.
 */

export type FdnbModule = "sleep" | "activity" | "recovery" | "mood" | "nutrition" | "focus" | "face";

export type FdnbFeatureValue = {
  value: number;
  reliability: number;
  module: FdnbModule;
  source?: string;
};

export type FdnbHealthObservation = {
  date: string;
  features: Record<string, FdnbFeatureValue>;
};

export type FdnbHealthConfig = {
  minimumObservedDays: number;
  minimumFeatures: number;
  minimumModules: number;
  minimumFeatureCoverage: number;
  windowSizes: number[];
  nullPermutations: number;
  bootstrapIterations: number;
  randomSeed: number;
};

export type FdnbEvidenceLevel = "supported" | "candidate" | "no_support";

export type FdnbContributor = {
  feature: string;
  module: FdnbModule;
  strength: number;
  direction: "up" | "down" | "mixed";
  reliability: number;
};

export type FdnbHealthResult = {
  status: "ready" | "insufficient_data";
  schemaVersion: string;
  modelVersion: string;
  disclaimer: string;
  availableDays: number;
  requiredDays: number;
  featureCount: number;
  moduleCount: number;
  analysisStart?: string;
  analysisEnd?: string;
  score?: number;
  stabilityScore?: number;
  transitionScore?: number;
  peakScore?: number;
  confidence?: number;
  dataQuality?: number;
  accepted?: boolean;
  evidenceLevel?: FdnbEvidenceLevel;
  summary?: string;
  recommendations: string[];
  peak?: {
    centerDate: string;
    centerPosition: number;
    windowDays: number;
    atEndpoint: boolean;
  };
  contributors: FdnbContributor[];
  diagnostics?: {
    transitionStatistic: number;
    nullZScore: number;
    empiricalPValue: number;
    nullPermutations: number;
    multiscaleAgreement: number;
    bootstrapStability: number;
    bootstrapPeakInterval: [number, number];
    peakProminence: number;
    bslConsensus: number;
    selectedFeatures: string[];
    selectedModules: FdnbModule[];
    windowCount: number;
    guardrails: string[];
  };
  reason?: string;
};

type PreparedSeries = {
  dates: string[];
  keys: string[];
  modules: FdnbModule[];
  values: number[][];
  reliability: number[][];
  availableDays: number;
  dataQuality: number;
};

type WindowEvidence = {
  centerIndex: number;
  centerPosition: number;
  centerDate: string;
  windowDays: number;
  start: number;
  stop: number;
  dnb: number;
  sdCorr: number;
  lambda: number;
  quality: number;
  moduleIndices: number[];
  loadings: number[];
  transitionRaw: number;
  transitionNorm: number;
  prominence: number;
  bslLocalConsensus: number;
  peakRaw: number;
  peakNorm: number;
};

const EPS = 1e-9;
export const fdnbHealthSchemaVersion = "nava.fdnb.health.v1";
export const fdnbHealthModelVersion = "nava-fdnb-health-research-v0.1-2026-08";
export const fdnbHealthDisclaimer = "研究性健康状态转变提示，不构成医疗诊断、疾病预测或因果结论。";

export const defaultFdnbHealthConfig: FdnbHealthConfig = {
  minimumObservedDays: 14,
  minimumFeatures: 4,
  minimumModules: 3,
  minimumFeatureCoverage: 0.35,
  windowSizes: [7, 14, 21],
  nullPermutations: 48,
  bootstrapIterations: 24,
  randomSeed: 20260827,
};

export function calculateFdnbHealth(
  observations: FdnbHealthObservation[],
  config: FdnbHealthConfig = defaultFdnbHealthConfig,
): FdnbHealthResult {
  const prepared = prepareSeries(observations, config);
  const moduleCount = new Set(prepared.modules).size;
  const base = {
    schemaVersion: fdnbHealthSchemaVersion,
    modelVersion: fdnbHealthModelVersion,
    disclaimer: fdnbHealthDisclaimer,
    availableDays: prepared.availableDays,
    requiredDays: config.minimumObservedDays,
    featureCount: prepared.keys.length,
    moduleCount,
    recommendations: [] as string[],
    contributors: [] as FdnbContributor[],
  };

  if (prepared.availableDays < config.minimumObservedDays) {
    return {
      ...base,
      status: "insufficient_data",
      reason: `至少需要 ${config.minimumObservedDays} 个有记录的日期，当前为 ${prepared.availableDays} 天。`,
    };
  }
  if (prepared.keys.length < config.minimumFeatures) {
    return {
      ...base,
      status: "insufficient_data",
      reason: `至少需要 ${config.minimumFeatures} 个覆盖稳定的健康特征，当前为 ${prepared.keys.length} 个。`,
    };
  }
  if (moduleCount < config.minimumModules) {
    return {
      ...base,
      status: "insufficient_data",
      reason: `至少需要 ${config.minimumModules} 个健康模块参与，当前为 ${moduleCount} 个。`,
    };
  }

  const windowSizes = config.windowSizes
    .map((value) => Math.max(5, Math.round(value)))
    .filter((value, index, all) => value <= prepared.dates.length - 2 && all.indexOf(value) === index)
    .sort((a, b) => a - b);
  if (windowSizes.length === 0) {
    return {
      ...base,
      status: "insufficient_data",
      reason: "当前连续时间范围不足以形成两个以上分析窗口。",
    };
  }

  const windows = scoreWindows(prepared, windowSizes);
  if (windows.length < 3) {
    return {
      ...base,
      status: "insufficient_data",
      reason: "有效窗口不足，暂时不能定位状态转变峰。",
    };
  }

  calibrateWindows(windows);
  const peak = windows.reduce((best, row) => row.peakNorm > best.peakNorm ? row : best, windows[0]);
  const scalePeaks = windowSizes
    .map((size) => windows.filter((row) => row.windowDays === size))
    .filter((rows) => rows.length > 0)
    .map((rows) => rows.reduce((best, row) => row.peakNorm > best.peakNorm ? row : best, rows[0]));
  const multiscaleAgreement = scaleAgreement(scalePeaks.map((row) => row.centerPosition));
  const bslConsensus = globalBslConsensus(windows);
  const atEndpoint = peak.centerPosition < 0.1 || peak.centerPosition > 0.9;
  const transitionStatistic = curveStatistic(windows.map((row) => row.transitionRaw));

  const nullStatistics = computeNullStatistics(prepared, windowSizes, config);
  const nullMean = mean(nullStatistics);
  const nullSd = standardDeviation(nullStatistics);
  const nullZScore = nullSd < EPS
    ? (transitionStatistic > nullMean + EPS ? 4 : 0)
    : (transitionStatistic - nullMean) / nullSd;
  const exceedances = nullStatistics.filter((value) => value >= transitionStatistic).length;
  const empiricalPValue = (exceedances + 1) / (nullStatistics.length + 1);

  const bootstrapCenters = computeBootstrapCenters(prepared, windowSizes, config);
  const bootstrapStability = bootstrapCenters.length
    ? bootstrapCenters.filter((value) => Math.abs(value - peak.centerPosition) <= 0.15).length / bootstrapCenters.length
    : 0;
  const bootstrapPeakInterval: [number, number] = bootstrapCenters.length
    ? [percentile(bootstrapCenters, 0.025), percentile(bootstrapCenters, 0.975)]
    : [peak.centerPosition, peak.centerPosition];

  const guardrails: string[] = [];
  if (prepared.dataQuality < 0.55) guardrails.push("low_data_quality");
  if (multiscaleAgreement < 0.55) guardrails.push("multiscale_disagreement");
  if (bootstrapStability < 0.6) guardrails.push("bootstrap_unstable");
  if (peak.prominence < 0.15) guardrails.push("flat_curve");
  if (atEndpoint) guardrails.push("endpoint_peak");
  if (nullZScore < 1.5 || empiricalPValue > 0.1) guardrails.push("null_not_supported");

  const accepted = prepared.dataQuality >= 0.55
    && multiscaleAgreement >= 0.55
    && bootstrapStability >= 0.6
    && peak.prominence >= 0.15
    && !atEndpoint
    && nullZScore >= 1.5
    && empiricalPValue <= 0.1;
  const evidenceLevel: FdnbEvidenceLevel = accepted
    ? "supported"
    : (peak.prominence >= 0.08 && prepared.dataQuality >= 0.4 ? "candidate" : "no_support");

  const nullSupport = clamp((nullZScore - 0.5) / 2.5, 0, 1) * clamp((0.25 - empiricalPValue) / 0.2, 0, 1);
  const confidence = clamp(
    0.15 + 0.3 * prepared.dataQuality + 0.2 * multiscaleAgreement +
      0.2 * bootstrapStability + 0.15 * nullSupport,
    0,
    0.98,
  );
  const transitionScore = clamp(
    peak.peakNorm * 100 * (0.35 + 0.35 * prepared.dataQuality + 0.3 * nullSupport),
    0,
    100,
  );
  const stabilityScore = clamp(100 - transitionScore * confidence, 0, 100);
  const contributors = buildContributors(prepared, peak);
  const summary = buildSummary(evidenceLevel, peak.centerDate, contributors);
  const recommendations = buildRecommendations(evidenceLevel, contributors);

  return {
    ...base,
    status: "ready",
    analysisStart: prepared.dates[0],
    analysisEnd: prepared.dates.at(-1),
    score: round(stabilityScore, 1),
    stabilityScore: round(stabilityScore, 1),
    transitionScore: round(transitionScore, 1),
    peakScore: round(peak.peakNorm * 100, 1),
    confidence: round(confidence, 3),
    dataQuality: round(prepared.dataQuality, 3),
    accepted,
    evidenceLevel,
    summary,
    recommendations,
    peak: {
      centerDate: peak.centerDate,
      centerPosition: round(peak.centerPosition, 4),
      windowDays: peak.windowDays,
      atEndpoint,
    },
    contributors,
    diagnostics: {
      transitionStatistic: round(transitionStatistic, 4),
      nullZScore: round(nullZScore, 4),
      empiricalPValue: round(empiricalPValue, 4),
      nullPermutations: nullStatistics.length,
      multiscaleAgreement: round(multiscaleAgreement, 4),
      bootstrapStability: round(bootstrapStability, 4),
      bootstrapPeakInterval: bootstrapPeakInterval.map((value) => round(value, 4)) as [number, number],
      peakProminence: round(peak.prominence, 4),
      bslConsensus: round(bslConsensus, 4),
      selectedFeatures: prepared.keys,
      selectedModules: [...new Set(prepared.modules)],
      windowCount: windows.length,
      guardrails,
    },
  };
}

function prepareSeries(observations: FdnbHealthObservation[], config: FdnbHealthConfig): PreparedSeries {
  const deduped = new Map<string, FdnbHealthObservation>();
  observations.forEach((row) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(row.date)) deduped.set(row.date, row);
  });
  const rows = [...deduped.values()].sort((a, b) => a.date.localeCompare(b.date));
  const dates = rows.map((row) => row.date);
  const availableDays = rows.filter((row) => Object.values(row.features).some(validFeature)).length;
  const allKeys = [...new Set(rows.flatMap((row) => Object.keys(row.features)))].sort();
  const minimumCoverageCount = Math.max(4, Math.ceil(rows.length * config.minimumFeatureCoverage));
  const keys = allKeys.filter((key) => rows.filter((row) => validFeature(row.features[key])).length >= minimumCoverageCount);
  const modules = keys.map((key) => rows.find((row) => validFeature(row.features[key]))?.features[key].module ?? "activity");
  const valuesByFeature = keys.map((key) => rows.map((row) => validFeature(row.features[key]) ? row.features[key].value : Number.NaN));
  const standardized = valuesByFeature.map((values) => robustStandardize(values));
  const values = rows.map((_, rowIndex) => keys.map((__, featureIndex) => standardized[featureIndex][rowIndex]));
  const reliability = rows.map((row) => keys.map((key) => validFeature(row.features[key])
    ? clamp(row.features[key].reliability, 0, 1)
    : 0));
  const coverage = rows.length && keys.length
    ? reliability.flat().filter((value) => value > 0).length / (rows.length * keys.length)
    : 0;
  const reliabilityMean = mean(reliability.flat().filter((value) => value > 0));

  return {
    dates,
    keys,
    modules,
    values,
    reliability,
    availableDays,
    dataQuality: clamp(0.55 * coverage + 0.45 * reliabilityMean, 0, 1),
  };
}

function validFeature(value: FdnbFeatureValue | undefined): value is FdnbFeatureValue {
  return Boolean(value && Number.isFinite(value.value) && Number.isFinite(value.reliability) && value.reliability > 0);
}

function robustStandardize(values: number[]) {
  const finite = values.filter(Number.isFinite);
  const center = median(finite);
  const mad = median(finite.map((value) => Math.abs(value - center)));
  const fallback = standardDeviation(finite);
  const scale = Math.max(1.4826 * mad, fallback * 0.35, EPS);
  return values.map((value) => Number.isFinite(value) ? clamp((value - center) / scale, -5, 5) : 0);
}

function scoreWindows(prepared: PreparedSeries, windowSizes: number[]): WindowEvidence[] {
  const rows: WindowEvidence[] = [];
  for (const windowDays of windowSizes) {
    for (let start = 0; start + windowDays <= prepared.values.length; start += 1) {
      const stop = start + windowDays;
      const windowValues = prepared.values.slice(start, stop);
      const windowReliability = prepared.reliability.slice(start, stop);
      const evidence = scoreWindow(windowValues, windowReliability);
      const centerIndex = Math.min(prepared.dates.length - 1, start + Math.floor((windowDays - 1) / 2));
      rows.push({
        centerIndex,
        centerPosition: prepared.dates.length <= 1 ? 0.5 : centerIndex / (prepared.dates.length - 1),
        centerDate: prepared.dates[centerIndex],
        windowDays,
        start,
        stop,
        ...evidence,
        transitionRaw: 0,
        transitionNorm: 0,
        prominence: 0,
        bslLocalConsensus: 0,
        peakRaw: 0,
        peakNorm: 0,
      });
    }
  }
  return rows;
}

function scoreWindow(values: number[][], reliability: number[][]) {
  const featureCount = values[0]?.length ?? 0;
  const covariance = matrix(featureCount, featureCount, 0);
  const correlation = matrix(featureCount, featureCount, 0);
  const sd = Array(featureCount).fill(0);
  const featureReliability = Array(featureCount).fill(0);

  for (let feature = 0; feature < featureCount; feature += 1) {
    const xs = values.map((row) => row[feature]);
    const ws = reliability.map((row) => row[feature]);
    const stats = weightedStats(xs, ws);
    sd[feature] = stats.sd;
    featureReliability[feature] = stats.reliability;
  }

  for (let left = 0; left < featureCount; left += 1) {
    for (let right = left; right < featureCount; right += 1) {
      const pair = weightedPair(
        values.map((row) => row[left]),
        values.map((row) => row[right]),
        reliability.map((row) => Math.min(row[left], row[right])),
      );
      const shrunkCovariance = left === right ? pair.covariance : pair.covariance * 0.85;
      const shrunkCorrelation = left === right ? 1 : pair.correlation * 0.85;
      covariance[left][right] = covariance[right][left] = shrunkCovariance;
      correlation[left][right] = correlation[right][left] = shrunkCorrelation;
    }
  }

  const dominant = dominantEigenpair(covariance);
  const meanCorrelation = correlation.map((row, index) => mean(row.filter((_, other) => other !== index).map(Math.abs)));
  const evidence = sd.map((value, index) =>
    Math.cbrt((Math.abs(dominant.vector[index]) + EPS) * (value + EPS) * (meanCorrelation[index] + EPS)) * featureReliability[index]);
  const moduleSize = Math.max(2, Math.min(6, Math.floor(featureCount / 2), featureCount - 2));
  const moduleIndices = evidence
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value)
    .slice(0, moduleSize)
    .map((item) => item.index);
  const outside = Array.from({ length: featureCount }, (_, index) => index).filter((index) => !moduleIndices.includes(index));
  const sdIn = mean(moduleIndices.map((index) => sd[index]));
  const corrInPairs: number[] = [];
  moduleIndices.forEach((left, index) => moduleIndices.slice(index + 1).forEach((right) => corrInPairs.push(Math.abs(correlation[left][right]))));
  const corrOutPairs = moduleIndices.flatMap((left) => outside.map((right) => Math.abs(correlation[left][right])));
  const corrIn = mean(corrInPairs);
  const corrOut = mean(corrOutPairs);
  const dnb = sdIn * corrIn / (corrOut + 0.08);
  const quality = mean(featureReliability);
  return {
    dnb: Math.max(0, dnb),
    sdCorr: Math.max(0, sdIn * corrIn),
    lambda: Math.max(0, dominant.value),
    quality,
    moduleIndices,
    loadings: dominant.vector,
  };
}

function calibrateWindows(windows: WindowEvidence[]) {
  const b = normalize(windows.map((row) => Math.log1p(row.dnb)));
  const s = normalize(windows.map((row) => Math.log1p(row.sdCorr)));
  const l = normalize(windows.map((row) => Math.log1p(row.lambda)));
  const anchor = normalize(windows.map((row, index) => (0.5 * b[index] + 0.3 * s[index] + 0.2 * l[index]) * (0.45 + 0.55 * row.quality)));
  windows.forEach((row, index) => {
    row.transitionRaw = anchor[index];
    row.transitionNorm = anchor[index];
    row.bslLocalConsensus = Math.cbrt(Math.max(b[index], EPS) * Math.max(s[index], EPS) * Math.max(l[index], EPS));
  });

  const byScale = new Map<number, WindowEvidence[]>();
  windows.forEach((row) => byScale.set(row.windowDays, [...(byScale.get(row.windowDays) ?? []), row]));
  byScale.forEach((rows) => {
    const curve = rows.map((row) => row.transitionNorm);
    const broad = curve.map((_, index) => mean(curve.slice(Math.max(0, index - 3), Math.min(curve.length, index + 4))));
    const prominenceRaw = curve.map((value, index) => Math.max(0, value - broad[index]));
    const prominence = Math.max(...prominenceRaw, 0) < EPS
      ? prominenceRaw.map(() => 0)
      : normalize(prominenceRaw);
    const rawPeak = rows.reduce((best, row) => row.transitionNorm > best.transitionNorm ? row : best, rows[0]);
    const endpoint = rawPeak.centerPosition < 0.15 || rawPeak.centerPosition > 0.85;
    rows.forEach((row, index) => {
      row.prominence = prominence[index];
      const blend = endpoint
        ? 0.3 * row.transitionNorm + 0.7 * row.prominence
        : 0.65 * row.transitionNorm + 0.35 * row.prominence;
      row.peakRaw = blend * (0.35 + 0.65 * row.bslLocalConsensus) * (0.4 + 0.6 * row.quality);
    });
  });
  const peakNorm = normalize(windows.map((row) => row.peakRaw));
  windows.forEach((row, index) => row.peakNorm = peakNorm[index]);
}

function computeNullStatistics(prepared: PreparedSeries, windowSizes: number[], config: FdnbHealthConfig) {
  const rng = seededRandom(config.randomSeed + prepared.dates.length * 17 + prepared.keys.length * 31);
  const output: number[] = [];
  for (let iteration = 0; iteration < config.nullPermutations; iteration += 1) {
    const values = prepared.values.map((row) => [...row]);
    const reliability = prepared.reliability.map((row) => [...row]);
    for (let feature = 0; feature < prepared.keys.length; feature += 1) {
      const shift = 1 + Math.floor(rng() * Math.max(1, prepared.values.length - 1));
      for (let row = 0; row < prepared.values.length; row += 1) {
        const source = (row + shift) % prepared.values.length;
        values[row][feature] = prepared.values[source][feature];
        reliability[row][feature] = prepared.reliability[source][feature];
      }
    }
    const windows = scoreWindows({ ...prepared, values, reliability }, windowSizes);
    calibrateWindows(windows);
    output.push(curveStatistic(windows.map((row) => row.transitionRaw)));
  }
  return output;
}

function computeBootstrapCenters(prepared: PreparedSeries, windowSizes: number[], config: FdnbHealthConfig) {
  const rng = seededRandom(config.randomSeed + 991);
  const centers: number[] = [];
  const n = prepared.values.length;
  const block = Math.min(7, Math.max(3, Math.floor(n / 4)));
  for (let iteration = 0; iteration < config.bootstrapIterations; iteration += 1) {
    const indices: number[] = [];
    while (indices.length < n) {
      const start = Math.floor(rng() * n);
      for (let offset = 0; offset < block && indices.length < n; offset += 1) indices.push((start + offset) % n);
    }
    const values = indices.map((index) => prepared.values[index]);
    const reliability = indices.map((index) => prepared.reliability[index]);
    const dates = prepared.dates.map((date) => date);
    const windows = scoreWindows({ ...prepared, dates, values, reliability }, windowSizes.filter((size) => size <= n - 2));
    if (!windows.length) continue;
    calibrateWindows(windows);
    const peak = windows.reduce((best, row) => row.peakNorm > best.peakNorm ? row : best, windows[0]);
    centers.push(peak.centerPosition);
  }
  return centers;
}

function buildContributors(prepared: PreparedSeries, peak: WindowEvidence): FdnbContributor[] {
  return peak.moduleIndices
    .map((featureIndex) => {
      const values = prepared.values.slice(peak.start, peak.stop).map((row) => row[featureIndex]);
      const reliability = prepared.reliability.slice(peak.start, peak.stop).map((row) => row[featureIndex]);
      const midpoint = Math.max(1, Math.floor(values.length / 2));
      const delta = mean(values.slice(midpoint)) - mean(values.slice(0, midpoint));
      return {
        feature: prepared.keys[featureIndex],
        module: prepared.modules[featureIndex],
        strength: Math.abs(peak.loadings[featureIndex]) * mean(reliability),
        direction: Math.abs(delta) < 0.15 ? "mixed" as const : delta > 0 ? "up" as const : "down" as const,
        reliability: mean(reliability),
      };
    })
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5)
    .map((item) => ({ ...item, strength: round(item.strength, 3), reliability: round(item.reliability, 3) }));
}

function buildSummary(level: FdnbEvidenceLevel, peakDate: string, contributors: FdnbContributor[]) {
  const modules = [...new Set(contributors.map((item) => moduleLabel(item.module)))].slice(0, 3).join("、");
  if (level === "supported") return `在 ${peakDate} 附近观察到有统计支持的多指标同步转变信号，主要涉及${modules || "多个健康模块"}。这是一项研究性状态提示，不代表医学诊断。`;
  if (level === "candidate") return `在 ${peakDate} 附近出现候选状态波动，涉及${modules || "多个健康模块"}，但稳定性或对照检验尚未全部通过。`;
  return "当前曲线没有形成足够稳定、显著且可重复的状态转变证据。继续规律记录比解读单个峰值更重要。";
}

function buildRecommendations(level: FdnbEvidenceLevel, contributors: FdnbContributor[]) {
  if (level === "no_support") return ["保持至少三个模块的连续记录，以便建立更可靠的个人基线。"];
  const modules = [...new Set(contributors.map((item) => item.module))];
  const recommendations = modules.slice(0, 2).map((module) => moduleRecommendation(module));
  recommendations.push("若状态持续恶化或出现明显不适，请优先寻求专业医疗帮助，不要仅依据本评分做决定。");
  return recommendations.slice(0, 3);
}

function moduleLabel(module: FdnbModule) {
  return ({ sleep: "睡眠", activity: "活动", recovery: "恢复", mood: "情绪", nutrition: "饮食", focus: "专注", face: "面部状态" })[module];
}

function moduleRecommendation(module: FdnbModule) {
  return ({
    sleep: "先稳定连续几天的入睡时间和睡眠机会，观察趋势是否回落。",
    activity: "避免突然加量或完全停滞，优先安排可持续的轻中度活动。",
    recovery: "关注静息心率、HRV 与主观疲劳是否同时变化，并给恢复留出时间。",
    mood: "记录情绪变化发生的具体情境；若低落持续，请及时联系可信任的人或专业支持。",
    nutrition: "保持进餐时间和水分摄入相对稳定，避免用单日热量解释整体状态。",
    focus: "把任务拆成一个可完成的短专注块，并记录中断原因。",
    face: "面部派生指标只作状态记录；光线、妆容和拍摄角度都可能造成变化。",
  })[module];
}

function globalBslConsensus(windows: WindowEvidence[]) {
  const peakPosition = (selector: (row: WindowEvidence) => number) =>
    windows.reduce((best, row) => selector(row) > selector(best) ? row : best, windows[0]).centerPosition;
  const positions = [peakPosition((row) => row.dnb), peakPosition((row) => row.sdCorr), peakPosition((row) => row.lambda)];
  return Math.exp(-(Math.max(...positions) - Math.min(...positions)) / 0.15);
}

function scaleAgreement(positions: number[]) {
  if (positions.length < 2) return 0.5;
  return Math.exp(-(Math.max(...positions) - Math.min(...positions)) / 0.18);
}

function curveStatistic(values: number[]) {
  if (!values.length) return 0;
  const center = median(values);
  const mad = median(values.map((value) => Math.abs(value - center)));
  const scale = Math.max(1.4826 * mad, standardDeviation(values), EPS);
  return (Math.max(...values) - center) / scale;
}

function dominantEigenpair(covariance: number[][]) {
  const size = covariance.length;
  if (!size) return { value: 0, vector: [] as number[] };
  let vector = Array.from({ length: size }, (_, index) => 1 + index / Math.max(1, size - 1));
  vector = normalizeVector(vector);
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const next = covariance.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
    const normalized = normalizeVector(next);
    const drift = Math.sqrt(normalized.reduce((sum, value, index) => sum + (value - vector[index]) ** 2, 0));
    vector = normalized;
    if (drift < 1e-7) break;
  }
  const multiplied = covariance.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
  const value = vector.reduce((sum, item, index) => sum + item * multiplied[index], 0);
  return { value: Math.max(0, value), vector };
}

function weightedStats(values: number[], weights: number[]) {
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  if (weightSum < EPS) return { mean: 0, sd: 0, reliability: 0 };
  const center = values.reduce((sum, value, index) => sum + value * weights[index], 0) / weightSum;
  const variance = values.reduce((sum, value, index) => sum + weights[index] * (value - center) ** 2, 0) / weightSum;
  return { mean: center, sd: Math.sqrt(Math.max(0, variance)), reliability: weightSum / Math.max(1, weights.length) };
}

function weightedPair(left: number[], right: number[], weights: number[]) {
  const leftStats = weightedStats(left, weights);
  const rightStats = weightedStats(right, weights);
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  if (weightSum < EPS) return { covariance: 0, correlation: 0 };
  const covariance = left.reduce((sum, value, index) =>
    sum + weights[index] * (value - leftStats.mean) * (right[index] - rightStats.mean), 0) / weightSum;
  const correlation = covariance / (leftStats.sd * rightStats.sd + EPS);
  return { covariance, correlation: clamp(correlation, -1, 1) };
}

function normalize(values: number[]) {
  if (!values.length) return [];
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return values.map(() => 0);
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  if (high - low < EPS) return values.map(() => 0.5);
  return values.map((value) => Number.isFinite(value) ? clamp((value - low) / (high - low), 0, 1) : 0);
}

function normalizeVector(values: number[]) {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0));
  if (norm < EPS) return values.map((_, index) => index === 0 ? 1 : 0);
  return values.map((value) => value / norm);
}

function matrix(rows: number, columns: number, value: number) {
  return Array.from({ length: rows }, () => Array(columns).fill(value));
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const position = clamp(fraction, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - position) + sorted[upper] * (position - lower);
}

function median(values: number[]) {
  if (!values.length) return 0;
  return percentile(values, 0.5);
}

function mean(values: number[]) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function standardDeviation(values: number[]) {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return 0;
  const center = mean(finite);
  return Math.sqrt(finite.reduce((sum, value) => sum + (value - center) ** 2, 0) / finite.length);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
