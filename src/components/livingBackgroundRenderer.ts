import { getBackgroundMotionSnapshot, getBackgroundMotionStatus } from "../services/backgroundMotion";

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform vec4 u_field_tuning;
uniform vec4 u_light_tuning;
uniform vec4 u_finish_tuning;
uniform vec4 u_detail_tuning;
uniform vec4 u_motion;
uniform vec2 u_motion_offset;
varying vec2 v_uv;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  local = local * local * (3.0 - 2.0 * local);

  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));

  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float valueNoise3(vec3 p) {
  vec3 cell = floor(p);
  vec3 local = fract(p);
  local = local * local * (3.0 - 2.0 * local);

  float n000 = hash31(cell);
  float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));

  float lower = mix(mix(n000, n100, local.x), mix(n010, n110, local.x), local.y);
  float upper = mix(mix(n001, n101, local.x), mix(n011, n111, local.x), local.y);
  return mix(lower, upper, local.z);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.52;
  mat2 turn = mat2(0.82, -0.57, 0.57, 0.82);

  for (int octave = 0; octave < 3; octave++) {
    value += amplitude * valueNoise(p);
    p = turn * p * 2.03 + vec2(7.1, 3.7);
    amplitude *= 0.5;
  }

  return value * 1.0714;
}

float morphFbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.56;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);

  for (int octave = 0; octave < 3; octave++) {
    value += amplitude * valueNoise3(p);
    vec2 xy = turn * p.xy;
    vec2 yz = turn * p.yz;
    p = vec3(xy.x, yz.x, yz.y) * 2.01 + vec3(5.2, 9.1, 3.7);
    amplitude *= 0.49;
  }

  return value;
}

vec2 cellular(vec2 p, float time) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  float nearest = 8.0;
  float nextNearest = 8.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 identity = cell + neighbor;
      float identityHash = hash21(identity);
      vec2 phase = vec2(identityHash, fract(identityHash * 7.13 + 0.37));
      vec2 point = 0.5 + 0.31 * sin(phase * 6.2831853 + vec2(time * 0.71, -time * 0.59));
      vec2 delta = neighbor + point - local;
      float distanceSquared = dot(delta, delta);

      if (distanceSquared < nearest) {
        nextNearest = nearest;
        nearest = distanceSquared;
      } else if (distanceSquared < nextNearest) {
        nextNearest = distanceSquared;
      }
    }
  }

  return sqrt(vec2(nearest, nextNearest));
}

