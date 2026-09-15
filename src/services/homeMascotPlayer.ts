import { mascotFrameBlob, parseMascotWebp, type MascotClip, type MascotFrame } from "./mascotWebp";

type Action = { id: string; clips: Array<{ src: string }> };
type State = { action: string; phase: "idle" | "loading" | "playing" | "static"; queued: boolean };
type Decoded = { image: CanvasImageSource; close: () => void };
type Track = { clip: MascotClip; src: string; index: number; previous?: MascotFrame; scale: number; x: number; y: number; aligned: boolean; minimumAlpha?: number };

let bitmapDecoderTimedOut = false;
async function decode(frame: MascotFrame): Promise<Decoded> {
  const blob = mascotFrameBlob(frame);
  if (typeof createImageBitmap === "function" && !bitmapDecoderTimedOut) {
    try {
      const image = await new Promise<ImageBitmap>((resolve, reject) => {
        let expired = false;
        const timer = setTimeout(() => { expired = true; bitmapDecoderTimedOut = true; reject(new Error("Mascot decoder deadline")); }, 4000);
        createImageBitmap(blob).then((bitmap) => {
          clearTimeout(timer);
          if (expired) bitmap.close(); else resolve(bitmap);
        }, (error) => { clearTimeout(timer); reject(error); });
      });
      return { image, close: () => image.close() };
    } catch { /* Older WebKit can decode WebP via HTMLImageElement instead. */ }
  }
  const url = URL.createObjectURL(blob), image = new Image();
  let timer = 0;
  try {
    image.src = url;
    await Promise.race([image.decode(), new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error("Mascot image deadline")), 4000);
    })]);
    return { image, close: () => { image.src = ""; URL.revokeObjectURL(url); } };
  } catch (error) { image.src = ""; URL.revokeObjectURL(url); throw error; }
  finally { clearTimeout(timer); }
}

/** One persistent display, one compositor, one pending decoded frame. Never cache RGBA clips. */
export class HomeMascotPlayer {
  private canvas: HTMLCanvasElement;
  private display: CanvasRenderingContext2D;
  private stage = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private probe = document.createElement("canvas");
  private probeCtx: CanvasRenderingContext2D;
  private cache = new Map<string, MascotClip>();
  private requests = new Map<string, { controller: AbortController; promise: Promise<MascotClip> }>();
  private track: Track | null = null;
  private action: Action | null = null;
  private queued: Action | null = null;
  private segment = 0;
  private switchTo: { clip: MascotClip; src: string } | null = null;
  private generation = 0;
  private stopped = false;
  private reduced = false;
  private visible = true;
  private raf = 0;
  private due = 0;
  private remaining = 0;
  private decoding = false;
  private busy = false;
  private ready = false;
  private idle: string;
  private onState: (state: State) => void;
  private phase: State["phase"] = "loading";
  private media = matchMedia("(prefers-reduced-motion: reduce)");
  private observer: IntersectionObserver;

