/** Coach the existing, authenticated form. A guide never submits or invents a record. */
export function installColdStartGuide(api) {
  const screen = document.getElementById('screen');
  const category = api.initial.category;
  const L = __fluffyModules['entry-i18n.js'];
  const t = (zh, en) => L.language() === 'en' ? en : zh;
  const preferenceKey = `fluffy-first-guide-${category}`;
  const prior = api.initial.records.some(r => r.category === category);
  const fieldSteps = {
    sleep: [['bedtime', '先点这里，记下昨晚的入睡时间。', 'Tap here to enter when you fell asleep.'], ['wakeTime', '再选醒来的时间，跨夜会自动计算。', 'Now enter when you woke up. Overnight times are supported.'], ['quality', '最后，说说醒来的感受。', 'How did you feel when you woke up?']],
    mood: [['mood', '先写下此刻的心情，几个字就可以。', 'Start with a few words about how you feel.'], ['reason', '愿意的话，说说发生了什么。也可以跳过。', 'Add what happened, if you like. This is optional.']],
    food: [['meal', '先选这是哪一餐。', 'First, choose which meal this was.'], ['foods', '写下吃了什么。也可以用相机，识别后记得确认。', 'Enter what you ate, or use the camera and review its suggestions.'], ['portion', '大概吃了多少？不确定可以先留空。', 'About how much? You can leave this blank if unsure.']],
    sport: [['activity', '走路也算。先写今天做了什么运动。', 'A walk counts too. Enter your activity.'], ['durationMinutes', '记下实际运动的分钟数。', 'Enter the minutes you actually spent moving.'], ['notes', '再记一句感受、距离或训练内容。', 'Add how you felt, the distance, or what you did.']],
    face: [['feeling', '先说说自己的感受。', 'Start with how you feel.'], ['eyeArea', '可手动观察，也可拍照。注意光线；照片不能作诊断。', 'Write an observation or take a well-lit photo. Photos cannot diagnose health.']],
    focus: [['task', '先选一件小事，比如读完一页。', 'Choose one small task, such as reading a page.'], ['durationMinutes', '选一段适合你的时间，开始后我会安静陪着。', 'Choose a duration. I will stay quiet while you focus.']],
  };
  const steps = fieldSteps[category];
  if (!steps) return;
  let active = Boolean(api.initial.forceGuide || (!prior && !api.initial.settings[preferenceKey]));
  let index = -1, highlight, feedbackShown = false;
  const coach = document.createElement('section'); coach.id = 'cold-guide'; coach.hidden = true;
  coach.setAttribute('aria-label', t('小猫的新手引导', 'Cat’s getting-started guide'));
  const heading = document.createElement('strong'), copy = document.createElement('p'), actions = document.createElement('div');
  const previous = document.createElement('button'), next = document.createElement('button'), skip = document.createElement('button');
  previous.type = next.type = skip.type = 'button'; next.id = 'cold-guide-next'; skip.id = 'cold-guide-skip';
  heading.setAttribute('aria-live', 'polite'); actions.append(previous, next, skip); coach.append(heading, copy, actions); screen.append(coach);
  const clear = () => { highlight?.classList.remove('cold-guide-target'); highlight = null; };
  const remember = async () => {
    try { await api.call('settings', { key: preferenceKey, value: true }); api.initial.settings[preferenceKey] = true; }
    catch { api.notify?.(t('引导偏好未同步，下次仍可重新打开。', 'Guide preference was not synced. You can reopen it.')); }
  };
  const end = () => { active = false; clear(); render(); void remember(); };
  function render() {
    const scene = screen.dataset.scene;
    coach.hidden = !active || scene !== 'entry';
    screen.classList.toggle('cold-guiding', !coach.hidden);
    clear();
    if (coach.hidden) return;
    heading.textContent = index < 0 ? t('第一次，我陪你记。', 'Let’s try your first record.') : `${t('小猫引导', 'Cat’s guide')} · ${Math.min(index + 1, steps.length + 1)}/${steps.length + 1}`;
    const step = steps[index];
    copy.textContent = index < 0 ? t('跟着提示，试着操作真正的记录页。可以随时跳过。', 'Try the real controls with a few gentle pointers. You can skip anytime.') : step ? t(step[1], step[2]) : category === 'focus' ? t('点下方按钮开始专注。计时结束后才保存实际时长。', 'Use the button below to begin. Actual time is saved when the session ends.') : t('点下方按钮检查记录。小猫写好后，再确认保存。', 'Use the button below to review. Confirm after the cat finishes writing to save.');
    previous.textContent = t('上一步', 'Back'); previous.hidden = index < 0;
    next.textContent = index < 0 ? t('带我试试', 'Show me') : step ? t('下一步', 'Next') : t('我来试试', 'Let me try');
    skip.textContent = t('跳过引导', 'Skip guide');
    const input = step && document.getElementById(`field-${step[0]}`);
    highlight = input?.closest('.time-point, .field') || (index >= steps.length ? document.getElementById('confirm-entry') : null);
    highlight?.classList.add('cold-guide-target');
    next.disabled = Boolean(input?.required && !String(input.value).trim());
    if (category === 'focus' && step?.[0] === 'durationMinutes') {
      if (!coach.querySelector('.cold-focus-presets')) {
        const presets = document.createElement('div'); presets.className = 'cold-focus-presets';
        for (const minutes of [15, 25, 45, 60]) { const button = document.createElement('button'); button.type = 'button'; button.textContent = `${minutes}`; button.onclick = () => { const duration = document.getElementById('field-durationMinutes'); duration.value = String(minutes); duration.dispatchEvent(new Event('input', { bubbles: true })); }; presets.append(button); }
        coach.insertBefore(presets, actions);
      }
    } else coach.querySelector('.cold-focus-presets')?.remove();
  }
  previous.onclick = () => { index--; render(); };
  next.onclick = () => { if (index >= steps.length) { end(); document.getElementById('confirm-entry').focus(); } else { index++; render(); highlight?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } };
  skip.onclick = end;
  screen.addEventListener('input', render);
  screen.addEventListener('change', render);
  screen.addEventListener('click', event => {
    if (event.target.closest('#entry-more')) queueMicrotask(() => {
      const menu = document.getElementById('entry-menu');
      if (!menu || menu.hidden || menu.querySelector('[data-action="guide"]')) return;
      const button = document.createElement('button'); button.type = 'button'; button.dataset.action = 'guide'; button.setAttribute('role', 'menuitem'); button.textContent = t('新手引导', 'Getting started');
      button.onclick = () => { menu.hidden = true; document.getElementById('entry-more').setAttribute('aria-expanded', 'false'); active = true; index = -1; render(); next.focus(); };
      menu.append(button);
    });
  });
  const observer = new MutationObserver(() => {
    render();
    if (!feedbackShown && screen.dataset.scene === 'review' && api.firstSaved) { feedbackShown = true; api.call('first-feedback').catch(() => {}); }
  });
  observer.observe(screen, { attributes: true, attributeFilter: ['data-scene'] });
  render();
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
}
