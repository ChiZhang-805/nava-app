// Isolated PostgreSQL harness. No production connection and no real accounts.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export const testUsers = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
export async function createMiyouTestDb() {
  const {PGlite}=await import(process.env.NAVA_PGLITE?pathToFileURL(process.env.NAVA_PGLITE).href:'@electric-sql/pglite');
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, avatar_url text, username text);
    alter table public.profiles enable row level security;
    create schema storage;
    create table storage.objects(bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select on storage.objects to authenticated,anon;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;
    insert into auth.users(id) values ${testUsers.map(id=>`('${id}')`).join(',')};`);
  await db.exec(await readFile(new URL('../supabase/migrations/202611220001_miyou_space.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/202611220003_miyou_direct_entry.sql',import.meta.url),'utf8'));
  const nearbySql=await readFile(new URL('../supabase/migrations/202611220004_miyou_nearby.sql',import.meta.url),'utf8');
  await db.exec(nearbySql.replace(/select cron.schedule\([\s\S]*?\$job\$\);/,''));
  async function call(user,action,payload={},nearby=false) {
    return db.transaction(async tx=>{
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user||'']);
      await tx.exec('set local role authenticated');
      const result=await tx.query(`select public.${nearby?'nava_miyou_nearby':'nava_miyou'}($1,$2::jsonb) as value`,[action,JSON.stringify(payload)]);
      return result.rows[0].value;
    });
  }
  return {db,rpc:(user,action,payload)=>call(user,action,payload),nearby:(user,action,payload)=>call(user,action,payload,true)};
}