  constructor(canvas: HTMLCanvasElement, idle: string, onState: (state: State) => void) {
    this.canvas = canvas; this.idle = idle; this.onState = onState;
    this.display = canvas.getContext("2d")!;
    this.ctx = this.stage.getContext("2d")!;
    this.probe.width = 80; this.probe.height = 60;
    this.probeCtx = this.probe.getContext("2d", { willReadFrequently: true })!;
    this.observer = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; this.updatePause(); });
    this.observer.observe(canvas);
    document.addEventListener("visibilitychange", this.updatePause);
    this.media.addEventListener("change", this.motionChanged);
    this.motionChanged();
  }

  private emit() { this.onState({ action: this.action?.id ?? "idle", phase: this.phase, queued: !!this.queued }); }
  private get paused() { return this.reduced || !this.visible || document.hidden || this.stopped; }
  private motionChanged = () => {
    this.reduced = this.media.matches;
    if (this.reduced) {
      this.generation++; this.queued = null; this.action = null; this.busy = false;
      this.switchTo = null; this.track = null; this.phase = "static";
      this.requests.forEach(({ controller }) => controller.abort()); this.requests.clear(); this.cache.clear();
      this.canvas.dataset.ready = "false"; this.ready = false;
      this.emit();
    } else { void this.prepare(this.idle); }
    this.updatePause();
  };
  private updatePause = () => {
    if (this.paused) {
      if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; this.remaining = Math.max(0, this.due - performance.now()); }
      this.canvas.dataset.paused = "true";
    } else {
      this.canvas.dataset.paused = "false";
      this.due = performance.now() + this.remaining; this.remaining = 0;
      this.schedule();
    }
  };
  private async load(src: string): Promise<MascotClip> {
    if (this.stopped || this.reduced) throw new Error("Mascot playback suspended");
    const cached = this.cache.get(src);
    if (cached) { this.cache.delete(src); this.cache.set(src, cached); return cached; }
    const existing = this.requests.get(src);
    if (existing) return existing.promise;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    const promise = (async () => {
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) throw new Error("Mascot clip unavailable");
        const clip = parseMascotWebp(await response.arrayBuffer());
        if (!this.stopped && !this.reduced && !controller.signal.aborted) {
          this.cache.set(src, clip);
          while (this.cache.size > 3) this.cache.delete(this.cache.keys().next().value!);
        }
        return clip;
      } finally { clearTimeout(timeout); if (this.requests.get(src)?.controller === controller) this.requests.delete(src); }
    })();
    this.requests.set(src, { controller, promise });
    return promise;
  }
  private async prepare(src: string) {
    if (this.stopped || this.reduced) return;
    const generation = ++this.generation;
    this.phase = "loading"; this.emit();
    try {
      const clip = await this.load(src);
      if (this.stopped || this.reduced || generation !== this.generation) return;
      this.switchTo = { clip, src };
      this.schedule();
    } catch {
      if (this.stopped || this.reduced || generation !== this.generation) return;
      // Failed actions retain the already-visible frame/idle, never reveal an empty surface.
      this.action = null; this.queued = null; this.busy = false;
      this.phase = this.ready ? "idle" : "static"; this.emit();
      if (src !== this.idle && this.track?.src !== this.idle) void this.prepare(this.idle);
    }
  }
  play(action: Action): boolean {
    if (this.stopped || this.reduced) return false;
    if (this.busy) {
      if (this.queued) return false;
      this.queued = action; this.emit(); return true;
    }
    this.busy = true; this.action = action; this.segment = 0;
    void this.prepare(action.clips[0].src);
    return true;
  }
  private schedule() {
    if (!this.paused && !this.raf && !this.decoding) this.raf = requestAnimationFrame(this.tick);
  }
  private tick = (now: number) => {
    this.raf = 0;
    if (this.paused) return;
    if (now < this.due) { this.schedule(); return; }
    if (this.switchTo) {
      const { clip, src } = this.switchTo; this.switchTo = null;
      // Only resize the hidden compositor. Resizing the visible canvas would erase the cat.
      this.stage.width = clip.width; this.stage.height = clip.height;
      this.track = { clip, src, index: 0, scale: 1, x: 0, y: 0, aligned: false };
      this.due = now;
    }
    if (!this.track) return;
    this.decoding = true;
    void this.renderFrame(this.track).finally(() => { this.decoding = false; this.schedule(); });
  };
  private async renderFrame(track: Track) {
    const generation = this.generation;
    const frame = track.clip.frames[track.index];
    let decoded: Decoded | undefined;
    try {
      decoded = await decode(frame);
      if (this.stopped || this.reduced || track !== this.track) return;
      if (this.paused) return; // Keep the same index: suspension never consumes animation time.
      const previous = track.previous;
      // Our transparent character viewer ignores the file's opaque ANIM background hint.
      if (previous?.dispose) this.ctx.clearRect(previous.x, previous.y, previous.width, previous.height);
      if (frame.replace) this.ctx.clearRect(frame.x, frame.y, frame.width, frame.height);
      this.ctx.drawImage(decoded.image, frame.x, frame.y);
      track.previous = frame;
      this.probeCtx.clearRect(0, 0, 80, 60);
      this.probeCtx.drawImage(this.stage, 0, 0, 80, 60);
      const pixels = this.probeCtx.getImageData(0, 0, 80, 60).data;
      let count = 0, left = 80, right = 0, top = 60, bottom = 0;
      for (let y = 0; y < 60; y++) for (let x = 0; x < 80; x++) {
        if (pixels[(y * 80 + x) * 4 + 3] < 64) continue;
        count++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      // Suppress transparent/near-empty source glitches, but advance their compositor and timing.
      // A fixed clip transform preserves the intended motion, never normalizes each moving frame.
      if (count > (track.minimumAlpha ?? 40)) {
        if (!track.aligned) {
          track.minimumAlpha = Math.max(40, count * .3);
          const sy = track.clip.height / 60, sx = track.clip.width / 80;
          track.scale = 306 / ((bottom - top + 1) * sy);
          track.x = 282 - (left + right + 1) / 2 * sx * track.scale;
          track.y = 398 - (bottom + 1) * sy * track.scale;
          track.aligned = true;
        }
        // Clear and draw in one JS task: the browser cannot paint a cleared intermediate frame.
        this.display.clearRect(0, 0, 640, 480);
        this.display.drawImage(this.stage, track.x, track.y, track.clip.width * track.scale, track.clip.height * track.scale);
        this.canvas.dataset.ready = "true"; this.ready = true;
      }
      this.canvas.dataset.clip = track.src;
      this.canvas.dataset.frame = String(track.index);
      if (track.index === 0 && this.action && track.src === this.action.clips[this.segment].src) {
        // Warm only the next segment (or recovery idle), never all animations at once.
        void this.load(this.action.clips[this.segment + 1]?.src ?? this.idle).catch(() => undefined);
      }
      if (this.phase === "loading" && !this.switchTo && (!this.action || track.src === this.action.clips[this.segment].src)) {
        this.phase = this.action ? "playing" : "idle"; this.emit();
      }
      // Preserve encoded timing across normal decode/RAF jitter, with no catch-up burst after a stall.
      this.due = Math.max(this.due + frame.duration, performance.now() + 1);
      track.index++;
      if (track.index === track.clip.frames.length) {
        track.index = 0;
        // ANIM loops start with a fresh internal canvas; the display remains untouched.
        track.previous = undefined; this.ctx.clearRect(0, 0, this.stage.width, this.stage.height);
        if (this.action && track.src === this.action.clips[this.segment].src) {
          this.track = null; // Hold the last displayed pose while the next segment becomes ready.
          if (++this.segment < this.action.clips.length) void this.prepare(this.action.clips[this.segment].src);
          else {
            const queued = this.queued;
            this.action = null; this.queued = null; this.busy = false;
            if (queued) this.play(queued); else void this.prepare(this.idle);
          }
        }
      }
    } catch {
      if (this.stopped || this.reduced || track !== this.track || generation !== this.generation) return;
      const pendingSrc = this.switchTo?.src ?? (this.phase === "loading" ? this.action?.clips[this.segment]?.src ?? this.idle : null);
      if (pendingSrc && pendingSrc !== track.src) {
        // An old idle decoder may fail while a requested action is still downloading.
        // Hold the display, but do not cancel or orphan that independent request.
        this.track = null;
        return;
      }
      this.generation++; this.switchTo = null;
      this.action = null; this.queued = null; this.busy = false; this.track = null;
      this.phase = this.ready ? "idle" : "static"; this.emit();
      // A bad action may fall back to idle, but a bad idle must not retry forever.
      if (track.src !== this.idle) void this.prepare(this.idle);
    } finally { decoded?.close(); }
  }
  dispose() {
    this.stopped = true; this.generation++;
    cancelAnimationFrame(this.raf); this.observer.disconnect();
    document.removeEventListener("visibilitychange", this.updatePause);
    this.media.removeEventListener("change", this.motionChanged);
    this.requests.forEach(({ controller }) => controller.abort()); this.requests.clear(); this.cache.clear();
    this.track = null; this.switchTo = null; this.queued = null;
    this.stage.width = 0; this.stage.height = 0; this.probe.width = 0; this.probe.height = 0;
  }
}
