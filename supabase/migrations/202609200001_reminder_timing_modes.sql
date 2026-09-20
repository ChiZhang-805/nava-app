-- Existing settings retain their fixed time and explicit enabled/disabled choice.
ALTER TABLE public.notification_preferences
  ADD COLUMN timing_mode text NOT NULL DEFAULT 'fixed'
  CHECK (timing_mode IN ('fixed', 'smart'));

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT notification_preferences_notification_type_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_notification_type_check CHECK (
    notification_type IN ('sleep', 'nutrition', 'mood', 'focus', 'weekly_report',
      'fdnb_signal', 'nutrition_breakfast', 'nutrition_lunch', 'nutrition_dinner',
      'exercise', 'face')
  );
