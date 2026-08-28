-- Return newly granted growth rewards so the client can celebrate them exactly once.

CREATE OR REPLACE FUNCTION public.nava_reconcile_growth_rewards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid := auth.uid();
  target_date date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  total_points integer;
  badges jsonb;
  awarded jsonb := '[]'::jsonb;
  inserted_count integer;
BEGIN
  IF target_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, 'profile:foundation', 30, 'verified_profile'
  WHERE EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = target_user
      AND nullif(trim(username), '') IS NOT NULL
      AND nullif(trim(occupation), '') IS NOT NULL
      AND nullif(trim(age_group), '') IS NOT NULL
  )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    awarded := awarded || jsonb_build_array(jsonb_build_object('eventKey', 'profile:foundation', 'points', 30, 'source', 'verified_profile'));
  END IF;

  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, 'profile:goal', 30, 'verified_profile'
  WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user AND nullif(trim(goal), '') IS NOT NULL)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    awarded := awarded || jsonb_build_array(jsonb_build_object('eventKey', 'profile:goal', 'points', 30, 'source', 'verified_profile'));
  END IF;

  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, target_date || ':sleep', 25, 'verified_record'
  WHERE EXISTS (SELECT 1 FROM public.sleep_records WHERE user_id = target_user AND record_date = target_date)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    awarded := awarded || jsonb_build_array(jsonb_build_object('eventKey', target_date || ':sleep', 'points', 25, 'source', 'verified_record'));
  END IF;

  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, target_date || ':exercise', 25, 'verified_record'
  WHERE EXISTS (
    SELECT 1 FROM public.exercise_records
    WHERE user_id = target_user AND record_date = target_date
      AND (coalesce(exercise_minutes, 0) >= 20 OR coalesce(steps, 0) >= 3000)
  )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    awarded := awarded || jsonb_build_array(jsonb_build_object('eventKey', target_date || ':exercise', 'points', 25, 'source', 'verified_record'));
  END IF;

  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, target_date || ':mood', 20, 'verified_record'
  WHERE EXISTS (SELECT 1 FROM public.mood_records WHERE user_id = target_user AND record_date = target_date)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    awarded := awarded || jsonb_build_array(jsonb_build_object('eventKey', target_date || ':mood', 'points', 20, 'source', 'verified_record'));
  END IF;

  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, target_date || ':nutrition', 20, 'verified_record'
  WHERE EXISTS (SELECT 1 FROM public.nutrition_records WHERE user_id = target_user AND record_date = target_date)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    awarded := awarded || jsonb_build_array(jsonb_build_object('eventKey', target_date || ':nutrition', 'points', 20, 'source', 'verified_record'));
  END IF;

  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, target_date || ':focus', 20, 'verified_record'
  WHERE EXISTS (
    SELECT 1 FROM public.focus_records
    WHERE user_id = target_user AND record_date = target_date
    GROUP BY user_id, record_date
    HAVING sum(coalesce(total_minutes, 0)) >= 25
  )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    awarded := awarded || jsonb_build_array(jsonb_build_object('eventKey', target_date || ':focus', 'points', 20, 'source', 'verified_record'));
  END IF;

  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, target_date || ':face', 15, 'verified_record'
  WHERE EXISTS (SELECT 1 FROM public.face_records WHERE user_id = target_user AND record_date = target_date)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    awarded := awarded || jsonb_build_array(jsonb_build_object('eventKey', target_date || ':face', 'points', 15, 'source', 'verified_record'));
  END IF;

  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source, metadata)
  SELECT target_user, target_date || ':bare-face-bonus', 15, 'verified_record', '{"multiplier":2}'::jsonb
  WHERE EXISTS (
    SELECT 1 FROM public.face_records
    WHERE user_id = target_user AND record_date = target_date AND capture_mode = 'bare_face'
  )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    awarded := awarded || jsonb_build_array(jsonb_build_object('eventKey', target_date || ':bare-face-bonus', 'points', 15, 'source', 'verified_record'));
  END IF;

  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source)
  SELECT target_user, target_date || ':task', 20, 'verified_task'
  WHERE EXISTS (
    SELECT 1 FROM public.tasks
    WHERE user_id = target_user
      AND scheduled_date = target_date
      AND completed = true
      AND category = 'todo'
  )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    awarded := awarded || jsonb_build_array(jsonb_build_object('eventKey', target_date || ':task', 'points', 20, 'source', 'verified_task'));
  END IF;

  SELECT coalesce(sum(points), 0)
  INTO total_points
  FROM public.growth_reward_ledger
  WHERE user_id = target_user;

  IF total_points >= 100 THEN
    INSERT INTO public.growth_badges (user_id, badge_key, metadata)
    VALUES (target_user, 'rhythm_observer', jsonb_build_object('points', total_points))
    ON CONFLICT DO NOTHING;
  END IF;
  IF (
    SELECT count(DISTINCT record_date)
    FROM public.face_records
    WHERE user_id = target_user
      AND capture_mode = 'bare_face'
      AND record_date BETWEEN target_date - 6 AND target_date
  ) = 7 THEN
    INSERT INTO public.growth_badges (user_id, badge_key, metadata)
    VALUES (target_user, 'bare_face_week', '{"days":7}'::jsonb)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT coalesce(jsonb_agg(badge_key ORDER BY awarded_at), '[]'::jsonb)
  INTO badges
  FROM public.growth_badges
  WHERE user_id = target_user;

  RETURN jsonb_build_object('totalPoints', total_points, 'badges', badges, 'awarded', awarded);
END;
$$;

REVOKE ALL ON FUNCTION public.nava_reconcile_growth_rewards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nava_reconcile_growth_rewards() TO authenticated;
