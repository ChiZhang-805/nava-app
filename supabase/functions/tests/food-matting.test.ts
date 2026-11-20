import { hasFoodMattingCredentials, matteGeneratedFood } from '../_shared/food-matting.ts';
function assert(value: unknown): asserts value { if (!value) throw new Error('Assertion failed'); }
async function rejects(fn: () => Promise<unknown>, match: string) { try { await fn(); } catch (error) { assert(String(error).includes(match)); return; } throw new Error('Expected rejection'); }
Deno.test('Aidge matting isolates credentials, signs generated-only RPC and rejects unsafe results', async () => {
  const env = Deno.env.get, fetch = globalThis.fetch;
  let values: Record<string,string> = { SUPABASE_URL:'https://wxteapvwagvhhtrjrbim.supabase.co', ALIYUN_ACCESS_KEY_ID:'fixture-id', ALIYUN_ACCESS_KEY_SECRET:'fixture-secret' };
  let response = { Success:true, Data:{ ImageUrl:'http://fixture.oss-cn-beijing.aliyuncs.com/cutout.png?Signature=fixture' } };
  let count = 0;
  try {
    Deno.env.get = name => values[name];
    assert(hasFoodMattingCredentials());
    globalThis.fetch = ((input: string|URL|Request, init?: RequestInit) => {
      count++;
      const url = new URL(String(input));
      assert(url.hostname==='aidge.cn-beijing.aliyuncs.com');
      assert(url.searchParams.get('BackGroundType')==='TRANSPARENT');
      assert(url.searchParams.get('ImageUrl')==='https://fixture-generated.invalid/a.png?x=1&y=two words');
      assert(!url.searchParams.has('TargetWidth')&&!url.searchParams.has('TargetHeight'));
      const headers = new Headers(init?.headers);
      assert(headers.get('x-acs-action')==='ImageMatting');
      assert(headers.get('Authorization')?.startsWith('ACS3-HMAC-SHA256 Credential=fixture-id,'));
      assert(init?.method==='POST'&&!init.body);
      return Promise.resolve(new Response(JSON.stringify(response)));
    }) as typeof globalThis.fetch;
    const source='https://fixture-generated.invalid/a.png?x=1&y=two words';
    assert((await matteGeneratedFood(source,AbortSignal.timeout(1000))).startsWith('https://fixture.oss-'));
    response={Success:true,Data:{ImageUrl:'http://127.0.0.1/private'}};
    await rejects(()=>matteGeneratedFood(source,AbortSignal.timeout(1000)),'aidge_invalid_result_url');
    response={Success:false,Data:{ImageUrl:''}};
    await rejects(()=>matteGeneratedFood(source,AbortSignal.timeout(1000)),'aidge_invalid_response');
    values={...values,SUPABASE_URL:'https://another-project.supabase.co'};
    assert(!hasFoodMattingCredentials());
    await rejects(()=>matteGeneratedFood(source,AbortSignal.timeout(1000)),'aidge_not_configured');
    assert(count===3);
    values={...values,SUPABASE_URL:'https://wxteapvwagvhhtrjrbim.supabase.co'};
    globalThis.fetch=(()=>Promise.resolve(new Response(JSON.stringify({Code:'Forbidden.RAM',Message:'private request details'}),{status:403}))) as typeof globalThis.fetch;
    await rejects(()=>matteGeneratedFood(source,AbortSignal.timeout(1000)),'aidge_forbidden_ram');
  } finally { Deno.env.get=env;globalThis.fetch=fetch; }
});
