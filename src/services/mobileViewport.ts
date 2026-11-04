/** iOS can resize only the visual viewport when its software keyboard opens.
 * Keep the mobile shell inside that viewport without disabling user zoom.
 * Text controls are kept at 16px in mobile-viewport.css so WebKit does not
 * apply its separate focus zoom in the first place.
 */
export function installMobileViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  const root = document.documentElement;
  let frame = 0;
  let previousHeight = 0;
  const editable = () => {
    const element = document.activeElement;
    return element instanceof HTMLElement && element.matches(
      'textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="range"]):not([type="color"])',
    ) ? element : null;
  };
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const input = editable();
      // Do not gate keyboard handling on visualViewport.scale. WebKit can
      // report a transient scale above 1 while focusing a control; ignoring
      // that state leaves the focused field and shell out of sync.
      const active = window.innerWidth < 700
        && window.innerHeight - viewport.height > 120;
      // Keep the smaller shell while tapping a toolbar button above an open
      // keyboard; focusout alone must not move that button during the tap.
      const open = active && Boolean(input || root.dataset.keyboardOpen === 'true');
      if (!open) {
        delete root.dataset.keyboardOpen;
        delete root.dataset.viewportScale;
        root.style.removeProperty('--nava-visible-height');
        previousHeight = 0;
        return;
      }
      root.dataset.keyboardOpen = 'true';
      root.dataset.viewportScale = viewport.scale.toFixed(3);
      const height = Math.round(viewport.height);
      root.style.setProperty('--nava-visible-height', `${height}px`);
      if (input && height !== previousHeight) input.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
      previousHeight = height;
    });
  };
  viewport.addEventListener('resize', update);
  window.addEventListener('resize', update);
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', update);
  update();
  return () => {
    cancelAnimationFrame(frame);
    viewport.removeEventListener('resize', update);
    window.removeEventListener('resize', update);
    document.removeEventListener('focusin', update);
    document.removeEventListener('focusout', update);
    delete root.dataset.keyboardOpen;
    delete root.dataset.viewportScale;
    root.style.removeProperty('--nava-visible-height');
  };
}
