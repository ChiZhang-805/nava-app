import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const target = process.env.NAVA_URL || 'http://localhost:5174';
const output = 'Q:/NAVA-Workspace/Build/TestRuns/journal-voice-prefill';
mkdirSync(output, { recursive: true });
const cases = {
  mood: ['我现在觉得很放松，因为完成了今天的工作', { mood: '很放松', reason: '完成了今天的工作' }],
  food: ['午餐吃了鸡肉米饭，大概一碗', { meal: '午餐', foods: '鸡肉米饭', portion: '一碗' }],
  sport: ['今天跑步30分钟，跑了5公里', { activity: '跑步', durationMinutes: '30', notes: '5公里' }],
  sleep: ['昨晚11点睡，早上7点醒来，感觉很精神，中途醒过一次', { bedtime: '23:00', wakeTime: '07:00', quality: '很精神', notes: '中途醒过一次' }],
  face: ['我今天感觉精神还好，眼周有一点黑眼圈，皮肤有点泛红', { feeling: '精神还好', eyeArea: '有一点黑眼圈', skinAppearance: '有点泛红' }],
  focus: ['我想专注读论文45分钟，希望读完方法部分', { task: '读论文', durationMinutes: '45', notes: '读完方法部分' }],
};
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [category, [words, expected]] of Object.entries(cases)) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'zh-CN' });
    await page.addInitScript(() => {
      const stream = { getTracks: () => [{ stop() {} }] };
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => stream } });
      Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'granted' }) } });
      class FakeAudioContext {
        state = 'running';
        resume() { return Promise.resolve(); }
        createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
        createAnalyser() { return { fftSize: 0, getByteTimeDomainData(data) { data.fill(128); } }; }
        close() { this.state = 'closed'; return Promise.resolve(); }
      }
      class FakeRecognition {
        start() {
          setTimeout(() => {
            this.onstart?.();
            const item = [{ transcript: globalThis.__voiceText || '' }];
            item.isFinal = true;
            this.onresult?.({ results: [item] });
          }, 10);
        }
        stop() { setTimeout(() => this.onend?.(), 10); }
        abort() {}
      }
      globalThis.AudioContext = FakeAudioContext;
      globalThis.SpeechRecognition = FakeRecognition;
    });
    await page.route('**/__journal-voice-prefill*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `
      <meta charset="utf-8"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style><iframe src="/journal/index.html?debug=1"></iframe>
      <script>addEventListener('load',()=>{const frame=document.querySelector('iframe'),channel=new MessageChannel();frame.contentWindow.__voiceText=${JSON.stringify(words)};channel.port1.onmessage=({data})=>{if(data.method==='ai')return;channel.port1.postMessage({id:data.id,result:null});};frame.contentWindow.postMessage({type:'nava-journal-connect',initial:{category:${JSON.stringify(category)},locale:'zh',records:[],settings:{},nativePhotos:false}},location.origin,[channel.port2]);});</script>` }));
    await page.goto(`${target}/__journal-voice-prefill?category=${category}`);
    const frame = page.frames().find(item => item.url().includes('/journal/'));
    assert.ok(frame, `${category}: journal frame missing`);
    await frame.waitForSelector('#screen[data-scene="entry"]', { timeout: 30000 });
    await frame.waitForFunction(() => Boolean(window.FluffyDebug));
    await frame.evaluate(async () => { window.FluffyDebug.gesture.pressed = true; await window.FluffyDebug.beginSpeech(); });
    await frame.waitForTimeout(40);
    const started = Date.now();
    await frame.evaluate(() => { void window.FluffyDebug.releaseSpeech(); });
    await frame.waitForTimeout(250);
    if (process.env.NAVA_DEBUG_VOICE) console.log(category, await frame.evaluate(() => ({ phase: window.FluffyDebug.state.phase, form: window.FluffyDebug.rawForm(), text: window.FluffyDebug.speech.text() })));
    await frame.waitForFunction(expectedFields => window.FluffyDebug.state.phase === 'idle' && Object.entries(expectedFields).every(([key, value]) => String(document.querySelector(`#field-${key}`)?.value || '') === String(value)), expected, { timeout: 1000 });
    const elapsedMs = Date.now() - started;
    const actual = await frame.evaluate(() => window.FluffyDebug.rawForm());
    for (const [key, value] of Object.entries(expected)) assert.equal(String(actual[key]), String(value), `${category}.${key}`);
    assert.ok(elapsedMs < 1000, `${category} prefill took ${elapsedMs}ms`);
    await page.screenshot({ path: `${output}/${category}.png` });
    results.push({ category, elapsedMs, expected, actual, submitReadyBeforeAI: true });
    await page.close();
  }
  writeFileSync(`${output}/result.json`, JSON.stringify({ passed: true, networkAI: 'intentionally held pending', results }, null, 2));
  console.log(JSON.stringify(results.map(({ category, elapsedMs }) => ({ category, elapsedMs }))));
} finally {
  await browser.close();
}
