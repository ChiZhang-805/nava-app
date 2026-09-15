-- Preserve all existing settings, ownership policies, and legacy clients.
ALTER TABLE public.notification_preferences
  DROP CONSTRAINT notification_preferences_notification_type_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_notification_type_check
  CHECK (notification_type IN ('sleep', 'nutrition', 'mood', 'focus', 'weekly_report', 'fdnb_signal',
    'nutrition_breakfast', 'nutrition_lunch', 'nutrition_dinner'));
-- Existing unified diet settings remain a read-time lunch fallback. Do not
-- enable breakfast/dinner or rewrite users' timestamps without their choice.
