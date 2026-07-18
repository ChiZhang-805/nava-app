export type SyntheticDataCategory =
  | "apple_watch_auto"
  | "one_time_profile"
  | "daily_user_report"
  | "algorithm_derived";

export type FieldExpectation = {
  key: string;
  label: string;
  category: SyntheticDataCategory;
  unit?: string;
  observedRateMin?: number;
  observedRateMax?: number;
  plausibleMin: number;
  plausibleMax: number;
  medianMin?: number;
  medianMax?: number;
  p1Min?: number;
  p99Max?: number;
};

export const syntheticFieldExpectations: FieldExpectation[] = [
  { key: "sleep_duration_minutes", label: "Sleep duration", category: "apple_watch_auto", unit: "minutes", observedRateMin: 0.55, plausibleMin: 120, plausibleMax: 720, medianMin: 360, medianMax: 500, p1Min: 180, p99Max: 660 },
  { key: "deep_sleep_ratio", label: "Deep sleep ratio", category: "apple_watch_auto", observedRateMin: 0.55, plausibleMin: 0.04, plausibleMax: 0.34, medianMin: 0.12, medianMax: 0.23, p1Min: 0.05, p99Max: 0.31 },
  { key: "rem_sleep_ratio", label: "REM sleep ratio", category: "apple_watch_auto", observedRateMin: 0.55, plausibleMin: 0.06, plausibleMax: 0.38, medianMin: 0.15, medianMax: 0.27, p1Min: 0.08, p99Max: 0.35 },
  { key: "steps", label: "Daily steps", category: "apple_watch_auto", unit: "steps", observedRateMin: 0.55, plausibleMin: 0, plausibleMax: 100000, medianMin: 3500, medianMax: 10500, p1Min: 100, p99Max: 42000 },
  { key: "exercise_minutes", label: "Exercise minutes", category: "apple_watch_auto", unit: "minutes", observedRateMin: 0.55, plausibleMin: 0, plausibleMax: 240, medianMin: 10, medianMax: 70, p99Max: 220 },
  { key: "active_calories", label: "Active energy", category: "apple_watch_auto", unit: "kcal", observedRateMin: 0.55, plausibleMin: 20, plausibleMax: 1900, medianMin: 180, medianMax: 620, p99Max: 1700 },
  { key: "latest_heart_rate", label: "Latest heart rate", category: "apple_watch_auto", unit: "bpm", observedRateMin: 0.5, plausibleMin: 38, plausibleMax: 190, medianMin: 65, medianMax: 105, p1Min: 42, p99Max: 165 },
  { key: "resting_heart_rate", label: "Resting heart rate", category: "apple_watch_auto", unit: "bpm", observedRateMin: 0.5, plausibleMin: 30, plausibleMax: 160, medianMin: 55, medianMax: 78, p1Min: 42, p99Max: 105 },
  { key: "hrv_sdnn", label: "HRV SDNN", category: "apple_watch_auto", unit: "ms", observedRateMin: 0.5, plausibleMin: 1, plausibleMax: 400, medianMin: 24, medianMax: 70, p1Min: 8, p99Max: 150 },
  { key: "blood_oxygen_percent", label: "Blood oxygen", category: "apple_watch_auto", unit: "%", observedRateMin: 0.5, plausibleMin: 88, plausibleMax: 100, medianMin: 95, medianMax: 99.5, p1Min: 90, p99Max: 100 },
  { key: "activity_coverage_hours", label: "Activity coverage", category: "apple_watch_auto", unit: "hours", observedRateMin: 0.5, plausibleMin: 0, plausibleMax: 24, medianMin: 20, medianMax: 24, p99Max: 24 },

  { key: "age_years", label: "Age", category: "one_time_profile", unit: "years", observedRateMin: 1, plausibleMin: 18, plausibleMax: 84, medianMin: 30, medianMax: 55, p1Min: 18, p99Max: 82 },
  { key: "bmi", label: "BMI", category: "one_time_profile", observedRateMin: 1, plausibleMin: 18, plausibleMax: 43, medianMin: 22, medianMax: 29, p1Min: 18.5, p99Max: 41 },
  { key: "baseline_steps_median", label: "Baseline steps median", category: "one_time_profile", unit: "steps", observedRateMin: 1, plausibleMin: 1500, plausibleMax: 22000, medianMin: 4200, medianMax: 9500, p99Max: 20000 },
  { key: "baseline_hrv_sdnn", label: "Baseline HRV SDNN", category: "one_time_profile", unit: "ms", observedRateMin: 1, plausibleMin: 8, plausibleMax: 160, medianMin: 28, medianMax: 65, p1Min: 10, p99Max: 130 },
  { key: "baseline_resting_heart_rate", label: "Baseline resting heart rate", category: "one_time_profile", unit: "bpm", observedRateMin: 1, plausibleMin: 42, plausibleMax: 95, medianMin: 58, medianMax: 76, p1Min: 45, p99Max: 90 },

  { key: "mood_score", label: "Mood score", category: "daily_user_report", observedRateMin: 0.2, plausibleMin: 3, plausibleMax: 99, medianMin: 42, medianMax: 78, p1Min: 5, p99Max: 98 },
  { key: "nutrition_calories", label: "Nutrition calories", category: "daily_user_report", unit: "kcal", observedRateMin: 0.12, plausibleMin: 450, plausibleMax: 5800, medianMin: 1400, medianMax: 2700, p1Min: 550, p99Max: 5200 },
  { key: "focus_minutes", label: "Focus minutes", category: "daily_user_report", unit: "minutes", observedRateMin: 0.28, plausibleMin: 0, plausibleMax: 420, medianMin: 25, medianMax: 130, p99Max: 360 },
  { key: "sleep_self_rating", label: "Sleep self rating", category: "daily_user_report", observedRateMin: 0.55, plausibleMin: 1, plausibleMax: 5, medianMin: 2, medianMax: 4.5 },

  { key: "rhythm_score", label: "Rhythm score", category: "algorithm_derived", observedRateMin: 1, plausibleMin: 0, plausibleMax: 100, medianMin: 38, medianMax: 72, p1Min: 8, p99Max: 96 },
  { key: "rhythm_confidence", label: "Rhythm confidence", category: "algorithm_derived", observedRateMin: 1, plausibleMin: 0, plausibleMax: 1, medianMin: 0.55, medianMax: 0.85 },
  { key: "data_quality_score", label: "Data quality score", category: "algorithm_derived", observedRateMin: 1, plausibleMin: 0, plausibleMax: 100, medianMin: 55, medianMax: 92 },
  { key: "circadian_drift_pressure", label: "Circadian drift pressure", category: "algorithm_derived", observedRateMin: 1, plausibleMin: 0, plausibleMax: 1, medianMin: 0, medianMax: 0.35 },
  { key: "physiology_lead_pressure", label: "Physiology lead pressure", category: "algorithm_derived", observedRateMin: 1, plausibleMin: 0, plausibleMax: 1, medianMin: 0, medianMax: 0.55 },
  { key: "presenteeism_strain_pressure", label: "Presenteeism strain pressure", category: "algorithm_derived", observedRateMin: 1, plausibleMin: 0, plausibleMax: 1, medianMin: 0, medianMax: 0.35 },
  { key: "masked_strain_pressure", label: "Masked strain pressure", category: "algorithm_derived", observedRateMin: 1, plausibleMin: 0, plausibleMax: 1, medianMin: 0, medianMax: 0.45 },
  { key: "functional_overreach_relief", label: "Functional overreach relief", category: "algorithm_derived", observedRateMin: 1, plausibleMin: 0, plausibleMax: 1, medianMin: 0, medianMax: 0.25 },
  { key: "phase_adaptation_relief", label: "Phase adaptation relief", category: "algorithm_derived", observedRateMin: 1, plausibleMin: 0, plausibleMax: 1, medianMin: 0, medianMax: 0.35 },
  { key: "recovery_rebound_relief", label: "Recovery rebound relief", category: "algorithm_derived", observedRateMin: 1, plausibleMin: 0, plausibleMax: 1, medianMin: 0, medianMax: 0.35 },
];
