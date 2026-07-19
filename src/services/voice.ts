import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type VoiceTranscriptHandler = (transcript: string, isFinal: boolean) => void;

export interface VoiceInputSession {
  stop: () => Promise<void>;
  cancel: () => Promise<void>;
}

interface VoiceInputOptions {
  locale: "zh" | "en";
  onTranscript: VoiceTranscriptHandler;
  onEnd: () => void;
  onError: (error: VoiceInputError) => void;
}

interface NativeSpeechResult {
  transcript: string;
  isFinal: boolean;
}

interface NativeSpeechState {
  listening: boolean;
}

interface NavaSpeechPlugin {
  startListening: (options: { locale: string }) => Promise<{ listening: boolean }>;
  stopListening: () => Promise<void>;
  cancelListening: () => Promise<void>;
  addListener(
    eventName: "speechResult",
    listener: (result: NativeSpeechResult) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "speechState",
    listener: (state: NativeSpeechState) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "speechError",
    listener: (error: { code?: string; message?: string }) => void,
  ): Promise<PluginListenerHandle>;
}

interface BrowserSpeechRecognitionEvent extends Event {
  results: ArrayLike<{
    0: { transcript: string };
    isFinal: boolean;
    length: number;
  }>;
  resultIndex: number;
}

interface BrowserSpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

const NavaSpeech = registerPlugin<NavaSpeechPlugin>("NavaSpeech");

export class VoiceInputError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "VoiceInputError";
  }
}

function normalizeVoiceError(code?: string, message?: string) {
  if (code === "not-allowed" || code === "service-not-allowed" || code === "permission_denied") {
    return new VoiceInputError(message || "Microphone or speech recognition permission was denied.", "permission_denied");
  }
  if (code === "audio-capture") {
    return new VoiceInputError(message || "No microphone is available.", "audio_unavailable");
  }
  if (code === "language-not-supported") {
    return new VoiceInputError(message || "The selected speech language is not supported.", "language_unsupported");
  }
  return new VoiceInputError(message || "Voice input stopped unexpectedly.", code || "voice_failed");
}

async function startNativeVoiceInput(options: VoiceInputOptions): Promise<VoiceInputSession> {
  const listeners: PluginListenerHandle[] = [];
  let finished = false;

  const cleanup = async () => {
    await Promise.all(listeners.splice(0).map((listener) => listener.remove()));
  };
  const finish = async () => {
    if (finished) return;
    finished = true;
    await cleanup();
    options.onEnd();
  };

  listeners.push(await NavaSpeech.addListener("speechResult", (result) => {
    options.onTranscript(result.transcript, result.isFinal);
  }));
  listeners.push(await NavaSpeech.addListener("speechError", (error) => {
    options.onError(normalizeVoiceError(error.code, error.message));
  }));
  listeners.push(await NavaSpeech.addListener("speechState", (state) => {
    if (!state.listening) void finish();
  }));

  try {
    await NavaSpeech.startListening({ locale: options.locale === "zh" ? "zh-CN" : "en-US" });
  } catch (error) {
    await cleanup();
    throw normalizeVoiceError(
      typeof error === "object" && error && "code" in error ? String(error.code) : undefined,
      error instanceof Error ? error.message : String(error),
    );
  }

  return {
    stop: async () => {
      if (finished) return;
      await NavaSpeech.stopListening();
      await finish();
    },
    cancel: async () => {
      if (finished) return;
      await NavaSpeech.cancelListening();
      await finish();
    },
  };
}

function startBrowserVoiceInput(options: VoiceInputOptions): VoiceInputSession {
  const speechWindow = window as SpeechWindow;
  const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  if (!Recognition) {
    throw new VoiceInputError("Speech recognition is unavailable in this browser.", "voice_unavailable");
  }

  const recognition = new Recognition();
  let finished = false;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = options.locale === "zh" ? "zh-CN" : "en-US";

  const finish = () => {
    if (finished) return;
    finished = true;
    options.onEnd();
  };

  recognition.onresult = (event) => {
    let transcript = "";
    let isFinal = true;
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      transcript += result[0]?.transcript ?? "";
      isFinal &&= result.isFinal;
    }
    if (transcript.trim()) options.onTranscript(transcript.trim(), isFinal);
  };
  recognition.onerror = (event) => {
    if (event.error !== "aborted" && event.error !== "no-speech") {
      options.onError(normalizeVoiceError(event.error, event.message));
    }
    finish();
  };
  recognition.onend = finish;

  recognition.start();
  return {
    stop: async () => {
      if (!finished) recognition.stop();
    },
    cancel: async () => {
      if (!finished) recognition.abort();
    },
  };
}

export async function startVoiceInput(options: VoiceInputOptions): Promise<VoiceInputSession> {
  if (Capacitor.isNativePlatform()) return startNativeVoiceInput(options);
  return startBrowserVoiceInput(options);
}
