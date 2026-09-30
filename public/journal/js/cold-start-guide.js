/** Coach the existing authenticated form without submitting or inventing a record. */
export function installColdStartGuide(api) {
  const screen = document.getElementById('screen');
  const category = api.initial.category;
  const L = __fluffyModules['entry-i18n.js'];
  const t = (zh, en) => L.language() === 'en' ? en : zh;
  const preferenceKey = `fluffy-first-guide-${category}`;
  const prior = api.initial.records.some(record => record.category === category);
  const fieldSteps = {
    sleep: [
      { key: 'sleepRange', kind: 'time-range', fields: ['bedtime', 'wakeTime'], zh: '填好睡眠起止时间。\n跨夜也会自动算好。', en: 'Set sleep and wake.\nOvernight is okay.' },
      { key: 'quality', field: 'quality', zh: '再写下醒来时的感受。', en: 'How did you wake up?' },
      { key: 'notes', field: 'notes', zh: '最后留一句话备注。', en: 'Add one short note.' },
    ],
    mood: [
      { key: 'mood', field: 'mood', zh: '先写下此刻的心情。\n几个字就很好。', en: 'How do you feel now?' },
      { key: 'reason', field: 'reason', zh: '再写下发生了什么。', en: 'What happened?' },
    ],
    food: [
      { key: 'photo', kind: 'photo', zh: '先选择今天的食物照片。', en: 'Choose a food photo.' },
      { key: 'meal', field: 'meal', zh: '选一选，这是今天的哪一餐。', en: 'Which meal was it?' },
      { key: 'foods', field: 'foods', zh: '再写下吃了什么。', en: 'What did you eat?' },
      { key: 'portion', field: 'portion', zh: '最后写下大概份量。\n不确定也没关系。', en: 'About how much?' },
    ],
    sport: [
      { key: 'activity', field: 'activity', zh: '先写下运动项目。\n走路也算认真运动。', en: 'What was the activity?' },
      { key: 'durationMinutes', field: 'durationMinutes', zh: '再填写实际运动时间。', en: 'How long did you move?' },
      { key: 'notes', field: 'notes', zh: '最后留一句感受或训练内容。', en: 'Add one short note.' },
    ],
    face: [
      { key: 'photo', kind: 'photo', zh: '先选择一张光线均匀的照片。', en: 'Choose a clear photo.' },
      { key: 'feeling', field: 'feeling', zh: '再写下现在的感受。', en: 'How do you feel?' },
      { key: 'eyeArea', field: 'eyeArea', zh: '记录自己的眼周观察。\n照片不会用于诊断。', en: 'Observe your eye area.\nNot a diagnosis.' },
    ],
    focus: [
      { key: 'task', field: 'task', zh: '先写下一件想专注的小事。', en: 'What will you focus on?' },
      { key: 'durationMinutes', field: 'durationMinutes', zh: '再选一段适合你的时间。', en: 'Choose a duration.' },
    ],
  };
  const steps = fieldSteps[category];
  if (!steps) return;

  let active = Boolean(api.initial.forceGuide || (!prior && !api.initial.settings[preferenceKey]));
  let index = 0;
  let highlights = [];
  let feedbackShown = false;
  let typingTimer = 0;
  let speechWatchdog = 0;
  let speechReady = false;
  let finishSpeech = null;
  let speechEpoch = 0;
  let spokenMessage = '';
  let finishing = false;
  let spotlightFrame = 0;
  let hostGuideState = null;
  const entryBubble = document.getElementById('entry-bubble');
  const actor = document.getElementById('actor-canvas');
  let previousBubble = entryBubble.innerHTML;
  const highlightObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => scheduleSpotlight()) : null;
  const syncHostGuideState = visible => {
    if (hostGuideState === visible) return;
    hostGuideState = visible;
    api.call('guide-state', { active: visible }).catch(() => {});
  };

  const backdrop = document.createElement('div');
  backdrop.id = 'cold-guide-backdrop';
  backdrop.hidden = true;
  backdrop.setAttribute('aria-hidden', 'true');
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const maskId = `cold-guide-cutouts-${category}`;
  const spotlightSvg = document.createElementNS(svgNamespace, 'svg');
  const definitions = document.createElementNS(svgNamespace, 'defs');
  const spotlightMask = document.createElementNS(svgNamespace, 'mask');
  const maskBase = document.createElementNS(svgNamespace, 'rect');
  const maskHoles = document.createElementNS(svgNamespace, 'g');
  const shade = document.createElementNS(svgNamespace, 'rect');
  spotlightMask.id = maskId;
  spotlightMask.setAttribute('maskUnits', 'userSpaceOnUse');
  spotlightMask.setAttribute('maskContentUnits', 'userSpaceOnUse');
  maskBase.setAttribute('x', '0');
  maskBase.setAttribute('y', '0');
  maskBase.setAttribute('fill', '#fff');
  spotlightMask.append(maskBase, maskHoles);
  definitions.append(spotlightMask);
  shade.setAttribute('x', '0');
  shade.setAttribute('y', '0');
  shade.setAttribute('fill', '#102a3b');
  shade.setAttribute('fill-opacity', '.74');
  shade.setAttribute('mask', `url(#${maskId})`);
  spotlightSvg.append(definitions, shade);
  backdrop.append(spotlightSvg);

  const coach = document.createElement('section');
  coach.id = 'cold-guide';
  coach.hidden = true;
  coach.tabIndex = -1;
  coach.setAttribute('role', 'status');
  coach.setAttribute('aria-label', t('小猫的新手引导', 'Cat’s getting-started guide'));
  const live = document.createElement('span');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  coach.append(live);
  screen.append(backdrop, coach);

  const finalStep = () => ({
    key: 'confirm',
    kind: 'confirm',
    zh: category === 'focus' ? '准备好了。' : '都填好了。',
    en: category === 'focus' ? 'Ready to focus.' : 'Everything is filled in.'
  });
  const currentStep = () => steps[index] || finalStep();
  const isFinalStep = () => index >= steps.length;

  const clearTyping = () => {
    if (typingTimer) window.clearTimeout(typingTimer);
    if (speechWatchdog) window.clearTimeout(speechWatchdog);
    typingTimer = 0;
    speechWatchdog = 0;
  };
  const clearHighlight = () => {
    highlightObserver?.disconnect();
    highlights.forEach(target => target.classList.remove('cold-guide-target', 'cold-guide-field-group'));
    highlights = [];
    maskHoles.replaceChildren();
    backdrop.dataset.guideHoles = '0';
  };
  const remember = async () => {
    if (api.initial.forceGuide) return;
    try {
      await api.call('settings', { key: preferenceKey, value: true });
      api.initial.settings[preferenceKey] = true;
    } catch {
      api.notify?.(t('引导进度暂时没有同步。', 'Guide progress could not be synced yet.'));
    }
  };
  const clearGuideState = () => {
    delete screen.dataset.guideMotion;
    delete screen.dataset.guideStep;
    delete screen.dataset.guideComplete;
  };
  const restoreBubble = () => {
    clearTyping();
    speechEpoch += 1;
    finishSpeech = null;
    speechReady = false;
    spokenMessage = '';
    coach.dataset.ready = 'false';
    coach.dataset.speechReady = 'false';
    coach.dataset.complete = 'false';
    coach.tabIndex = -1;
    coach.setAttribute('role', 'status');
    entryBubble.classList.remove('cold-guide-speech');
    entryBubble.innerHTML = previousBubble;
    clearGuideState();
  };
  const failOpen = error => {
    if (error) console.error('Cold-start guide recovered from an error.', error);
    active = false;
    clearHighlight();
    restoreBubble();
    coach.hidden = true;
    backdrop.hidden = true;
    screen.classList.remove('cold-guiding');
    document.documentElement.classList.remove('cold-guiding-root');
    document.body.classList.remove('cold-guiding-root');
    document.documentElement.style.removeProperty('background-color');
    document.body.style.removeProperty('background-color');
    entryBubble.classList.remove('cold-guide-speaker');
    actor.classList.remove('cold-guide-cat');
    syncHostGuideState(false);
  };
  const end = async activationTarget => {
    if (finishing) return;
    finishing = true;
    active = false;
    clearHighlight();
    restoreBubble();
    safeRender();
    await remember();
    finishing = false;
    activationTarget?.click();
  };

  function targetsForStep(step) {
    if (!step) return [];
    if (step.kind === 'confirm') return [document.getElementById('confirm-entry')].filter(Boolean);
    if (step.kind === 'photo') return [document.getElementById('photo-preview')].filter(Boolean);
    if (step.kind === 'time-range') return [document.querySelector('.time-range-field')].filter(Boolean);
    const input = document.getElementById(`field-${step.field}`);
    if (!input) return [];
    const field = input.closest('.field');
    return [field].filter(Boolean);
  }

  function fieldSpotlightParts(field) {
    const input = field?.querySelector('input, textarea, select');
    const control = field?.querySelector('.time-range-line') || input?.closest('.input-wrap') || (input?.type === 'hidden' ? field.querySelector('.choice-group') : input);
    return [field?.querySelector('.field-header'), control].filter(Boolean);
  }

  function unionBounds(nodes) {
    const boxes = nodes.map(node => node.getBoundingClientRect()).filter(box => box.width && box.height);
    if (!boxes.length) return null;
    return {
      left: Math.min(...boxes.map(box => box.left)),
      top: Math.min(...boxes.map(box => box.top)),
      right: Math.max(...boxes.map(box => box.right)),
      bottom: Math.max(...boxes.map(box => box.bottom)),
    };
  }

  function spotlightBounds(target) {
    const isFieldGroup = target.matches('.cold-guide-field-group,.time-range-field');
    if (!isFieldGroup) return unionBounds([target]);
    const content = unionBounds(fieldSpotlightParts(target));
    const card = document.getElementById('record-card')?.getBoundingClientRect();
    if (!content || !card) return content;

    const fields = [...document.querySelectorAll('#entry-form .field')]
      .filter(field => field.getClientRects().length && unionBounds(fieldSpotlightParts(field)));
    const fieldIndex = fields.indexOf(target);
    const previous = fieldIndex > 0 ? unionBounds(fieldSpotlightParts(fields[fieldIndex - 1])) : null;
    const next = fieldIndex >= 0 && fieldIndex < fields.length - 1 ? unionBounds(fieldSpotlightParts(fields[fieldIndex + 1])) : null;
    const adjacentGap = next && next.top > content.bottom
      ? next.top - content.bottom
      : previous && content.top > previous.bottom
        ? content.top - previous.bottom
        : 13;
    const verticalPadding = Math.max(4, Math.min(10, adjacentGap / 2));
    const leftGap = Math.max(0, content.left - card.left);
    const rightGap = Math.max(0, card.right - content.right);

    return {
      left: content.left - leftGap / 2,
      top: content.top - verticalPadding,
      right: content.right + rightGap / 2,
      bottom: content.bottom + verticalPadding,
    };
  }

  function stepComplete(step = currentStep()) {
    if (!step) return false;
    if (step.kind === 'confirm') return true;
    if (step.kind === 'photo') return Boolean(document.getElementById('photo-preview')?.classList.contains('has-image'));
    if (step.kind === 'time-range') return step.fields.every(key => /^\d{2}:\d{2}$/.test(document.getElementById(`field-${key}`)?.value || ''));
    const input = document.getElementById(`field-${step.field}`);
    if (!input) return false;
    const value = String(input.value || '').trim();
    if (!value) return false;
    if (step.field === 'durationMinutes') return Number.isFinite(Number(value)) && Number(value) > 0;
    return input.getAttribute('aria-invalid') !== 'true';
  }

  function paintFinishedSpeech() {
    if (!speechReady) return;
    const complete = stepComplete();
    entryBubble.textContent = complete && !isFinalStep() ? t('写好了。', 'Done.') : spokenMessage;
    if (complete) {
      const hint = document.createElement('small');
      hint.textContent = isFinalStep()
        ? category === 'focus'
          ? t('轻触“开始专注”', 'Tap “Start focus”')
          : t('轻触“完成并继续”', 'Tap “Complete and continue”')
        : t('轻触屏幕继续', 'Tap anywhere to continue');
      entryBubble.append(hint);
    }
    coach.setAttribute('aria-label', `${spokenMessage}${complete ? ` ${entryBubble.querySelector('small')?.textContent || ''}` : ''}`);
  }

  function updateGuideState() {
    if (!active || coach.hidden) return;
    const complete = stepComplete();
    const ready = speechReady && complete;
    coach.dataset.complete = String(complete);
    coach.dataset.speechReady = String(speechReady);
    coach.dataset.ready = String(ready);
    coach.dataset.step = currentStep().key;
    coach.tabIndex = ready ? 0 : -1;
    coach.setAttribute('role', ready ? 'button' : 'status');
    screen.dataset.guideStep = currentStep().key;
    screen.dataset.guideComplete = String(complete);
    screen.dataset.guideMotion = !speechReady ? 'speaking' : ready ? 'ready' : 'waiting';
    if (speechReady) paintFinishedSpeech();
  }

  function positionSpotlight() {
    if (!active || coach.hidden || !highlights.length) return;
    const root = screen.getBoundingClientRect();
    const designWidth = screen.clientWidth || 393;
    const designHeight = screen.clientHeight || 852;
    const scaleX = root.width / designWidth || 1;
    const scaleY = root.height / designHeight || scaleX;
    spotlightSvg.setAttribute('viewBox', `-2 -2 ${designWidth + 4} ${designHeight + 4}`);
    maskBase.setAttribute('x', '-2');
    maskBase.setAttribute('y', '-2');
    maskBase.setAttribute('width', String(designWidth + 4));
    maskBase.setAttribute('height', String(designHeight + 4));
    shade.setAttribute('x', '-2');
    shade.setAttribute('y', '-2');
    shade.setAttribute('width', String(designWidth + 4));
    shade.setAttribute('height', String(designHeight + 4));
    const holes = highlights.flatMap(target => {
      const box = spotlightBounds(target);
      if (!box) return [];
      const left = (box.left - root.left) / scaleX;
      const top = (box.top - root.top) / scaleY;
      const x = Math.max(0, left);
      const y = Math.max(0, top);
      const width = Math.min(designWidth - x, (box.right - box.left) / scaleX);
      const height = Math.min(designHeight - y, (box.bottom - box.top) / scaleY);
      const hole = document.createElementNS(svgNamespace, 'rect');
      hole.dataset.guideHole = target.matches('.cold-guide-field-group') ? 'field-group' : target.matches('.time-range-field') ? 'time-group' : 'control';
      hole.setAttribute('x', x.toFixed(2));
      hole.setAttribute('y', y.toFixed(2));
      hole.setAttribute('width', Math.max(0, width).toFixed(2));
      hole.setAttribute('height', Math.max(0, height).toFixed(2));
      const computedRadius = Number.parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0;
      const radius = target.id === 'confirm-entry'
        ? Math.min(height / 2, computedRadius || height / 2)
        : Math.min(target.matches('.cold-guide-field-group,.time-range-field') ? 13 : computedRadius || 15, height / 2);
      hole.setAttribute('rx', String(radius));
      hole.setAttribute('fill', '#000');
      return [hole];
    });
    maskHoles.replaceChildren(...holes);
    backdrop.dataset.guideHoles = String(holes.length);
  }

  function scheduleSpotlight() {
    positionSpotlight();
    if (spotlightFrame) cancelAnimationFrame(spotlightFrame);
    spotlightFrame = requestAnimationFrame(() => {
      spotlightFrame = 0;
      requestAnimationFrame(positionSpotlight);
    });
  }

  function speak(message) {
    clearTyping();
    const epoch = ++speechEpoch;
    speechReady = false;
    spokenMessage = message;
    coach.dataset.ready = 'false';
    coach.dataset.speechReady = 'false';
    live.textContent = message;
    entryBubble.replaceChildren();
    entryBubble.classList.add('cold-guide-speech');
    let offset = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finish = () => {
      if (epoch !== speechEpoch || speechReady) return;
      try {
        clearTyping();
        speechReady = true;
        finishSpeech = null;
        updateGuideState();
      } catch (error) {
        failOpen(error);
      }
    };
    finishSpeech = finish;
    updateGuideState();
    if (reduced) { finish(); return; }
    const type = () => {
      if (epoch !== speechEpoch) return;
      try {
        offset += 1;
        entryBubble.textContent = message.slice(0, offset);
        if (offset >= message.length) { finish(); return; }
        typingTimer = window.setTimeout(type, 34);
      } catch (error) {
        failOpen(error);
      }
    };
    type();
    speechWatchdog = window.setTimeout(finish, Math.max(1800, message.length * 50 + 600));
  }

  function render() {
    const visible = active && screen.dataset.scene === 'entry';
    coach.hidden = !visible;
    backdrop.hidden = !visible;
    screen.classList.toggle('cold-guiding', visible);
    document.documentElement.classList.toggle('cold-guiding-root', visible);
    document.body.classList.toggle('cold-guiding-root', visible);
    if (visible) {
      document.documentElement.style.setProperty('background-color', '#203747', 'important');
      document.body.style.setProperty('background-color', '#203747', 'important');
    } else {
      document.documentElement.style.removeProperty('background-color');
      document.body.style.removeProperty('background-color');
    }
    entryBubble.classList.toggle('cold-guide-speaker', visible);
    actor.classList.toggle('cold-guide-cat', visible);
    syncHostGuideState(visible);
    clearHighlight();
    if (!visible) {
      clearTyping();
      finishSpeech = null;
      speechReady = false;
      coach.dataset.ready = 'false';
      coach.dataset.speechReady = 'false';
      clearGuideState();
      return;
    }
    const step = currentStep();
    highlights = targetsForStep(step);
    highlights.forEach(target => {
      target.classList.add('cold-guide-target');
      if (!step.kind) target.classList.add('cold-guide-field-group');
    });
    highlightObserver?.observe(screen);
    highlights.forEach(target => highlightObserver?.observe(target));
    speak(t(step.zh, step.en));
    highlights.at(-1)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    scheduleSpotlight();
  }

  function advance() {
    if (!active || !speechReady || !stepComplete() || isFinalStep()) return;
    index += 1;
    safeRender();
  }

  function safeRender() {
    try { render(); }
    catch (error) { failOpen(error); }
  }

  function isAllowedInteraction(target, step = currentStep()) {
    if (!(target instanceof Element)) return false;
    if (step.kind === 'time-range' && target.closest('.time-range-field,.time-options')) return true;
    if (step.kind === 'photo' && target.closest('#photo-preview,#sheet-layer')) return true;
    return highlights.some(node => node === target || node.contains(target));
  }

  function blockEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function captureGuideActivation(event) {
    if (!active || coach.hidden || screen.dataset.scene !== 'entry') return;
    const step = currentStep();
    if (isAllowedInteraction(event.target, step)) {
      if (step.kind !== 'confirm') return;
      if (!speechReady) { blockEvent(event); return; }
      const activationTarget = event.target.closest('#confirm-entry');
      blockEvent(event);
      void end(activationTarget);
      return;
    }
    blockEvent(event);
    if (speechReady && stepComplete() && !isFinalStep()) advance();
  }

  function captureGuidePress(event) {
    if (!active || coach.hidden || screen.dataset.scene !== 'entry' || !isFinalStep()) return;
    const step = currentStep();
    if (!isAllowedInteraction(event.target, step)) return;
    blockEvent(event);
    if (!speechReady) return;
    const activationTarget = event.target.closest('#confirm-entry');
    void end(activationTarget);
  }

  coach.addEventListener('click', event => {
    event.preventDefault();
    advance();
  });
  coach.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    advance();
  });
  screen.addEventListener('pointerdown', captureGuidePress, true);
  screen.addEventListener('click', captureGuideActivation, true);
  screen.addEventListener('input', updateGuideState, true);
  screen.addEventListener('change', updateGuideState, true);
  screen.addEventListener('scroll', scheduleSpotlight, true);
  window.addEventListener('resize', scheduleSpotlight);

  const photoPreview = document.getElementById('photo-preview');
  const photoObserver = photoPreview ? new MutationObserver(() => updateGuideState()) : null;
  photoObserver?.observe(photoPreview, { attributes: true, attributeFilter: ['class'], childList: true });

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
        safeRender();
      };
      menu.append(button);
    });
  });
  let observedScene = screen.dataset.scene;
  const observer = new MutationObserver(() => {
    const scene = screen.dataset.scene;
    if (scene !== observedScene) {
      observedScene = scene;
      safeRender();
    }
    if (!feedbackShown && scene === 'review' && api.firstSaved) {
      feedbackShown = true;
      api.call('first-feedback').catch(() => {});
    }
  });
  observer.observe(screen, { attributes: true, attributeFilter: ['data-scene'] });
  safeRender();
  window.addEventListener('pagehide', event => {
    clearTyping();
    if (!event.persisted) {
      observer.disconnect();
      photoObserver?.disconnect();
      highlightObserver?.disconnect();
      window.removeEventListener('resize', scheduleSpotlight);
    }
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted || !active || screen.dataset.scene !== 'entry') return;
    if (!speechReady && finishSpeech) finishSpeech();
    updateGuideState();
    scheduleSpotlight();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && active && !speechReady && finishSpeech) finishSpeech();
  });
}
