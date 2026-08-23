import type { User } from "@supabase/supabase-js";

export type AppTab = "today" | "record" | "ai" | "trends" | "profile";

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export interface MoodRecord {
  id: string;
  record_date: string;
  mood_score: number;
  factors: string[];
  diary_content: string | null;
  ai_feedback: string | null;
  diary_sentiment?: number | null;
}

export interface SleepRecord {
  id: string;
  record_date: string;
  sleep_start: string | null;
  sleep_end: string | null;
  sleep_duration_minutes: number | null;
  deep_sleep_minutes: number | null;
  light_sleep_minutes: number | null;
  rem_minutes: number | null;
  self_rating: number | null;
  rhythm_score: number | null;
  ai_feedback: string | null;
}

export interface ExerciseRecord {
  id: string;
  record_date: string;
  steps: number | null;
  calories: number | null;
  exercise_minutes: number | null;
  heart_rate: string | null;
  spo2: string | null;
  self_rating: number | null;
  ai_feedback: string | null;
}

export interface NutritionRecord {
  id: string;
  record_date: string;
  total_calories: number;
  breakfast_photo_url?: string | null;
  lunch_photo_url?: string | null;
  dinner_photo_url?: string | null;
  breakfast_items?: FoodItem[];
  lunch_items?: FoodItem[];
  dinner_items?: FoodItem[];
  pantry_items?: FoodItem[];
  ai_feedback: string | null;
}

export interface FoodItem {
  name: string;
  calories?: number;
  amount?: string;
}

export interface TaskRecord {
  id: string;
  title: string;
  scheduled_date: string;
  completed: boolean;
}

export interface FocusRecord {
  id: string;
  task_id: string;
  record_date: string;
  completed_sessions: number;
  total_minutes: number;
}

export interface TodaySnapshot {
  date: string;
  mood: MoodRecord | null;
  sleep: SleepRecord | null;
  exercise: ExerciseRecord | null;
  nutrition: NutritionRecord | null;
  face: FaceRecord | null;
  focusMinutes: number;
  focusSessions: number;
  rhythmScore: number;
  rhythmConfidence?: number;
  rhythmScoreLower?: number;
  rhythmScoreUpper?: number;
  rhythmModelVersion?: string;
  rhythmDataQuality?: number;
  rhythmTrendSlope?: number;
  rhythmAnomalyCount?: number;
  nextAction: string;
}

export interface DailyRhythmScore {
  id: string;
  record_date: string;
  score: number;
  confidence: number | null;
  score_lower?: number | null;
  score_upper?: number | null;
  model_version: string | null;
  data_quality_score?: number | null;
  trend_slope?: number | null;
  change_point_probability?: number | null;
  schema_version?: string | null;
  fusion?: Record<string, unknown> | null;
  anomaly_flags?: Array<Record<string, unknown>>;
  actions?: string[];
  signals?: Array<Record<string, unknown>>;
}

export interface TrendBundle {
  moods: MoodRecord[];
  sleeps: SleepRecord[];
  exercises: ExerciseRecord[];
  nutritions: NutritionRecord[];
  faces: FaceRecord[];
  focus: FocusRecord[];
  rhythms: DailyRhythmScore[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export interface WatchUserSnapshot {
  userId: string;
  displayName?: string;
  today: {
    rhythmScore?: number;
    sleepScore?: number;
    steps?: number;
    activeCalories?: number;
    mood?: number;
    focusMinutes?: number;
  };
  lastSyncedAt: string;
}

export interface DietExtractResult {
  imageUrl: string;
  imagePath?: string;
  items: FoodItem[];
  modelVersion?: string;
  confidence?: number;
}

export interface FaceAnnotation {
  id: string;
  label: string;
  desc: string;
  dot_x: number;
  dot_y: number;
}

export interface FaceAnalysisResult {
  overall_score: number;
  feedback: string;
  annotations: FaceAnnotation[];
  modelVersion?: string;
  model_version?: string;
  confidence?: number;
  skin_age?: number | null;
}

export interface FaceRecord {
  id: string;
  record_date: string;
  image_path: string | null;
  overall_score: number | null;
  skin_age: number | null;
  annotations: FaceAnnotation[];
  feedback: string | null;
  model_version: string | null;
}
