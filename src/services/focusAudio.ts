export type FocusNoiseKind = "off" | "white" | "pink" | "brown";

type LegacyAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export type FocusNoiseSession = {
  kind: Exclude<FocusNoiseKind, "off">;
  setVolume: (volume: number) => void;
  stop: () => Promise<void>;
};

function audioContextConstructor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as LegacyAudioWindow).webkitAudioContext ?? null;
}

export function focusNoiseSupported() {
  return Boolean(audioContextConstructor());
}

function fillWhiteNoise(channel: Float32Array) {
  for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;
}

function fillPinkNoise(channel: Float32Array) {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let index = 0; index < channel.length; index += 1) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    channel[index] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
}

function fillBrownNoise(channel: Float32Array) {
  let last = 0;
  for (let index = 0; index < channel.length; index += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    channel[index] = last * 3.5;
  }
}

function createNoiseBuffer(context: AudioContext, kind: Exclude<FocusNoiseKind, "off">) {
  const frameCount = context.sampleRate * 4;
  const buffer = context.createBuffer(2, frameCount, context.sampleRate);
  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex);
    if (kind === "pink") fillPinkNoise(channel);
    else if (kind === "brown") fillBrownNoise(channel);
    else fillWhiteNoise(channel);
  }
  return buffer;
}

export async function startFocusNoise(
  kind: Exclude<FocusNoiseKind, "off">,
  volume = 0.16,
): Promise<FocusNoiseSession> {
  const AudioContextClass = audioContextConstructor();
  if (!AudioContextClass) throw new Error("audio_context_unsupported");

  const context = new AudioContextClass();
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = createNoiseBuffer(context, kind);
  source.loop = true;
  gain.gain.value = Math.min(0.45, Math.max(0, volume));
  source.connect(gain);
  gain.connect(context.destination);
  source.start();
  if (context.state === "suspended") await context.resume();

  let stopped = false;
  return {
    kind,
    setVolume(nextVolume) {
      const normalized = Math.min(0.45, Math.max(0, nextVolume));
      gain.gain.setTargetAtTime(normalized, context.currentTime, 0.025);
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      gain.gain.setTargetAtTime(0, context.currentTime, 0.025);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 90));
      try { source.stop(); } catch { /* The source may already be stopped. */ }
      source.disconnect();
      gain.disconnect();
      await context.close().catch(() => undefined);
    },
  };
}
