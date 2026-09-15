// Inspect the rendered pixels, not just SVG user-space dash lengths. This also
// catches vector-effect regressions when the phone preview is CSS-scaled.
export async function inspectRingPaint(page, selector) {
  const paths = await page.locator(selector).evaluateAll((rings) => rings.map((ring) => {
    const circle = ring.querySelector('.module-progress-ring__value');
    const matrix = circle.getScreenCTM();
    const length = circle.getTotalLength();
    return {
      progress: Number(ring.dataset.progress),
      points: Array.from({ length: 360 }, (_, angle) => {
        const point = circle.getPointAtLength(length * angle / 360).matrixTransform(matrix);
        return [point.x, point.y];
      }),
    };
  }));
  const png = (await page.screenshot({ scale: 'css' })).toString('base64');
  return page.evaluate(async ({ paths, png }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return paths.map(({ progress, points }) => {
      const painted = points.map(([x, y]) => {
        for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
          const offset = (Math.round(y + dy) * canvas.width + Math.round(x + dx)) * 4;
          const [r, g, b] = pixels.slice(offset, offset + 3);
          if (r < 110 && g > 90 && g > r * 1.35 && g > b * 1.18) return true;
        }
        return false;
      });
      return { progress, coverage: painted.filter(Boolean).length / painted.length };
    });
  }, { paths, png });
}