void main() {
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 p = (v_uv - 0.5) * vec2(aspect, 1.0) * 2.45;
  float motionStrength = clamp(u_motion.z, 0.0, 1.0);
  vec2 motionDirection = u_motion.xy;
  p += u_motion_offset * 0.42;
  vec2 seed = vec2(u_seed * 0.071, u_seed * 0.113);
  float time = u_time * 0.095 * u_light_tuning.x;

  // The base field stays spatially anchored while time bends it. This creates
  // organic metamorphosis instead of translating a frozen texture.
  float baseX = fbm(p * 0.86 + seed);
  float baseY = fbm(p * 0.79 + seed + vec2(6.8, 3.4));
  vec2 baseWarp = vec2(baseX, baseY) - 0.5;
  vec2 breath = vec2(
    sin(p.y * 1.35 + p.x * 0.28 + time * 1.13 + baseY * 3.2),
    cos(p.x * 1.08 - p.y * 0.44 - time * 0.87 + baseX * 3.0)
  );
  breath += vec2(
    sin((p.x + p.y) * 0.71 - time * 0.63),
    cos((p.x - p.y) * 0.66 + time * 0.72)
  ) * 0.52;
  float directionalPhase = dot(p, motionDirection + vec2(0.0001)) * 1.9 + time * 1.34;
  breath += motionDirection * sin(directionalPhase) * motionStrength * 0.34;

  vec2 wavePulse = vec2(
    sin(p.y * 2.05 + baseY * 4.1 + time * 1.34),
    cos(p.x * 1.72 - baseX * 3.8 - time * 1.08)
  );
  vec2 crossDirection = vec2(-motionDirection.y, motionDirection.x);
  wavePulse += motionDirection * cos(dot(p, crossDirection) * 1.65 - time * 1.12) * motionStrength * 0.28;
  vec2 warped = p + baseWarp * u_field_tuning.x + breath * 0.15 + wavePulse * 0.064;
  warped += motionDirection * motionStrength * 0.035;
  float broad = morphFbm(vec3(warped * 0.64 + seed * 0.31, time * 0.54 + u_seed * 0.013));
  float flow = morphFbm(vec3((warped + baseWarp * 0.36) * 1.52 + seed * 0.67, -time * 0.72 + 8.7));
  vec2 cells = cellular(warped * 1.24 + seed * 0.23, time * 0.64);
  float cellBoundary = 1.0 - smoothstep(0.025, 0.23, cells.y - cells.x);
  float foldedFlow = 1.0 - abs(flow * 2.0 - 1.0);

  vec2 lightCenter = vec2(-0.32 + 0.26 * sin(time * 0.74), -0.22 + 0.22 * cos(time * 0.57));
  vec2 secondCenter = vec2(0.34 + 0.22 * cos(time * 0.48), 0.28 + 0.2 * sin(time * 0.62));
  vec2 shadowCenter = vec2(-0.02 + 0.34 * cos(time * 0.39), 0.02 + 0.28 * sin(time * 0.53));
  lightCenter += motionDirection * motionStrength * 0.12;
  secondCenter -= motionDirection * motionStrength * 0.08;
  shadowCenter += motionDirection * motionStrength * 0.06;
  vec2 lightDelta = p - lightCenter;
  vec2 secondDelta = p - secondCenter;
  vec2 shadowDelta = p - shadowCenter;
  float primaryGlow = exp(-2.5 * dot(lightDelta, lightDelta));
  float secondaryGlow = exp(-3.1 * dot(secondDelta, secondDelta));
  float movingGlow = primaryGlow + secondaryGlow * u_detail_tuning.y;
  float movingShadow = exp(-2.8 * dot(shadowDelta, shadowDelta)) * u_detail_tuning.y;
  float surface = broad * 0.47 + flow * 0.53;
  surface += (foldedFlow - 0.5) * 0.16 + (cellBoundary - 0.24) * 0.045 * u_detail_tuning.x;
  float organicPatch = baseX * 0.54 + baseY * 0.46;
  float rawLight = surface + (organicPatch - 0.5) * 0.13;
  float travelingSheen = sin(warped.y * 2.75 + warped.x * 0.62 + time * 1.16 + baseX * 2.4);
  rawLight += travelingSheen * 0.026;
  rawLight += movingGlow * u_light_tuning.y - movingShadow * 0.032;
  float lightField = clamp((rawLight - 0.5) * u_light_tuning.z + 0.5 + u_light_tuning.w, 0.0, 1.0);

  vec3 deepBlue = vec3(0.14, 0.49, 0.78);
  vec3 mineralBlue = vec3(0.17, 0.62, 0.87);
  vec3 clearBlue = vec3(0.24, 0.71, 0.95);
  vec3 skyBlue = vec3(0.48, 0.84, 1.0);
  vec3 iceBlue = vec3(0.74, 0.93, 1.0);
  vec3 mistWhite = vec3(0.92, 0.985, 1.0);

  vec3 color = mix(mineralBlue, clearBlue, smoothstep(0.04, 0.42, lightField));
  color = mix(color, skyBlue, smoothstep(0.32, 0.67, lightField));
  color = mix(color, iceBlue, smoothstep(0.58, 0.86, lightField));
  color = mix(color, mistWhite, smoothstep(0.78, 1.0, lightField));
  float deepPool = pow(clamp(1.0 - lightField, 0.0, 1.0), 5.0);
  color = mix(color, deepBlue, deepPool * 0.32);
  color = mix(color, iceBlue * vec3(0.97, 1.0, 1.015), primaryGlow * 0.12);
  color = mix(color, mistWhite, secondaryGlow * 0.095 * u_detail_tuning.y);
  color = mix(color, mineralBlue, movingShadow * 0.045 * u_detail_tuning.y);

  float ribbonPhaseA = warped.x * 2.25 + broad * 5.1 + sin(warped.y * 1.16 + time * 0.68) * 0.86;
  float ribbonPhaseB = warped.y * 1.72 - baseX * 4.3 + cos(warped.x * 0.94 - time * 0.57) * 0.74;
  float ribbonA = sin(ribbonPhaseA);
  float ribbonB = sin(ribbonPhaseB);
  float ribbonSheen = pow(max(ribbonA, 0.0), 5.0) * 0.66 + pow(max(ribbonB, 0.0), 6.0) * 0.34;
  float ribbonShade = pow(max(-ribbonA, 0.0), 6.0) * 0.7 + pow(max(-ribbonB, 0.0), 7.0) * 0.3;
  color += ribbonSheen * vec3(0.026, 0.036, 0.043) * u_finish_tuning.x;
  color -= ribbonShade * vec3(0.015, 0.021, 0.027) * u_finish_tuning.x;

  vec2 ringPoint = (warped - vec2(0.34, 0.08)) * vec2(0.82, 1.18);
  float ringDistance = length(ringPoint);
  float ringAngle = atan(ringPoint.y, ringPoint.x);
  float contourBase = ringDistance * 1.08 + surface * 0.5 + broad * 0.28;
  contourBase += sin(ringAngle * 2.0 + flow * 2.7 - time * 0.34) * 0.075;
  float contourPhase = contourBase * u_field_tuning.y + baseX * 1.45;
  float contourWave = sin(contourPhase);
  float ridgeLight = pow(1.0 - abs(contourWave), 13.0);
  float ridgeShadow = pow(1.0 - abs(sin(contourPhase + 0.34)), 15.0);
  color += vec3(0.13, 0.17, 0.185) * ridgeLight * 0.46 * u_field_tuning.z;
  color -= vec3(0.046, 0.058, 0.065) * ridgeShadow * 0.42 * u_field_tuning.z;

  float leafPhase = warped.y * 5.4 + warped.x * 2.1 + broad * 6.2 - flow * 3.4;
  leafPhase += sin(warped.x * 1.5 + time * 0.31) * 0.9;
  float leafVein = pow(1.0 - abs(sin(leafPhase)), 17.0);
  float leafMask = smoothstep(0.22, 0.72, baseY) * smoothstep(0.88, 0.34, baseX);
  color += leafVein * leafMask * vec3(0.032, 0.043, 0.048) * u_detail_tuning.z;

  // Curved textile strands follow the low-frequency field rather than the
  // screen axes, giving the surface a soft woven, frost-etched character.
  float fiberAngle = (baseX - baseY) * 3.5 + broad * 1.15;
  vec2 fiberAxis = vec2(cos(fiberAngle), sin(fiberAngle));
  vec2 crossAxis = vec2(-fiberAxis.y, fiberAxis.x);
  float fiberPhase = dot(warped, fiberAxis) * 74.0 + flow * 12.0 + baseY * 5.0;
  float crossPhase = dot(warped, crossAxis) * 47.0 - broad * 9.0 + baseX * 4.0;
  float fiberPresence = mix(0.42, 1.0, smoothstep(0.28, 0.74, baseY));
  float fiber = (sin(fiberPhase) * 0.68 + sin(crossPhase) * 0.32) * fiberPresence;
  float thread = pow(1.0 - abs(sin(fiberPhase * 0.51)), 8.0);
  color += fiber * vec3(0.018, 0.024, 0.028) * u_finish_tuning.x;
  color += thread * vec3(0.026, 0.032, 0.035) * u_detail_tuning.z;

  float mineral = valueNoise((warped + baseWarp * 0.42) * 5.2 + seed * 1.7);
  float mineralVein = pow(1.0 - abs(mineral * 2.0 - 1.0), 6.0);
  color += (mineralVein - 0.22) * vec3(0.055, 0.07, 0.078) * u_detail_tuning.x;

  vec3 normalHint = normalize(vec3((baseX - baseY) * 1.6, (broad - flow) * 1.45, 1.0));
  float relief = dot(normalHint, normalize(vec3(-0.32, 0.42, 0.86))) * 0.5 + 0.5;
  color *= mix(0.9, 1.085, relief);
  color += cellBoundary * vec3(0.014, 0.019, 0.022) * u_detail_tuning.x;

  vec2 pixel = gl_FragCoord.xy;
  float coarseFrost = valueNoise(pixel * 0.065 + seed * 17.0);
  float middleFrost = valueNoise(pixel * 0.19 + seed * 31.0);
  float fineFrost = hash21(floor(pixel) + seed * 91.0);
  color += (coarseFrost - 0.5) * vec3(0.034, 0.04, 0.046) * u_field_tuning.w;
  color += (middleFrost - 0.5) * vec3(0.035, 0.042, 0.048) * u_field_tuning.w;
  color += (fineFrost - 0.5) * vec3(0.027, 0.034, 0.04) * u_field_tuning.w;
  color += smoothstep(0.91, 0.997, fineFrost) * vec3(0.055, 0.067, 0.075) * u_detail_tuning.w;

  float organicDepth = smoothstep(0.34, 0.82, 1.0 - organicPatch) * u_finish_tuning.y;
  color = mix(color, mineralBlue, organicDepth);
  vec2 edge = (v_uv - 0.5) * vec2(1.35, 1.0);
  float vignette = 1.0 - smoothstep(0.48, 0.92, length(edge));
  color *= mix(1.0 - u_finish_tuning.z, 1.0, vignette);

  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luminance), color, u_finish_tuning.w);

  float finishedLuminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float shadowLift = max(0.0, 0.47 - finishedLuminance);
  color += shadowLift * vec3(0.72, 0.99, 1.08);

  color = pow(clamp(color, 0.0, 1.0), vec3(0.93));
  gl_FragColor = vec4(color, 1.0);
}
`;

interface ShaderResources {
  buffer: WebGLBuffer;
  detailTuning: WebGLUniformLocation;
  program: WebGLProgram;
  position: number;
  fieldTuning: WebGLUniformLocation;
  finishTuning: WebGLUniformLocation;
  lightTuning: WebGLUniformLocation;
  motion: WebGLUniformLocation;
  motionOffset: WebGLUniformLocation;
  resolution: WebGLUniformLocation;
  seed: WebGLUniformLocation;
  time: WebGLUniformLocation;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create WebGL shader");

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createResources(gl: WebGLRenderingContext): ShaderResources {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create WebGL program");

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Unknown WebGL link error";
    gl.deleteProgram(program);
    throw new Error(message);
  }

  const buffer = gl.createBuffer();
  const resolution = gl.getUniformLocation(program, "u_resolution");
  const seed = gl.getUniformLocation(program, "u_seed");
  const time = gl.getUniformLocation(program, "u_time");
  const fieldTuning = gl.getUniformLocation(program, "u_field_tuning");
  const lightTuning = gl.getUniformLocation(program, "u_light_tuning");
  const finishTuning = gl.getUniformLocation(program, "u_finish_tuning");
  const detailTuning = gl.getUniformLocation(program, "u_detail_tuning");
  const motion = gl.getUniformLocation(program, "u_motion");
  const motionOffset = gl.getUniformLocation(program, "u_motion_offset");
  const position = gl.getAttribLocation(program, "a_position");
  if (!buffer || !resolution || !seed || !time || !fieldTuning || !lightTuning || !finishTuning || !detailTuning || !motion || !motionOffset || position < 0) {
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    throw new Error("Unable to resolve WebGL shader bindings");
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  return { buffer, detailTuning, fieldTuning, finishTuning, lightTuning, motion, motionOffset, position, program, resolution, seed, time };
}

type TuningVector = readonly [number, number, number, number];

interface DesignTuning {
  detail: TuningVector;
  field: TuningVector;
  finish: TuningVector;
  light: TuningVector;
}

const PRODUCTION_SEED = 8.1;

const PRODUCTION_TUNING: DesignTuning = {
  detail: [0.82, 0.52, 0.82, 0.58],
  field: [1.5, 11.2, 0.25, 1.42],
  finish: [1.08, 0.025, 0.018, 0.98],
  light: [1.34, 0.18, 1.42, -0.205],
};

function readDesignState() {
  const params = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
  const requestedSeed = Number.parseFloat(params?.get("bgSeed") ?? "");
  const requestedTime = Number.parseFloat(params?.get("bgTime") ?? "");
  const requestedMotionX = Number.parseFloat(params?.get("bgMotionX") ?? "");
  const requestedMotionY = Number.parseFloat(params?.get("bgMotionY") ?? "");
  const requestedMotionStrength = Number.parseFloat(params?.get("bgMotionStrength") ?? "");
  const hasExplicitMotion = Number.isFinite(requestedMotionX) && Number.isFinite(requestedMotionY) && Number.isFinite(requestedMotionStrength);
  const requestedMotionMagnitude = Math.hypot(requestedMotionX, requestedMotionY);

  return {
    hasExplicitTime: Number.isFinite(requestedTime),
    initialTime: Number.isFinite(requestedTime) ? Math.max(0, requestedTime) : 0,
    motion: hasExplicitMotion
      ? {
          intensity: Math.min(1, Math.max(0, requestedMotionStrength)),
          updatedAt: 0,
          x: requestedMotionMagnitude > 0 ? requestedMotionX / requestedMotionMagnitude : 0,
          y: requestedMotionMagnitude > 0 ? requestedMotionY / requestedMotionMagnitude : 0,
        }
      : null,
    seed: Number.isFinite(requestedSeed) ? requestedSeed : PRODUCTION_SEED,
    tuning: PRODUCTION_TUNING,
  };
}

export function mountLivingBackground(canvas: HTMLCanvasElement) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    failIfMajorPerformanceCaveat: false,
    powerPreference: "high-performance",
    premultipliedAlpha: false,
    preserveDrawingBuffer: reducedMotion,
    stencil: false,
  });

  if (!gl) return () => undefined;

  let resources: ShaderResources;
  try {
    resources = createResources(gl);
  } catch {
    return () => undefined;
  }

  const frameInterval = 1000 / 40;
  const design = readDesignState();
  let animationFrame = 0;
  let destroyed = false;
  let elapsedBeforePause = design.initialTime + (reducedMotion && !design.hasExplicitTime ? 11.5 : 0);
  let lastFrame = 0;
  let lastSimulationFrame = 0;
  let lastTelemetry = 0;
  let motionDirectionX = 0;
  let motionDirectionY = 0;
  let motionFieldOffsetX = 0;
  let motionFieldOffsetY = 0;
  let motionIntensity = 0;
  let motionTimeBonus = 0;
  let renderedFrames = 0;
  let runStarted = performance.now();

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const density = Math.min(window.devicePixelRatio || 1, 1.25);
    const quality = rect.width <= 600 ? 0.75 : 0.7;
    const width = Math.max(2, Math.round(rect.width * density * quality));
    const height = Math.max(2, Math.round(rect.height * density * quality));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  };

  resize();
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
  resizeObserver?.observe(canvas);
  if (!resizeObserver) window.addEventListener("resize", resize);

  const draw = (now: number) => {
    if (destroyed) return;
    animationFrame = window.requestAnimationFrame(draw);
    if (!reducedMotion && now - lastFrame < frameInterval) return;
    lastFrame = now;

    const frameSeconds = lastSimulationFrame > 0 ? Math.min(0.1, (now - lastSimulationFrame) / 1000) : 0;
    lastSimulationFrame = now;
    const motionTarget = reducedMotion
      ? { intensity: 0, updatedAt: 0, x: 0, y: 0 }
      : (design.motion ?? getBackgroundMotionSnapshot(now));
    const responseRate = motionTarget.intensity > motionIntensity ? 7.2 : 3.6;
    const motionBlend = frameSeconds > 0 ? 1 - Math.exp(-frameSeconds * responseRate) : 0;
    motionDirectionX += (motionTarget.x - motionDirectionX) * motionBlend;
    motionDirectionY += (motionTarget.y - motionDirectionY) * motionBlend;
    motionIntensity += (motionTarget.intensity - motionIntensity) * motionBlend;
    const smoothedMagnitude = Math.hypot(motionDirectionX, motionDirectionY);
    if (smoothedMagnitude > 1) {
      motionDirectionX /= smoothedMagnitude;
      motionDirectionY /= smoothedMagnitude;
    }
    motionTimeBonus += frameSeconds * motionIntensity * 0.5;
    const fieldRetention = Math.exp(-frameSeconds * 0.08);
    motionFieldOffsetX = motionFieldOffsetX * fieldRetention + motionDirectionX * motionIntensity * frameSeconds * 0.34;
    motionFieldOffsetY = motionFieldOffsetY * fieldRetention + motionDirectionY * motionIntensity * frameSeconds * 0.34;

    const baseElapsed = reducedMotion ? elapsedBeforePause : elapsedBeforePause + (now - runStarted) / 1000;
    const elapsed = baseElapsed + motionTimeBonus;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(resources.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.buffer);
    gl.enableVertexAttribArray(resources.position);
    gl.vertexAttribPointer(resources.position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(resources.resolution, canvas.width, canvas.height);
    gl.uniform1f(resources.seed, design.seed);
    gl.uniform1f(resources.time, elapsed);
    gl.uniform4f(resources.detailTuning, ...design.tuning.detail);
    gl.uniform4f(resources.fieldTuning, ...design.tuning.field);
    gl.uniform4f(resources.lightTuning, ...design.tuning.light);
    gl.uniform4f(resources.finishTuning, ...design.tuning.finish);
    gl.uniform4f(resources.motion, motionDirectionX, motionDirectionY, motionIntensity, motionIntensity * 0.5);
    gl.uniform2f(resources.motionOffset, motionFieldOffsetX, motionFieldOffsetY);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    canvas.dataset.ready = "true";
    renderedFrames += 1;
    if (import.meta.env.DEV && now - lastTelemetry >= 500) {
      canvas.dataset.renderCount = String(renderedFrames);
      canvas.dataset.motionIntensity = motionIntensity.toFixed(3);
      canvas.dataset.motionStatus = getBackgroundMotionStatus();
      canvas.dataset.motionX = motionDirectionX.toFixed(3);
      canvas.dataset.motionY = motionDirectionY.toFixed(3);
      lastTelemetry = now;
    }

    if (reducedMotion) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
  };

  const pause = () => {
    if (!animationFrame || reducedMotion) return;
    elapsedBeforePause += (performance.now() - runStarted) / 1000;
    lastSimulationFrame = 0;
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  };

  const resume = () => {
    if (animationFrame || destroyed || reducedMotion) return;
    runStarted = performance.now();
    lastSimulationFrame = 0;
    animationFrame = window.requestAnimationFrame(draw);
  };

  const onVisibilityChange = () => {
    if (document.hidden) pause();
    else resume();
  };

  const onContextLost = (event: Event) => {
    event.preventDefault();
    pause();
    canvas.removeAttribute("data-ready");
  };

  const onContextRestored = () => {
    try {
      resources = createResources(gl);
      resume();
    } catch {
      canvas.removeAttribute("data-ready");
    }
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  animationFrame = window.requestAnimationFrame(draw);

  return () => {
    destroyed = true;
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    resizeObserver?.disconnect();
    if (!resizeObserver) window.removeEventListener("resize", resize);
    canvas.removeAttribute("data-ready");
    canvas.removeAttribute("data-render-count");
    canvas.removeAttribute("data-motion-intensity");
    canvas.removeAttribute("data-motion-status");
    canvas.removeAttribute("data-motion-x");
    canvas.removeAttribute("data-motion-y");
    gl.deleteBuffer(resources.buffer);
    gl.deleteProgram(resources.program);
  };
}
