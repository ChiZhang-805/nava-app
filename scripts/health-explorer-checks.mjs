export async function inspectHealthExplorer(page) {
  if (page.viewportSize()?.height <= 640) await page.locator('.health-explorer-record').scrollIntoViewIfNeeded();
  const geometry = await page.evaluate(() => {
    const rect = (node) => {
      if (!node) return null;
      const { left, right, top, bottom, width, height } = node.getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    };
    const frame = document.querySelector('.phone-frame');
    const card = document.querySelector('.health-explorer-card[aria-hidden="false"]');
    const action = document.querySelector('.health-explorer-record');
    const nav = document.querySelector('.bottom-nav');
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      frameOverflow: frame.scrollWidth - frame.clientWidth,
      frame: rect(frame), card: rect(card), action: rect(action), nav: rect(nav),
      categories: document.querySelectorAll('[data-health-category]').length,
      cardOverflow: card ? card.scrollHeight - card.clientHeight : null,
      textOverflows: card ? [...card.querySelectorAll('header, footer, p')].filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.textContent) : [],
      activeCharts: document.querySelectorAll('.health-explorer-card[aria-hidden="false"]').length,
      dateLabels: card ? [...card.querySelectorAll('.trend-date')].map((node) => rect(node)) : [],
    };
  });
  if (!geometry.card || geometry.categories < 6 || geometry.activeCharts !== 1) throw new Error(`Missing explorer region: ${JSON.stringify(geometry)}`);
  if (geometry.documentOverflow > 1 || geometry.frameOverflow > 1 || geometry.cardOverflow > 1 || geometry.textOverflows.length) throw new Error(`Explorer content overflow: ${JSON.stringify(geometry)}`);
  if (geometry.card.left < geometry.frame.left - 1 || geometry.card.right > geometry.frame.right + 1) throw new Error(`Card escapes frame: ${JSON.stringify(geometry)}`);
  if (geometry.nav && geometry.action && geometry.action.bottom > geometry.nav.top - 3) throw new Error(`Entry action intersects navigation: ${JSON.stringify(geometry)}`);
  for (let index = 1; index < geometry.dateLabels.length; index++) {
    if (geometry.dateLabels[index - 1].right > geometry.dateLabels[index].left - 2) throw new Error(`Chart dates collide: ${JSON.stringify(geometry.dateLabels)}`);
  }
  return geometry;
}
