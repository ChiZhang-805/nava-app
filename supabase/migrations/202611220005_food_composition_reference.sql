begin;

-- Public-domain USDA FNDDS composition, not user health data. Values are per
-- 100 g of the described food, not per pictured plate or per portion.
create table public.food_composition_references (
  fdc_id bigint primary key,
  description text not null,
  data_type text not null,
  publication_date date not null,
  calories_kcal numeric check (calories_kcal >= 0),
  protein_g numeric check (protein_g >= 0),
  carbohydrate_g numeric check (carbohydrate_g >= 0),
  fat_g numeric check (fat_g >= 0),
  portions jsonb not null default '[]'::jsonb check (jsonb_typeof(portions) = 'array'),
  source_url text not null,
  source_release text not null,
  vision_priority integer not null default 0,
  search_vector tsvector generated always as (to_tsvector('english', description)) stored
);
create index food_composition_search on public.food_composition_references using gin(search_vector);
alter table public.food_composition_references enable row level security;
revoke all on public.food_composition_references from anon, authenticated;
grant select on public.food_composition_references to authenticated;
grant all on public.food_composition_references to service_role;
create policy food_reference_read on public.food_composition_references for select to authenticated using (true);
comment on table public.food_composition_references is 'USDA FNDDS reference composition per 100 g edible food; not a measured user intake or guaranteed restaurant recipe.';
comment on column public.food_composition_references.portions is 'Published portion descriptions and gram weights. Missing nutrients remain NULL.';

create function public.nava_food_reference_search(p_queries text[] default '{}', p_limit integer default 32)
returns table(fdc_id bigint, description text, calories_kcal numeric, protein_g numeric,
  carbohydrate_g numeric, fat_g numeric, portions jsonb, source_url text)
language sql stable security invoker set search_path = public, pg_temp as $$
  with queries as (
    select websearch_to_tsquery('english', left(q, 120)) as term
    from unnest(p_queries[1:12]) q where length(trim(q)) > 1
  ), ranked as (
    select r.*, coalesce((select max(ts_rank_cd(r.search_vector, q.term))
      from queries q where r.search_vector @@ q.term), 0) as relevance
    from public.food_composition_references r
    where r.vision_priority > 0 or exists (select 1 from queries q where r.search_vector @@ q.term)
  )
  select r.fdc_id, r.description, r.calories_kcal, r.protein_g, r.carbohydrate_g,
    r.fat_g, r.portions, r.source_url
  from ranked r order by r.relevance desc, r.vision_priority desc, r.fdc_id
  limit greatest(1, least(coalesce(p_limit,32),40));
$$;
revoke all on function public.nava_food_reference_search(text[],integer) from public, anon;
grant execute on function public.nava_food_reference_search(text[],integer) to authenticated, service_role;

commit;
