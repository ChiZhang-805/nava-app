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
      { key: 'sleepRange', kind: 'time-range', fields: ['bedtime', 'wakeTime'], zh: '填好睡眠起止时间。\n跨夜也会自动算好。', en: 'Add your sleep and wake times.\nOvernight sleep is handled.' },
      { key: 'quality', field: 'quality', zh: '再写下醒来时的感受。', en: 'Now add how you felt on waking.' },
    ],
    mood: [
      { key: 'mood', field: 'mood', zh: '先写下此刻的心情。\n几个字就很好。', en: 'Start with how you feel now.\nA few words are enough.' },
      { key: 'reason', field: 'reason', zh: '再写下发生了什么。', en: 'Now add what happened.' },
    ],
    food: [
      { key: 'photo', kind: 'photo', zh: '先选择今天的食物照片。', en: 'Choose today’s food photo first.' },
      { key: 'meal', field: 'meal', zh: '选一选，这是今天的哪一餐。', en: 'Choose which meal this was.' },
      { key: 'foods', field: 'foods', zh: '再写下吃了什么。', en: 'Now add what you ate.' },
      { key: 'portion', field: 'portion', zh: '最后写下大概份量。\n不确定也没关系。', en: 'Finally, add an approximate portion.\nIt is okay to be unsure.' },
    ],
    sport: [
      { key: 'activity', field: 'activity', zh: '先写下运动项目。\n走路也算认真运动。', en: 'Start with the activity.\nA walk absolutely counts.' },
      { key: 'durationMinutes', field: 'durationMinutes', zh: '再填写实际运动时间。', en: 'Now add the actual duration.' },
      { key: 'notes', field: 'notes', zh: '最后留一句感受或训练内容。', en: 'Finish with how it felt or what you did.' },
    ],
    face: [
      { key: 'photo', kind: 'photo', zh: '先选择一张光线均匀的照片。', en: 'Choose a clearly lit photo first.' },
      { key: 'feeling', field: 'feeling', zh: '再写下现在的感受。', en: 'Now add how you feel.' },
      { key: 'eyeArea', field: 'eyeArea', zh: '记录自己的眼周观察。\n照片不会用于诊断。', en: 'Add your own eye-area observation.\nThe photo is not a diagnosis.' },
    ],
    focus: [
      { key: 'task', field: 'task', zh: '先写下一件想专注的小事。', en: 'Write one small thing to focus on.' },
      { key: 'durationMinutes', field: 'durationMinutes', zh: '再选一段适合你的时间。', en: 'Now choose a duration that suits you.' },
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
  const entryBubble = document.getElementById('entry-bubble');
  const actor = document.getElementById('actor-canvas');
  let previousBubble = entryBubble.innerHTML;

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
    zh: category === 'focus' ? '都准备好了。\n轻触下方按钮开始专注。' : '都准备好了。\n轻触下方按钮检查记录。',
    en: category === 'focus' ? 'You are ready.\nTap the button below to begin.' : 'You are ready.\nTap the button below to review.'
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
    highlights.forEach(target => target.classList.remove('cold-guide-target'));
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
    entryBubble.classList.remove('cold-guide-speaker');
    actor.classList.remove('cold-guide-cat');
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
    const title = field?.querySelector('.field-name');
    const control = input.closest('.input-wrap') || (input.type === 'hidden' ? field?.querySelector('.choice-group') : input);
    return [...new Set([title, control].filter(Boolean))];
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
    entryBubble.textContent = spokenMessage;
    const complete = stepComplete();
    if (complete) {
      const hint = document.createElement('small');
      hint.textContent = isFinalStep()
        ? t('轻触下方按钮继续', 'Tap the button below to continue')
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
    spotlightSvg.setAttribute('viewBox', `0 0 ${designWidth} ${designHeight}`);
    maskBase.setAttribute('width', String(designWidth));
    maskBase.setAttribute('height', String(designHeight));
    shade.setAttribute('width', String(designWidth));
    shade.setAttribute('height', String(designHeight));
    const holes = highlights.flatMap(target => {
      const box = target.getBoundingClientRect();
      if (!box.width || !box.height) return [];
      const left = (box.left - root.left) / scaleX;
      const top = (box.top - root.top) / scaleY;
      const x = Math.max(0, left);
      const y = Math.max(0, top);
      const width = Math.min(designWidth - x, box.width / scaleX);
      const height = Math.min(designHeight - y, box.height / scaleY);
      const hole = document.createElementNS(svgNamespace, 'rect');
      hole.dataset.guideHole = target.matches('.field-name, .field-header') ? 'label' : target.matches('.time-range-field') ? 'group' : 'control';
      hole.setAttribute('x', x.toFixed(2));
      hole.setAttribute('y', y.toFixed(2));
      hole.setAttribute('width', Math.max(0, width).toFixed(2));
      hole.setAttribute('height', Math.max(0, height).toFixed(2));
      hole.setAttribute('rx', String(Math.min(target.matches('.field-name, .field-header') ? 5 : 15, height / 2)));
      hole.setAttribute('fill', '#000');
      return [hole];
    });
    maskHoles.replaceChildren(...holes);
    backdrop.dataset.guideHoles = String(holes.length);
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
    entryBubble.classList.toggle('cold-guide-speaker', visible);
    actor.classList.toggle('cold-guide-cat', visible);
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
    highlights.forEach(target => target.classList.add('cold-guide-target'));
    speak(t(step.zh, step.en));
    highlights.at(-1)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    requestAnimationFrame(() => requestAnimationFrame(positionSpotlight));
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
  screen.addEventListener('scroll', positionSpotlight, true);
  window.addEventListener('resize', positionSpotlight);

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
      window.removeEventListener('resize', positionSpotlight);
    }
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted || !active || screen.dataset.scene !== 'entry') return;
    if (!speechReady && finishSpeech) finishSpeech();
    updateGuideState();
    positionSpotlight();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && active && !speechReady && finishSpeech) finishSpeech();
  });
}
