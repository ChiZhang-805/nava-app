import assert from "node:assert/strict";
import test from "node:test";
import { chartCurvePath, monotoneCurveSegments, type ChartCurvePoint } from "../src/services/chartCurves.ts";

function cubicValue(start: number, control1: number, control2: number, end: number, t: number) {
  const inverse = 1 - t;
  return inverse ** 3 * start
    + 3 * inverse ** 2 * t * control1
    + 3 * inverse * t ** 2 * control2
    + t ** 3 * end;
}

test("monotone curve passes through every supplied point", () => {
  const points: ChartCurvePoint[] = [
    { x: 0, y: 72 },
    { x: 1, y: 30 },
    { x: 2, y: 22 },
    { x: 3, y: 36 },
    { x: 4, y: 48 },
    { x: 5, y: 33 },
    { x: 6, y: 42 },
  ];
  const segments = monotoneCurveSegments(points);

  assert.equal(segments.length, points.length - 1);
  assert.deepEqual(segments[0].start, points[0]);
  segments.forEach((segment, index) => assert.deepEqual(segment.end, points[index + 1]));
});

test("monotone curve creates no extra extrema between adjacent observations", () => {
  const points: ChartCurvePoint[] = [
    { x: 0, y: 72 },
    { x: 1, y: 30 },
    { x: 2, y: 22 },
    { x: 3, y: 36 },
    { x: 4, y: 48 },
    { x: 5, y: 33 },
    { x: 6, y: 42 },
  ];

  monotoneCurveSegments(points).forEach((segment) => {
    const lower = Math.min(segment.start.y, segment.end.y) - 1e-9;
    const upper = Math.max(segment.start.y, segment.end.y) + 1e-9;
    for (let sample = 0; sample <= 100; sample += 1) {
      const value = cubicValue(
        segment.start.y,
        segment.control1.y,
        segment.control2.y,
        segment.end.y,
        sample / 100,
      );
      assert.ok(value >= lower && value <= upper);
    }
  });
});

test("face curve mode differs from the existing bump curve", () => {
  const points = [
    { x: 0, y: 70 },
    { x: 1, y: 35 },
    { x: 2, y: 20 },
  ];
  assert.notEqual(chartCurvePath(points, "monotone"), chartCurvePath(points, "bump"));
});
