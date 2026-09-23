import type { User } from "@supabase/supabase-js";

export type AppTab = "today" | "record" | "ai" | "trends" | "profile";

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export interface MoodRecord {
  id: string;
  user_id?: string;
  record_date: string;
  mood_score: number;
  factors: string[];
  diary_content: string | null;
  ai_feedback: string | null;
  diary_sentiment?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SleepRecord {
  id: string;
  user_id?: string;
  record_date: string;
  sleep_start: string | null;
  sleep_end: string | null;
  sleep_duration_minutes: number | null;
  deep_sleep_minutes: number | null;
  light_sleep_minutes: number | null;
  rem_minutes: number | null;
  sleep_latency_minutes?: number | null;
  device_type?: string | null;
  self_rating: number | null;
  self_note?: string | null;
  rhythm_score: number | null;
  ai_feedback: string | null;
  is_night_owl?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExerciseRecord {
  id: string;
  user_id?: string;
  record_date: string;
  steps: number | null;
  calories: number | null;
  steps_goal?: number | null;
  calories_goal?: number | null;
  exercise_minutes: number | null;
  heart_rate: string | null;
  spo2: string | null;
  blood_pressure?: string | null;
  respiratory_rate?: number | null;
  device_type?: string | null;
  self_rating: number | null;
  self_note?: string | null;
  soreness_level?: number | null;
  fatigue_level?: number | null;
  has_injury?: boolean | null;
  injury_note?: string | null;
  recovery_estimate_min_hours?: number | null;
  recovery_estimate_max_hours?: number | null;
  recovery_estimate_confidence?: number | null;
  recovery_estimate_basis?: Record<string, unknown> | null;
  recovery_status?: "recovered" | "improving" | "not_recovered" | null;
  recovery_checked_at?: string | null;
  ai_feedback: string | null;
  hourly_steps?: Array<Record<string, unknown>> | null;
  created_at?: string;
  updated_at?: string;
}

export interface NutritionRecord {
  id: string;
  user_id?: string;
  record_date: string;
  total_calories: number | null;
  breakfast_photo_url?: string | null;
  lunch_photo_url?: string | null;
  dinner_photo_url?: string | null;
  breakfast_time?: string | null;
  lunch_time?: string | null;
  dinner_time?: string | null;
  pantry_time?: string | null;
  breakfast_items?: FoodItem[];
  lunch_items?: FoodItem[];
  dinner_items?: FoodItem[];
  pantry_items?: FoodItem[];
  protein_grams?: number | null;
  carbohydrate_grams?: number | null;
  fat_grams?: number | null;
  hydration_ml?: number | null;
  health_rating?: number | null;
  ai_feedback: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FoodItem {
  name: string;
  source_id?: string;
  nutrition_source?: "vision_estimate" | "usda_fdc" | "user_corrected";
  nutrition_source_id?: string;
  calories?: number | null;
  amount?: string;
  weight_grams?: number;
  protein_grams?: number | null;
  carbohydrate_grams?: number | null;
  fat_grams?: number | null;
  confidence?: number;
  meal_summary?: {
    protein_grams: number | null;
    carbohydrate_grams: number | null;
    fat_grams: number | null;
    hydration_ml: number | null;
    health_rating?: number;
  };
}

export interface TaskRecord {
  id: string;
  user_id?: string;
  title: string;
  scheduled_date: string;
  completed: boolean;
  source?: "manual" | "ai";
  created_at?: string;
  updated_at?: string;
}

export interface FocusRecord {
  id: string;
  user_id?: string;
  task_id: string;
  record_date: string;
  completed_sessions: number;
  total_minutes: number;
  interrupted_sessions?: number;
  category?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FocusTimeDistribution {
  id: string;
  record_date: string;
  period_0_6: number;
  period_6_12: number;
  period_12_18: number;
  period_18_24: number;
}

export interface ActivityBin {
  hour: number;
  steps?: number | null;
  exerciseMinutes?: number | null;
}

export interface HealthMetricSnapshot {
  id: string;
  record_date: string;
  latest_heart_rate: number | null;
  resting_heart_rate: number | null;
  heart_rate_variability_sdnn: number | null;
  blood_oxygen: number | null;
  activity_bins?: ActivityBin[];
  sleep_stage_minutes?: Record<string, number> | null;
  sleep_start_at?: string | null;
  sleep_end_at?: string | null;
  sleep_efficiency?: number | null;
  activity_coverage_hours?: number | null;
  source: string;
}

export interface TodaySnapshot {
  journal?: import('./services/journal').JournalRecord[];
  date: string;
  mood: MoodRecord | null;
  sleep: SleepRecord | null;
  exercise: ExerciseRecord | null;
  nutrition: NutritionRecord | null;
  face: FaceRecord | null;
  focusMinutes: number;
  focusSessions: number;
  rhythmScore: number | null;
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
  focusDistributions: FocusTimeDistribution[];
  healthMetrics: HealthMetricSnapshot[];
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
  provider?: string;
  note?: string;
  analysisAvailable?: boolean;
  totals?: {
    calories: number | null;
    proteinGrams: number | null;
    carbohydrateGrams: number | null;
    fatGrams: number | null;
  };
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
  makeup_level?: "bare" | "light" | "heavy" | "uncertain";
  makeup_confidence?: number;
  capture_conditions?: {
    light: boolean;
    position: boolean;
    expression: boolean;
  };
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
  capture_mode?: "bare_face" | "makeup";
  analysis_confidence?: number | null;
  derived_features?: Record<string, number | string | boolean | null>;
}
