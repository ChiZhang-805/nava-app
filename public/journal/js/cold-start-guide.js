/** Coach the existing, authenticated form. A guide never submits or invents a record. */
export function installColdStartGuide(api) {
  const screen = document.getElementById('screen');
  const category = api.initial.category;
  const L = __fluffyModules['entry-i18n.js'];
  const t = (zh, en) => L.language() === 'en' ? en : zh;
  const preferenceKey = `fluffy-first-guide-${category}`;
  const prior = api.initial.records.some(record => record.category === category);
  const fieldSteps = {
    sleep: [['bedtime', '先看这里，记下昨晚的入睡时间。', 'Start here with the time you fell asleep.'], ['wakeTime', '再看醒来的时间，跨夜也会自动算好。', 'Next is your wake-up time. Overnight sleep is handled.'], ['quality', '最后，把醒来时的感受留给我。', 'Finally, tell me how you felt when you woke up.']],
    mood: [['mood', '先在这里写下此刻的心情，几个字就很好。', 'Start here with a few words about how you feel.'], ['reason', '如果愿意，也可以告诉我发生了什么。', 'If you feel like it, tell me what happened.']],
    food: [['photo', '先点亮这里，拍下或选择今天的食物。', 'Start here to capture or choose today’s food photo.'], ['meal', '然后告诉我，这是今天的哪一餐。', 'Then tell me which meal this was.'], ['foods', '也可以在这里写下吃了什么。', 'You can also write down what you ate here.'], ['portion', '最后记下大概的分量，不确定也没关系。', 'Lastly, add an approximate portion. It is okay not to be exact.']],
    sport: [['activity', '先从这里开始，走路也算认真运动。', 'Start here. A walk absolutely counts as movement.'], ['durationMinutes', '再记下真正运动了多少分钟。', 'Then add the minutes you actually spent moving.'], ['notes', '最后留一句感受、距离或训练内容。', 'Finish with how it felt, the distance, or what you did.']],
    face: [['photo', '先点亮这里，选择一张光线均匀的照片。', 'Start here with a clear, evenly lit photo.'], ['feeling', '再告诉我，你现在感觉怎么样。', 'Then tell me how you feel right now.'], ['eyeArea', '这里记录自己的观察，照片不会用于诊断。', 'Keep your own observation here. A photo is never a diagnosis.']],
    focus: [['task', '先选一件小事，比如安静读完一页。', 'Choose one small task, such as quietly reading one page.'], ['durationMinutes', '再选一段适合你的时间，我会安静陪着。', 'Choose a duration that feels right. I will stay quietly with you.']],
  };
  const steps = fieldSteps[category];
  if (!steps) return;

  let active = Boolean(api.initial.forceGuide || (!prior && !api.initial.settings[preferenceKey]));
  let index = 0, highlight = null, feedbackShown = false, typingTimer = 0, speechReady = false;
  const entryBubble = document.getElementById('entry-bubble');
  const actor = document.getElementById('actor-canvas');
  let previousBubble = entryBubble.innerHTML;

  const backdrop = document.createElement('div');
  backdrop.id = 'cold-guide-backdrop';
  backdrop.hidden = true;
  backdrop.setAttribute('aria-hidden', 'true');
  for (let part = 0; part < 4; part += 1) backdrop.append(document.createElement('i'));

  const coach = document.createElement('section');
  coach.id = 'cold-guide';
  coach.hidden = true;
  coach.tabIndex = 0;
  coach.setAttribute('role', 'button');
  coach.setAttribute('aria-label', t('小猫的新手引导', 'Cat’s getting-started guide'));
  const live = document.createElement('span');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  coach.append(live);
  screen.append(backdrop, coach);

  const clearTyping = () => { if (typingTimer) window.clearTimeout(typingTimer); typingTimer = 0; };
  const clearHighlight = () => { highlight?.classList.remove('cold-guide-target'); highlight = null; };
  const remember = async () => {
    try { await api.call('settings', { key: preferenceKey, value: true }); api.initial.settings[preferenceKey] = true; }
    catch { api.notify?.(t('引导进度暂时没有同步。', 'Guide progress could not be synced yet.')); }
  };
  const restoreBubble = () => {
    clearTyping();
    entryBubble.classList.remove('cold-guide-speech');
    entryBubble.innerHTML = previousBubble;
  };
  const end = () => {
    active = false;
    clearHighlight();
    restoreBubble();
    render();
    document.getElementById('confirm-entry')?.focus();
    void remember();
  };

  function targetForStep(step) {
    const input = step && (step[0] === 'photo' ? document.getElementById('photo-preview') : document.getElementById(`field-${step[0]}`));
    return input?.closest('.time-point, .field') || input || (index >= steps.length ? document.getElementById('confirm-entry') : null);
  }

  function positionSpotlight() {
    if (!active || coach.hidden || !highlight) return;
    const root = screen.getBoundingClientRect();
    const box = highlight.getBoundingClientRect();
    const padding = 8;
    const x = Math.max(0, box.left - root.left - padding);
    const y = Math.max(0, box.top - root.top - padding);
    const width = Math.min(root.width - x, box.width + padding * 2);
    const height = Math.min(root.height - y, box.height + padding * 2);
    backdrop.style.setProperty('--guide-x', `${x}px`);
    backdrop.style.setProperty('--guide-y', `${y}px`);
    backdrop.style.setProperty('--guide-width', `${width}px`);
    backdrop.style.setProperty('--guide-height', `${height}px`);
  }

  function speak(message) {
    clearTyping();
    speechReady = false;
    coach.dataset.ready = 'false';
    const prefix = `${index + 1}/${steps.length + 1} · `;
    const sentence = prefix + message;
    live.textContent = sentence;
    entryBubble.replaceChildren();
    entryBubble.classList.add('cold-guide-speech');
    let offset = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finish = () => {
      entryBubble.textContent = sentence;
      const hint = document.createElement('small');
      hint.textContent = t('轻触屏幕继续', 'Tap anywhere to continue');
      entryBubble.append(hint);
      speechReady = true;
      coach.dataset.ready = 'true';
      coach.setAttribute('aria-label', `${sentence} ${hint.textContent}`);
    };
    if (reduced) { finish(); return; }
    const type = () => {
      offset += 1;
      entryBubble.textContent = sentence.slice(0, offset);
      if (offset >= sentence.length) { finish(); return; }
      typingTimer = window.setTimeout(type, 34);
    };
    type();
  }

  function render() {
    const visible = active && screen.dataset.scene === 'entry';
    coach.hidden = !visible;
    backdrop.hidden = !visible;
    screen.classList.toggle('cold-guiding', visible);
    entryBubble.classList.toggle('cold-guide-speaker', visible);
    actor.classList.toggle('cold-guide-cat', visible);
    clearHighlight();
    if (!visible) return;
    const step = steps[index];
    highlight = targetForStep(step);
    highlight?.classList.add('cold-guide-target');
    const message = step
      ? t(step[1], step[2])
      : category === 'focus'
        ? t('最后从这里开始专注。计时结束后，我会替你记下真实时长。', 'Begin focus here. When time is up, I will save the actual duration.')
        : t('最后从这里检查记录。等我写好，再由你亲自确认保存。', 'Review your entry here. After I write it up, you will confirm before anything is saved.');
    speak(message);
    highlight?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    requestAnimationFrame(() => requestAnimationFrame(positionSpotlight));
  }

  function advance() {
    if (!active || !speechReady) return;
    if (index >= steps.length) { end(); return; }
    index += 1;
    render();
  }

  coach.addEventListener('click', advance);
  coach.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    advance();
  });
  screen.addEventListener('scroll', positionSpotlight, true);
  window.addEventListener('resize', positionSpotlight);
  screen.addEventListener('click', event => {
    if (event.target.closest('#entry-more')) queueMicrotask(() => {
      const menu = document.getElementById('entry-menu');
      if (!menu || menu.hidden || menu.querySelector('[data-action="guide"]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.action = 'guide';
      button.setAttribute('role', 'menuitem');
      button.textContent = t('新手引导', 'Getting started');
      button.onclick = () => {
        menu.hidden = true;
        document.getElementById('entry-more').setAttribute('aria-expanded', 'false');
        previousBubble = entryBubble.innerHTML;
        active = true;
        index = 0;
        render();
        coach.focus({ preventScroll: true });
      };
      menu.append(button);
    });
  });
  const observer = new MutationObserver(() => {
    if (screen.dataset.scene === 'entry') render();
    if (!feedbackShown && screen.dataset.scene === 'review' && api.firstSaved) { feedbackShown = true; api.call('first-feedback').catch(() => {}); }
  });
  observer.observe(screen, { attributes: true, attributeFilter: ['data-scene'] });
  render();
  if (active) coach.focus({ preventScroll: true });
  window.addEventListener('pagehide', () => {
    clearTyping();
    observer.disconnect();
    window.removeEventListener('resize', positionSpotlight);
  }, { once: true });
}
