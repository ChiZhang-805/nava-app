// Synthetic administrator, fixed mock responses and intercepted network only. No cloud access.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { webkit, expect } from '@playwright/test';
import { configuredServices, applyFoodObservations } from '../supabase/functions/_shared/admin-service-status.ts';

process.env.VITE_SUPABASE_URL = 'https://nava-admin-fixture.invalid';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'fixture-public-key';
const port = 5352;
const output = 'Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/admin-service-status';
const stamp = new Date().toISOString();
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@nava.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: stamp };
const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), Buffer.from('fixture-signature').toString('base64url')].join('.');
const fixtureEnv = { SUPABASE_URL: 'https://wxteapvwagvhhtrjrbim.supabase.co', DEEPSEEK_API_KEY_NAVA: 'never-visible-key', DASHSCOPE_API_KEY: 'never-visible-legacy' };
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module">
import React from 'react'; import ReactDOM from 'react-dom/client';
import AdminConsole from '/src/features/AdminConsole.tsx';
import {LocaleProvider} from '/src/i18n.tsx';
import {supabase} from '/src/services/supabaseClient.ts';
import '/src/styles/global.css'; import '/src/styles/product-ui.css';
const seeded=await supabase.auth.setSession({access_token:${JSON.stringify(token)},refresh_token:'fixture-refresh'});
if(seeded.error||!seeded.data.session)throw new Error('Synthetic session failed: '+seeded.error?.message);
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(LocaleProvider,null,React.createElement('main',{className:'phone-frame',style:{width:'100%',maxWidth:'none',height:'100dvh',minHeight:0,margin:0,border:0,borderRadius:0,overflow:'hidden',position:'relative'}},React.createElement(AdminConsole,{user:${JSON.stringify(user)},onHome:()=>{window.fixtureHome=true}}))));
</script></body></html>`;
await mkdir(output, { recursive: true });
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port, strictPort: true }, plugins: [{ name: 'admin-service-fixture', configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => { if (!req.url?.startsWith('/__admin-services.html')) return next(); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await vite.transformIndexHtml(req.url, html)); });
} }] });
await server.listen();
const browser = await webkit.launch({ headless: true });
const results = [];
try {
  for (const [width, height, locale, state] of [[320,568,'zh','available'],[375,812,'en','insufficient'],[390,844,'zh','unknown'],[430,932,'en','available']]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: locale === 'zh' ? 'zh-CN' : 'en-US', isMobile: true, hasTouch: true });
    let calls = 0, responseStatus = 200;
    const unexpected = [], errors = [];
    const services = configuredServices(name => fixtureEnv[name]);
    const activity = applyFoodObservations(services, state === 'unknown' ? [] : [{ state: 'ready', updated_at: stamp }], new Date(stamp));
    const snapshot = { version: 1, checkedAt: stamp, services, foodActivity: activity, deepseek: { state, checkedAt: stamp, balances: state === 'unknown' ? [] : [{ currency: 'CNY', total: state === 'insufficient' ? '0.00' : '18.120001', granted: '0.00', toppedUp: state === 'insufficient' ? '0.00' : '18.120001' }] } };
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname === '127.0.0.1' && Number(url.port) === port) return route.continue();
      if (url.hostname !== 'nava-admin-fixture.invalid') { unexpected.push(request.url()); return route.abort(); }
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'cache-control': 'no-store' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (url.pathname === '/auth/v1/user') return route.fulfill({ status: 200, headers, json: user });
      if (url.pathname === '/functions/v1/admin-service-status') {
        calls++; assert.equal(request.method(), 'POST'); assert.equal(request.headers().authorization, `Bearer ${token}`);
        await new Promise(resolve => setTimeout(resolve, 300));
        return route.fulfill({ status: responseStatus, headers, json: responseStatus === 200 ? snapshot : { error: 'untrusted-secret-provider-message' } });
      }
      unexpected.push(request.url()); return route.abort();
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/__admin-services.html?qa=admin-console`);
    await expect(page.locator('.admin-console-actions > button')).toHaveCount(4);
    assert.equal(calls, 0, 'Opening admin overview must not query balance');
    await page.locator('[data-admin-action="services"]').click();
    await expect(page.locator('.admin-console-screen')).toHaveAttribute('data-admin-page', 'services');
    await expect(page.locator('[data-provider="deepseek"]')).toBeVisible();
    await expect(page.locator('.admin-service-feature')).toHaveCount(12);
    assert.equal(calls, 1);
    assert.ok(!(await page.locator('.admin-services').innerText()).includes('never-visible'));
    await expect(page.locator('[data-service="chat_text"] .admin-service-badge')).toHaveAttribute('data-signal', 'unknown');
    await expect(page.locator('[data-provider="aliyun"] .admin-service-badge')).toHaveAttribute('data-signal', 'unknown');
    await expect(page.locator('[data-provider="aidge"] .admin-service-badge')).toHaveAttribute('data-signal', 'unknown');
    await expect(page.locator('[data-provider="aidge"] a')).toHaveAttribute('href', 'https://ecoa.console.aliyun.com/');
    await page.screenshot({ path: path.join(output, `balances-${width}-${locale}.png`) });
    await page.locator('[data-service="food_visual"] summary').click();
    await expect(page.locator('[data-service="food_visual"] code').first()).toHaveText('DASHSCOPE_API_KEY');
    await page.screenshot({ path: path.join(output, `features-${width}-${locale}.png`) });
    const geometry = await page.evaluate(() => {
      const screen = document.querySelector('.admin-console-screen');
      return { overflow: screen.scrollWidth-screen.clientWidth, viewportOverflow: document.documentElement.scrollWidth-innerWidth, badWidths: [...document.querySelectorAll('.admin-services *')].filter(el => el.getBoundingClientRect().width > innerWidth).length };
    });
    assert.ok(geometry.overflow <= 1 && geometry.viewportOverflow <= 1 && geometry.badWidths === 0, JSON.stringify(geometry));
    responseStatus = 503;
    const refresh = page.getByRole('button', { name: locale === 'zh' ? '刷新服务状态' : 'Refresh service status' });
    await refresh.click(); await expect(refresh).toBeDisabled(); await expect(page.locator('.admin-services-error')).toBeVisible();
    assert.equal(calls, 2); await expect(page.locator('[data-provider="deepseek"]')).toHaveCount(1);
    assert.ok(!(await page.locator('.admin-services').innerText()).includes('untrusted-secret'));
    responseStatus = 403; await refresh.click(); await expect(page.locator('[data-provider="deepseek"]')).toHaveCount(0);
    await expect(page.locator('.admin-services-error')).toContainText(locale === 'zh' ? '没有管理员权限' : 'Administrator access');
    await page.screenshot({ path: path.join(output, `permission-${width}-${locale}.png`) });
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    results.push({ width, height, locale, state, calls, geometry, externalCalls: 0 });
    await context.close();
  }
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: results.length, output, network: 'synthetic intercepted only' }));
} finally { await browser.close(); await server.close(); }
