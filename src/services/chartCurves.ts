export type ChartCurvePoint = { x: number; y: number };

export type ChartCurveMode = "bump" | "monotone";

export type CubicCurveSegment = {
  start: ChartCurvePoint;
  control1: ChartCurvePoint;
  control2: ChartCurvePoint;
  end: ChartCurvePoint;
};

function bumpCurvePath(points: ChartCurvePoint[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function sign(value: number) {
  return value < 0 ? -1 : value > 0 ? 1 : 0;
}

function endpointSlope(
  currentWidth: number,
  nextWidth: number,
  currentSlope: number,
  nextSlope: number,
) {
  let slope = ((2 * currentWidth + nextWidth) * currentSlope - currentWidth * nextSlope)
    / (currentWidth + nextWidth);
  if (sign(slope) !== sign(currentSlope)) return 0;
  if (sign(currentSlope) !== sign(nextSlope) && Math.abs(slope) > Math.abs(3 * currentSlope)) {
    slope = 3 * currentSlope;
  }
  return slope;
}

function monotoneTangents(points: ChartCurvePoint[]) {
  const widths = points.slice(1).map((point, index) => point.x - points[index].x);
  if (widths.some((width) => width <= 0)) {
    throw new Error("Chart curve x coordinates must be strictly increasing.");
  }
  const slopes = widths.map((width, index) => (points[index + 1].y - points[index].y) / width);
  if (points.length === 2) return [slopes[0], slopes[0]];

  const tangents = new Array<number>(points.length);
  tangents[0] = endpointSlope(widths[0], widths[1], slopes[0], slopes[1]);
  tangents[points.length - 1] = endpointSlope(
    widths[widths.length - 1],
    widths[widths.length - 2],
    slopes[slopes.length - 1],
    slopes[slopes.length - 2],
  );

  for (let index = 1; index < points.length - 1; index += 1) {
    const previousSlope = slopes[index - 1];
    const nextSlope = slopes[index];
    if (previousSlope === 0 || nextSlope === 0 || sign(previousSlope) !== sign(nextSlope)) {
      tangents[index] = 0;
      continue;
    }
    const previousWidth = widths[index - 1];
    const nextWidth = widths[index];
    const previousWeight = 2 * nextWidth + previousWidth;
    const nextWeight = nextWidth + 2 * previousWidth;
    tangents[index] = (previousWeight + nextWeight)
      / (previousWeight / previousSlope + nextWeight / nextSlope);
  }

  return tangents;
}

export function monotoneCurveSegments(points: ChartCurvePoint[]): CubicCurveSegment[] {
  if (points.length < 2) return [];
  const tangents = monotoneTangents(points);
  return points.slice(1).map((end, index) => {
    const start = points[index];
    const width = end.x - start.x;
    return {
      start,
      control1: {
        x: start.x + width / 3,
        y: start.y + (tangents[index] * width) / 3,
      },
      control2: {
        x: end.x - width / 3,
        y: end.y - (tangents[index + 1] * width) / 3,
      },
      end,
    };
  });
}

function monotoneCurvePath(points: ChartCurvePoint[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return monotoneCurveSegments(points).reduce(
    (path, segment) => `${path} C ${segment.control1.x} ${segment.control1.y}, ${segment.control2.x} ${segment.control2.y}, ${segment.end.x} ${segment.end.y}`,
    `M ${points[0].x} ${points[0].y}`,
  );
}

export function chartCurvePath(points: ChartCurvePoint[], mode: ChartCurveMode) {
  return mode === "monotone" ? monotoneCurvePath(points) : bumpCurvePath(points);
}
