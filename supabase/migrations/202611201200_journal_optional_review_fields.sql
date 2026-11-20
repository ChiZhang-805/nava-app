-- Additive journal fields for user-confirmed observations. No table/RLS changes.
-- Deploy this validator before publishing the optional-field journal UI.
create or replace function public.valid_journal_fields(category text, fields jsonb) returns boolean
language plpgsql immutable set search_path=public as $$
declare spec jsonb; required_keys text[]; k text; v jsonb; n numeric; choice text;
begin
  if fields is null or jsonb_typeof(fields)<>'object' then return false; end if;
  case category
    when 'mood' then spec:='{"mood":60,"reason":60,"notes":32,"intensity":-10,"reasonTags":32}';required_keys:=array['mood'];
    when 'food' then spec:='{"meal":8,"foods":60,"portion":50,"notes":32,"calories":-15000,"protein":-2000,"carbs":-2000,"fat":-2000,"mealTime":5,"selfAssessment":8}';required_keys:=array['foods'];
    when 'focus' then spec:='{"task":60,"durationMinutes":-720,"notes":60}';required_keys:=array['task','durationMinutes'];
    when 'sport' then spec:='{"activity":40,"durationMinutes":-1440,"notes":60,"intensity":8,"recovery":8,"startTime":5,"endTime":5,"steps":-200000}';required_keys:=array['activity','durationMinutes'];
    when 'sleep' then spec:='{"bedtime":5,"wakeTime":5,"quality":60,"notes":32,"hours":-24,"recordDate":10,"bedDate":10,"wakeDate":10,"startedAt":32,"endedAt":32}';required_keys:=array['bedtime','wakeTime'];
    when 'face' then spec:='{"feeling":40,"eyeArea":50,"skinAppearance":60,"notes":32,"captureMode":8}';required_keys:=array['feeling'];
    else return false;
  end case;
  foreach k in array required_keys loop
    if fields->>k is null or btrim(fields->>k)='' then return false;end if;
  end loop;
  for k,v in select * from jsonb_each(fields) loop
    if not spec ? k then return false;end if;
    if v='null'::jsonb then continue;end if;
    n:=(spec->>k)::numeric;
    if n<0 then
      if jsonb_typeof(v)<>'number' or (v::text)::numeric<0 or (v::text)::numeric > -n then return false;end if;
      if k='durationMinutes' and (v::text)::numeric<=0 then return false;end if;
      if category='mood' and k='intensity' and (v::text)::numeric<1 then return false;end if;
      if k='steps' and trunc((v::text)::numeric)<>(v::text)::numeric then return false;end if;
    elsif jsonb_typeof(v)<>'string' or length(fields->>k)>n then return false;end if;
    if k in ('mealTime','startTime','endTime','bedtime','wakeTime') and coalesce(fields->>k,'')<>''
       and (fields->>k) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false;end if;
  end loop;
  if category='food' then
    if coalesce(fields->>'meal','')<>'' and fields->>'meal' not in ('早餐','午餐','晚餐','加餐') then return false;end if;
    if coalesce(fields->>'selfAssessment','')<>'' and fields->>'selfAssessment' not in ('吃得健康','一般','不太均衡') then return false;end if;
  elsif category='sport' then
    if coalesce(fields->>'intensity','')<>'' and fields->>'intensity' not in ('轻松','适中','较吃力') then return false;end if;
    if coalesce(fields->>'recovery','')<>'' and fields->>'recovery' not in ('精神不错','有点累','需要休息') then return false;end if;
  elsif category='face' then
    if coalesce(fields->>'captureMode','')<>'' and fields->>'captureMode' not in ('素颜','带妆') then return false;end if;
  elsif category='mood' and coalesce(fields->>'reasonTags','')<>'' then
    foreach choice in array string_to_array(fields->>'reasonTags','、') loop
      if choice not in ('学习','工作','社交','家庭','身体','其他') then return false;end if;
    end loop;
  end if;
  return true;
exception when others then return false;
end $$;
