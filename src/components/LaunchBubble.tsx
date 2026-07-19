import { useEffect, useRef } from "react";
import {
  Euler,
  Matrix3,
  Matrix4,
  Mesh,
  NormalBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  BUBBLE_ENERGY_THRESHOLD,
  BUBBLE_PHASE_DURATION_MS,
  bubbleSplitAmount,
  gestureEnergy,
  nextBubblePhase,
  type BubblePhase,
} from "../services/launchBubbleModel";
import { getBackgroundMotionSnapshot, requestBackgroundMotionPermission } from "../services/backgroundMotion";

const VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uSplit;
uniform float uEnergy;
uniform float uTouchStrength;
uniform vec2 uTouch;
uniform vec3 uMotion;
uniform mat3 uRotation;
varying vec2 vUv;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
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
  float nx00 = mix(n000, n100, local.x);
  float nx10 = mix(n010, n110, local.x);
  float nx01 = mix(n001, n101, local.x);
  float nx11 = mix(n011, n111, local.x);
  return mix(mix(nx00, nx10, local.y), mix(nx01, nx11, local.y), local.z);
}

float fbm3(vec3 p) {
  float value = 0.0;
  float amplitude = 0.55;
  mat3 warp = mat3(
    0.00, 0.80, 0.60,
    -0.80, 0.36, -0.48,
    -0.60, -0.48, 0.64
  );
  for (int octave = 0; octave < 2; octave++) {
    value += noise3(p) * amplitude;
    p = warp * p * 2.03 + vec3(7.1, 3.7, 5.9);
    amplitude *= 0.48;
  }
  return value;
}

float sdEllipsoid(vec3 p, vec3 radius) {
  float k0 = length(p / radius);
  float k1 = length(p / (radius * radius));
  return k0 * (k0 - 1.0) / max(k1, 0.0001);
}

float smoothUnion(float a, float b, float radius) {
  float h = clamp(0.5 + 0.5 * (b - a) / radius, 0.0, 1.0);
  return mix(b, a, h) - radius * h * (1.0 - h);
}

float bubbleField(vec3 worldPoint) {
  vec3 p = uRotation * worldPoint;
  float splitCurve = smoothstep(0.0, 1.0, uSplit);
  float shapeScale = mix(1.0, 0.82, splitCurve);
  p /= shapeScale;
  float separation = mix(0.13, 0.70, splitCurve);
  float independentMotion = smoothstep(0.28, 0.86, splitCurve);

  vec3 leftCenter = vec3(
    -separation,
    0.045 + sin(uTime * 1.17) * 0.035 * independentMotion,
    sin(uTime * 0.83) * 0.055 * independentMotion
  );
  vec3 rightCenter = vec3(
    separation,
    -0.035 + cos(uTime * 1.03) * 0.04 * independentMotion,
    cos(uTime * 0.71) * 0.05 * independentMotion
  );
  vec3 leftRadius = mix(vec3(0.88, 0.94, 0.79), vec3(0.66, 0.72, 0.62), splitCurve);
  vec3 rightRadius = mix(vec3(0.82, 0.87, 0.76), vec3(0.59, 0.65, 0.56), splitCurve);

  vec3 leftPoint = p - leftCenter;
  vec3 rightPoint = p - rightCenter;
  float leftNoise = fbm3(leftPoint * 1.48 + vec3(uTime * 0.08, -uTime * 0.055, uTime * 0.04));
  float rightNoise = fbm3(rightPoint * 1.61 + vec3(-uTime * 0.062, uTime * 0.074, -uTime * 0.048));
  float leftBreath = sin(uTime * 0.74 + leftPoint.y * 2.7 + leftPoint.z * 1.8) * 0.034;
  float rightBreath = sin(uTime * 0.69 + 1.4 + rightPoint.x * 2.4 - rightPoint.z * 2.0) * 0.032;
  float energyRippleLeft = sin(length(leftPoint) * 11.0 - uTime * 2.2) * uEnergy * 0.018;
  float energyRippleRight = sin(length(rightPoint) * 10.0 - uTime * 2.0 + 1.7) * uEnergy * 0.016;

  float left = sdEllipsoid(leftPoint, leftRadius) - (leftNoise - 0.47) * 0.17 - leftBreath - energyRippleLeft;
  float right = sdEllipsoid(rightPoint, rightRadius) - (rightNoise - 0.47) * 0.16 - rightBreath - energyRippleRight;
  float unionRadius = mix(0.47, 0.035, smoothstep(0.23, 0.9, splitCurve));
  float field = smoothUnion(left, right, unionRadius) * shapeScale;

  vec2 touchPoint = vec2(uTouch.x * 1.06, uTouch.y * 1.18);
  float touchDistance = length(worldPoint.xy - touchPoint);
  float touchWave = sin(touchDistance * 16.0 - uTime * 4.2) * exp(-touchDistance * 4.0);
  field -= touchWave * uTouchStrength * 0.075;
  return field;
}

