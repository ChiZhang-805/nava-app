export const wardrobeMascotMotions = [
  { id: "bubble", clip: "bubble_touch", label: { zh: "轻碰泡泡", en: "touch a bubble" }, durationMs: 2600 },
  { id: "starlight", clip: "star_catch", label: { zh: "接住星光", en: "catch starlight" }, durationMs: 2800 },
  { id: "blossom", clip: "flower_sniff", label: { zh: "闻一闻花香", en: "smell a blossom" }, durationMs: 3000 },
  { id: "snowfall", clip: "snowflake", label: { zh: "迎接小雪花", en: "greet a snowflake" }, durationMs: 2800 },
] as const;

export type WardrobeMascotMotion = typeof wardrobeMascotMotions[number]["id"];
export type WardrobeMascotPose = {
  x: number; y: number; degrees: number; scaleX: number; scaleY: number;
  effectOpacity: number; effectRise: number;
};
type KeyPose = { at: number; x: number; y: number; degrees: number; scaleX: number; scaleY: number };

const rest: KeyPose = { at: 0, x: 0, y: 0, degrees: 0, scaleX: 1, scaleY: 1 };
const finish: KeyPose = { ...rest, at: 1 };

// Each action starts and ends at the exact same transform as the still wardrobe art.
// The skin and every selected accessory remain in one persistent display layer.
const poses: Record<WardrobeMascotMotion, readonly KeyPose[]> = {
  bubble: [rest,
    { at: .18, x: -.3, y: .5, degrees: -.8, scaleX: 1.005, scaleY: .995 },
    { at: .40, x: -1.8, y: -1.1, degrees: -3.5, scaleX: 1.002, scaleY: 1.002 },
    { at: .61, x: -1.3, y: -1.5, degrees: -2.3, scaleX: .995, scaleY: 1.006 },
    { at: .79, x: .7, y: .2, degrees: 1.2, scaleX: 1.008, scaleY: .994 },
    finish],
  starlight: [rest,
    { at: .20, x: 0, y: 1.5, degrees: 0, scaleX: 1.036, scaleY: .962 },
    { at: .46, x: 0, y: -4.4, degrees: -1.2, scaleX: .977, scaleY: 1.039 },
    { at: .65, x: 0, y: -2.6, degrees: 1.3, scaleX: .988, scaleY: 1.017 },
    { at: .81, x: 0, y: .8, degrees: 0, scaleX: 1.019, scaleY: .978 },
    finish],
  blossom: [rest,
    { at: .25, x: 1.1, y: .6, degrees: 2.1, scaleX: 1.004, scaleY: .994 },
    { at: .48, x: 1.9, y: 1.6, degrees: 3.6, scaleX: 1.012, scaleY: .973 },
    { at: .68, x: 1.6, y: .6, degrees: 2.2, scaleX: 1.005, scaleY: .993 },
    { at: .84, x: -.5, y: -.2, degrees: -.8, scaleX: .997, scaleY: 1.005 },
    finish],
  snowfall: [rest,
    { at: .22, x: 0, y: .1, degrees: 0, scaleX: 1.025, scaleY: 1.017 },
    { at: .42, x: -1.1, y: -.5, degrees: -2.1, scaleX: .988, scaleY: .995 },
    { at: .57, x: 1.1, y: -.6, degrees: 2.1, scaleX: .99, scaleY: 1.005 },
    { at: .76, x: -.5, y: -.3, degrees: -.7, scaleX: 1.004, scaleY: 1.002 },
    finish],
};

const smooth = (value: number) => value * value * (3 - 2 * value);
const between = (left: number, right: number, amount: number) => left + (right - left) * amount;

export function sampleWardrobeMascotMotion(id: WardrobeMascotMotion, progress: number): WardrobeMascotPose {
  const at = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  if (at === 0 || at === 1) return { x: 0, y: 0, degrees: 0, scaleX: 1, scaleY: 1, effectOpacity: 0, effectRise: 0 };
  const sequence = poses[id];
  const index = sequence.findIndex((key) => key.at >= at);
  const right = sequence[Math.max(1, index)];
  const left = sequence[Math.max(0, index - 1)];
  const amount = smooth((at - left.at) / (right.at - left.at));
  const envelope = Math.sin(Math.PI * at) ** 2;
  return {
    x: between(left.x, right.x, amount),
    y: between(left.y, right.y, amount),
    degrees: between(left.degrees, right.degrees, amount),
    scaleX: between(left.scaleX, right.scaleX, amount),
    scaleY: between(left.scaleY, right.scaleY, amount),
    effectOpacity: envelope,
    effectRise: -at * 12,
  };
}

export function wardrobeMascotTransform(pose: WardrobeMascotPose): string {
  if (pose.x === 0 && pose.y === 0 && pose.degrees === 0 && pose.scaleX === 1 && pose.scaleY === 1) return "translate3d(0, 0, 0)";
  return `translate3d(${pose.x}%, ${pose.y}%, 0) rotate(${pose.degrees}deg) scale(${pose.scaleX}, ${pose.scaleY})`;
}
