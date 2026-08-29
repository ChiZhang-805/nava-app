-- Award three idempotent daily engagement tasks from verified app events.

CREATE OR REPLACE FUNCTION public.nava_record_growth_activity(activity_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid := auth.uid();
  target_date date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
  normalized_kind text := lower(trim(coalesce(activity_kind, '')));
  reward_points integer;
  event_key text;
  event_name text;
  inserted_count integer;
  total_points integer;
  awarded jsonb := '[]'::jsonb;
BEGIN
  IF target_user IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  CASE normalized_kind
    WHEN 'checkin' THEN
      reward_points := 10;
      event_name := 'growth_daily_checkin';
    WHEN 'share' THEN
      reward_points := 15;
      event_name := 'growth_report_card_shared';
    WHEN 'ai' THEN
      reward_points := 15;
      event_name := 'growth_ai_conversation_completed';
    ELSE
      RAISE EXCEPTION 'unsupported growth activity';
  END CASE;

  event_key := target_date::text || ':' || normalized_kind;

  INSERT INTO public.growth_reward_ledger (user_id, event_key, points, source, metadata)
  VALUES (
    target_user,
    event_key,
    reward_points,
    'verified_engagement',
    jsonb_build_object('activity', normalized_kind, 'date', target_date)
  )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count > 0 THEN
    INSERT INTO public.analytics_events (user_id, event_name, properties)
    VALUES (target_user, event_name, jsonb_build_object('rewardPoints', reward_points));
    awarded := jsonb_build_array(jsonb_build_object(
      'eventKey', event_key,
      'points', reward_points,
      'source', 'verified_engagement'
    ));
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

  RETURN jsonb_build_object(
    'totalPoints', total_points,
    'awarded', awarded,
    'activity', normalized_kind,
    'completed', inserted_count > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.nava_record_growth_activity(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nava_record_growth_activity(text) TO authenticated;