vec3 surfaceNormal(vec3 p) {
  const float epsilon = 0.0065;
  const vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * bubbleField(p + k.xyy * epsilon) +
    k.yyx * bubbleField(p + k.yyx * epsilon) +
    k.yxy * bubbleField(p + k.yxy * epsilon) +
    k.xxx * bubbleField(p + k.xxx * epsilon)
  );
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  uv.x *= aspect;

  vec3 rayOrigin = vec3(0.0, 0.0, 3.2);
  vec3 rayDirection = normalize(vec3(uv * 0.82, -2.35));
  float travel = 0.0;
  bool hit = false;
  vec3 hitPoint = vec3(0.0);

  for (int stepIndex = 0; stepIndex < 44; stepIndex++) {
    vec3 point = rayOrigin + rayDirection * travel;
    float distanceToSurface = bubbleField(point);
    if (distanceToSurface < 0.0042) {
      hit = true;
      hitPoint = point;
      break;
    }
    travel += max(distanceToSurface * 0.74, 0.0045);
    if (travel > 6.2) break;
  }

  if (!hit) {
    float softHalo = exp(-max(length(uv * vec2(0.86, 1.04)) - 0.78, 0.0) * 15.0);
    float haloAlpha = softHalo * (1.0 - smoothstep(0.0, 0.18, abs(length(uv) - 0.84))) * 0.028;
    gl_FragColor = vec4(vec3(0.37, 0.83, 0.98), haloAlpha);
    return;
  }

  vec3 normal = surfaceNormal(hitPoint);
  vec3 viewDirection = normalize(-rayDirection);
  vec3 lightDirection = normalize(vec3(-0.52 + uMotion.x * 0.25, 0.68 - uMotion.y * 0.2, 0.74));
  vec3 halfVector = normalize(lightDirection + viewDirection);
  float diffuse = max(dot(normal, lightDirection), 0.0);
  float backLight = max(dot(normal, -lightDirection), 0.0);
  float fresnel = pow(clamp(1.0 - dot(normal, viewDirection), 0.0, 1.0), 2.25);
  float specular = pow(max(dot(normal, halfVector), 0.0), 52.0);
  float broadSpecular = pow(max(dot(normal, halfVector), 0.0), 9.0);
  float internalFlow = fbm3(hitPoint * 3.15 + vec3(uTime * 0.1, -uTime * 0.075, uTime * 0.055));
  float caustic = pow(max(0.0, sin(internalFlow * 9.0 + hitPoint.y * 5.0 - uTime * 0.55)), 7.0);
  float depthTint = clamp(0.5 + hitPoint.z * 0.34, 0.0, 1.0);

  vec3 waterBlue = vec3(0.12, 0.58, 0.86);
  vec3 skyBlue = vec3(0.35, 0.82, 0.98);
  vec3 iceBlue = vec3(0.84, 0.97, 1.0);
  vec3 color = mix(waterBlue, skyBlue, 0.42 + internalFlow * 0.34);
  color *= 0.42 + diffuse * 0.48 + depthTint * 0.16;
  color += iceBlue * (fresnel * 0.68 + specular * 0.88 + broadSpecular * 0.07);
  color += vec3(0.08, 0.28, 0.42) * backLight * 0.22;
  color += iceBlue * caustic * 0.22;
  color = mix(color, iceBlue, uTouchStrength * caustic * 0.16);

  float alpha = 0.31 + fresnel * 0.49 + specular * 0.24 + broadSpecular * 0.08;
  alpha += (internalFlow - 0.5) * 0.06;
  alpha = clamp(alpha, 0.26, 0.92);
  gl_FragColor = vec4(color, alpha);
}
`;

interface DragState {
  active: boolean;
  distance: number;
  lastTime: number;
  lastX: number;
  lastY: number;
  peakVelocity: number;
  pointerId: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export default function LaunchBubble() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        alpha: true,
        antialias: false,
        canvas,
        powerPreference: "high-performance",
        premultipliedAlpha: true,
        preserveDrawingBuffer: import.meta.env.DEV,
      });
    } catch {
      canvas.dataset.unsupported = "true";
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;

    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const resolution = new Vector2(1, 1);
    const rotationMatrix = new Matrix3();
    const rotation4 = new Matrix4();
    const euler = new Euler(0, 0, 0, "YXZ");
    const uniforms = {
      uEnergy: { value: 0 },
      uMotion: { value: new Vector3() },
      uResolution: { value: resolution },
      uRotation: { value: rotationMatrix },
      uSplit: { value: 0 },
      uTime: { value: 0 },
      uTouch: { value: new Vector2() },
      uTouchStrength: { value: 0 },
    };
    const geometry = new PlaneGeometry(2, 2);
    const material = new ShaderMaterial({
      blending: NormalBlending,
      depthTest: false,
      depthWrite: false,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      uniforms,
      vertexShader: VERTEX_SHADER,
    });
    const mesh = new Mesh(geometry, material);
    scene.add(mesh);

    let animationFrame = 0;
    let destroyed = false;
    let energy = 0;
    let frameCount = 0;
    let lastFrameAt = 0;
    let lastRenderedAt = 0;
    let lastTelemetryAt = 0;
    let phase: BubblePhase = "idle";
    let phaseStartedAt = 0;
    let pitch = -0.08;
    let roll = 0.04;
    let touchStrength = 0;
    let velocityPitch = 0;
    let velocityRoll = 0;
    let velocityYaw = 0;
    let yaw = 0.16;
    const drag: DragState = {
      active: false,
      distance: 0,
      lastTime: 0,
      lastX: 0,
      lastY: 0,
      peakVelocity: 0,
      pointerId: -1,
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const quality = rect.width <= 600 ? 0.74 : 0.64;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25) * quality);
      renderer.setSize(Math.max(2, rect.width), Math.max(2, rect.height), false);
      renderer.getDrawingBufferSize(resolution);
      canvas.dataset.bufferWidth = String(Math.round(resolution.x));
      canvas.dataset.bufferHeight = String(Math.round(resolution.y));
    };

    const setTouchFromEvent = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
      const y = -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1);
      uniforms.uTouch.value.set(clamp(x, -1, 1), clamp(y, -1, 1));
    };

    const triggerSplit = (now: number) => {
      if (phase !== "idle" || energy < BUBBLE_ENERGY_THRESHOLD) return;
      phase = "splitting";
      phaseStartedAt = now;
      energy = BUBBLE_ENERGY_THRESHOLD;
    };

    const finishDrag = (event: PointerEvent) => {
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      drag.active = false;
      canvas.releasePointerCapture?.(event.pointerId);
      energy = Math.min(BUBBLE_ENERGY_THRESHOLD + 0.5, energy + gestureEnergy(drag.distance, drag.peakVelocity));
      touchStrength = Math.max(touchStrength, 0.72);
      triggerSplit(performance.now());
    };

    const onPointerDown = (event: PointerEvent) => {
      if (drag.active) return;
      event.preventDefault();
      void requestBackgroundMotionPermission();
      canvas.setPointerCapture?.(event.pointerId);
      drag.active = true;
      drag.distance = 0;
      drag.lastTime = event.timeStamp;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.peakVelocity = 0;
      drag.pointerId = event.pointerId;
      setTouchFromEvent(event);
      touchStrength = 1;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      const deltaX = event.clientX - drag.lastX;
      const deltaY = event.clientY - drag.lastY;
      const deltaMs = Math.max(8, event.timeStamp - drag.lastTime);
      const distance = Math.hypot(deltaX, deltaY);
      const speed = (distance / deltaMs) * 1000;
      drag.distance += distance;
      drag.peakVelocity = Math.max(drag.peakVelocity, speed);
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.lastTime = event.timeStamp;
      velocityYaw = clamp((deltaX / deltaMs) * 7.2, -5.8, 5.8);
      velocityPitch = clamp((deltaY / deltaMs) * 5.8, -4.4, 4.4);
      velocityRoll = clamp((deltaX - deltaY) / deltaMs, -1.7, 1.7);
      yaw += deltaX * 0.0085;
      pitch = clamp(pitch + deltaY * 0.0068, -1.05, 1.05);
      roll += (deltaX - deltaY) * 0.0014;
      setTouchFromEvent(event);
      touchStrength = 1;
    };

    const onPointerCancel = (event: PointerEvent) => finishDrag(event);
    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", finishDrag);
    canvas.addEventListener("pointercancel", onPointerCancel);

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const render = (now: number) => {
      if (destroyed) return;
      animationFrame = window.requestAnimationFrame(render);
      if (!reducedMotion && now - lastRenderedAt < 1000 / 34) return;

      const deltaSeconds = lastFrameAt > 0 ? Math.min(0.08, (now - lastFrameAt) / 1000) : 0;
      lastFrameAt = now;
      lastRenderedAt = now;
      const motion = reducedMotion ? { x: 0, y: 0, intensity: 0 } : getBackgroundMotionSnapshot(now);

      if (!drag.active) {
        yaw += velocityYaw * deltaSeconds;
        pitch = clamp(pitch + velocityPitch * deltaSeconds, -1.05, 1.05);
        roll += velocityRoll * deltaSeconds;
        const inertia = Math.exp(-deltaSeconds * 2.15);
        velocityYaw *= inertia;
        velocityPitch *= inertia;
        velocityRoll *= inertia;
        touchStrength *= Math.exp(-deltaSeconds * 2.65);
      }

      yaw += motion.x * motion.intensity * deltaSeconds * 0.42;
      pitch = clamp(pitch - motion.y * motion.intensity * deltaSeconds * 0.34, -1.05, 1.05);
      velocityYaw += motion.x * motion.intensity * deltaSeconds * 0.16;
      velocityPitch -= motion.y * motion.intensity * deltaSeconds * 0.13;

      if (phase === "idle") {
        energy *= Math.exp(-deltaSeconds * 0.105);
      } else {
        const elapsed = now - phaseStartedAt;
        const duration = BUBBLE_PHASE_DURATION_MS[phase];
        if (elapsed >= duration) {
          phase = nextBubblePhase(phase);
          phaseStartedAt = now;
          if (phase === "idle") energy = 0.38;
        }
      }

      const phaseElapsed = phase === "idle" ? 0 : now - phaseStartedAt;
      const split = bubbleSplitAmount(phase, phaseElapsed);
      const idleDrift = reducedMotion ? 0 : now / 1000;
      euler.set(pitch + Math.sin(idleDrift * 0.23) * 0.035, yaw + Math.sin(idleDrift * 0.17) * 0.05, roll, "YXZ");
      rotation4.makeRotationFromEuler(euler);
      rotationMatrix.setFromMatrix4(rotation4);
      uniforms.uTime.value = reducedMotion ? 2.4 : now / 1000;
      uniforms.uSplit.value = split;
      uniforms.uEnergy.value = clamp(energy / BUBBLE_ENERGY_THRESHOLD, 0, 1.25);
      uniforms.uTouchStrength.value = touchStrength;
      uniforms.uMotion.value.set(motion.x, motion.y, motion.intensity);
      renderer.render(scene, camera);

      frameCount += 1;
      canvas.dataset.ready = "true";
      if (import.meta.env.DEV && now - lastTelemetryAt >= 180) {
        canvas.dataset.energy = energy.toFixed(3);
        canvas.dataset.phase = phase;
        canvas.dataset.pitch = pitch.toFixed(3);
        canvas.dataset.renderCount = String(frameCount);
        canvas.dataset.split = split.toFixed(3);
        canvas.dataset.touch = touchStrength.toFixed(3);
        canvas.dataset.yaw = yaw.toFixed(3);
        lastTelemetryAt = now;
      }

      if (reducedMotion) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
    };

    animationFrame = window.requestAnimationFrame(render);

    return () => {
      destroyed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", finishDrag);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="launch-bubble" aria-hidden="true">
      <canvas className="launch-bubble__canvas" ref={canvasRef} />
    </div>
  );
}
