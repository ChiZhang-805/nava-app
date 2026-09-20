import curious from "../assets/mascot/animated/home-curious.webp";
import butterfly from "../assets/mascot/animated/home-butterfly.webp";
import fluffOne from "../assets/mascot/animated/home-fluff-1.webp";
import fluffTwo from "../assets/mascot/animated/home-fluff-2.webp";
import fluffThree from "../assets/mascot/animated/home-fluff-3.webp";
import fishOne from "../assets/mascot/animated/home-fish-1.webp";
import fishTwo from "../assets/mascot/animated/home-fish-2.webp";
import fishThree from "../assets/mascot/animated/home-fish-3.webp";
import read from "../assets/mascot/animated/home-read.webp";
import roll from "../assets/mascot/animated/home-roll.webp";
import drowsy from "../assets/mascot/animated/home-drowsy.webp";
import stretch from "../assets/mascot/animated/home-stretch.webp";
import yawn from "../assets/mascot/animated/home-yawn.webp";
import lift from "../assets/mascot/animated/module-exercise.webp";
import type { MascotMotion } from "./mascotMotion";

export type HomeMascotAction = {
  id: string;
  label: { zh: string; en: string };
  clips: Array<{ src: string; durationMs: number }>;
  interaction?: "groom" | "fish";
};

export const homeMascotActions: HomeMascotAction[] = [
  { id: "wave", label: { zh: "抬爪伸个懒腰", en: "stretch and raise a paw" }, clips: [{ src: stretch, durationMs: 8520 }] },
  { id: "butterfly", label: { zh: "和蝴蝶玩耍", en: "play with a butterfly" }, clips: [{ src: butterfly, durationMs: 11070 }] },
  { id: "curious", label: { zh: "好奇地想一想", en: "think curiously" }, clips: [{ src: curious, durationMs: 6960 }] },
  { id: "read", label: { zh: "翻开书阅读", en: "read a book" }, clips: [{ src: read, durationMs: 6420 }] },
  { id: "yawn", label: { zh: "打个哈欠", en: "have a yawn" }, clips: [{ src: yawn, durationMs: 9990 }] },
  { id: "nap", label: { zh: "闭眼打个盹", en: "take a little nap" }, clips: [{ src: drowsy, durationMs: 9540 }] },
  { id: "lift", label: { zh: "举起小哑铃", en: "lift a tiny weight" }, clips: [{ src: lift, durationMs: 1800 }] },
  { id: "roll", label: { zh: "翻个跟头", en: "do a playful roll" }, clips: [{ src: roll, durationMs: 4680 }] },
  { id: "fluff", interaction: "groom", label: { zh: "等你捋一捋毛", en: "wait for a grooming stroke" }, clips: [
    { src: fluffOne, durationMs: 1890 }, { src: fluffTwo, durationMs: 2430 }, { src: fluffThree, durationMs: 2670 },
  ] },
  { id: "fish", interaction: "fish", label: { zh: "抱着小鱼摸鱼", en: "knead a fish pillow" }, clips: [
    { src: fishOne, durationMs: 3540 }, { src: fishTwo, durationMs: 2340 }, { src: fishThree, durationMs: 3270 },
  ] },
];

export const preferredHomeMascotAction: Record<MascotMotion, string> = {
  wave: "wave",
  tail: "butterfly",
  read: "read",
  sleep: "yawn",
  lift: "lift",
};
