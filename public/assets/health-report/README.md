# NAVA health-report illustrations

These six original raster illustrations were generated with the built-in Codex `image_gen` tool on 2026-11-20, one call per asset, with `transparent_background: true`. No external icon pack, third-party character, CLI, or API-key workflow was used.

## Assets

| File | Meaning | Generated source filename |
| --- | --- | --- |
| mood.png | Mood: warm smiling peach sun | exec-540fe583-7936-4414-9235-2991c4d6f057.png |
| face.png | Face observations: friendly lavender hand mirror | exec-898f432a-7019-4b7a-a6af-e0546bba04fc.png |
| focus.png | Focus: coral and ice-blue timer | exec-7fb626c7-5b1e-42b8-a1b1-9e1ac10afb36.png |
| sleep.png | Sleep: pale-blue pillow and golden crescent | exec-32d39e0b-1dad-40da-9d84-2ea888fefda4.png |
| exercise.png | Exercise: mint-blue sneaker | exec-8c857608-dafa-42f2-a7b3-4164950078bf.png |
| diet.png | Diet: vegetable and grain meal bowl | exec-050dafd2-062d-4fac-8c14-d0b39c063389.png |

Original generated PNGs are retained by Codex. These project files are byte-for-byte copies, preserving the original alpha and pixels. Five are 1254 × 1254 pixels; mood.png is 1264 × 1244 pixels. Render inside a square box with `object-fit: contain`; the intended main display is 60–68 CSS pixels, with smaller repeated category accents at 24 CSS pixels.

## Production derivatives

Use the same-named `.webp` files in the application. The original PNGs and prompts remain as source assets. The six production files total **142,282 bytes** (139 KiB), down from 6,918,199 bytes of PNG sources (97.9% smaller).

Derivation uses the existing project-local Sharp 0.35.5 tool, without painting, recoloring, clipping, background replacement, or redesign:

```js
sharp(input)
  .resize({ width: 384, height: 384, fit: 'inside', withoutEnlargement: true })
  .webp({ quality: 92, alphaQuality: 100, effort: 6 })
  .toFile(output)
```

The longest side is 384 px (mood is 384 × 378, the others 384 × 384). This preserves aspect ratios and supplies ample resolution for a 64 CSS px category image on high-density screens. After encoding, every alpha value matches the resized source exactly (maximum alpha difference 0). Both PNG and WebP are visually checked at 64 px and 24 px.

The mirror represents self-described observations, not diagnosis. The meal is illustrative, not a claim about a user's actual diet.

## Reproducible prompt set

Each asset used this identical prefix followed by its subject prompt:

```text
Use case: stylized-concept. Create ONE original production app icon for NAVA's health-report category row. Style: a softly dimensional hand-painted toy illustration, 2D raster artwork with gentle sculpted volume, smooth rounded silhouettes, subtle matte watercolor-gouache texture, clean softly shaded edges; warm and friendly, polished, not a line icon, not a photoreal render. Shared art direction: pastel glacier blue and airy mint foundation, clear medium saturation accents, soft upper-left lighting, very slight three-quarter front view. Square canvas, one centered coherent subject filling 70–80% of the canvas with equal transparent breathing room. The image must read clearly at 60–68 CSS pixels: few bold forms, no tiny ornamental details. Background must be genuinely transparent alpha everywhere outside the subject. No white or colored backdrop, no tile, no badge, no framing circle, no ground, no cast shadow on an invisible floor, no text, numbers, logos, labels, watermarks, scenery, or extra floating decorations. Internal shading is allowed. 
```

### mood

```text
Subject: one warm peach-colored little sun with eight softly rounded short rays. Its central peach face has two small dark-teal smiling eyes and a simple warm curved smile, with very subtle blush. The sun itself is the whole icon, not inside a badge. Friendly relaxed mood, clear chunky silhouette.
```

### face

```text
Subject: one pale-lavender handheld mirror, its softly rounded frame and short handle clearly visible. The mirror glass is ice blue with one minimal friendly face outline reflected in it, just a simple softly drawn oval, two dots and a tiny smile. No real person, no realistic human face, no medical or diagnostic symbols. Rounded toy mirror, gentle clean shapes.
```

### focus

```text
Subject: one compact rounded desk timer in coral pink and ice blue. A softly rounded coral body, a pale ice-blue dial, a single short navy pointer and four chunky tick marks, with one rounded top button. No digits or writing. This is a focus timer, not an alarm bell. Friendly, clear, compact object.
```

### sleep

```text
Subject: one plump pale-blue pillow with softly rounded corners, nestled with a small warm golden crescent moon overlapping its upper-right corner. Pillow and crescent make one compact coherent icon. No stars, no bed or scenery. Peaceful soft volume with simple broad forms.
```

### exercise

```text
Subject: one mint-and-ice-blue rounded athletic sneaker seen in gentle three-quarter side view, toe angled toward lower right. Cream sole, three simple chunky pale laces, one deeper teal accent. No brand stripes, logos or lettering. Friendly light active shape, keep details minimal and distinct at tiny size.
```

### diet

```text
Subject: one small rounded ice-blue meal bowl viewed slightly from above, containing a few clear chunky components: leafy mint-green vegetables, pale golden grains, one orange vegetable slice and one warm red tomato piece. Show the softly shaded bowl and large simple healthy-food shapes; no utensils, lettering, table, or scattered grains.
```

## Validation

The validation reads the PNG through browser canvas only; it does not modify any asset. All six have actual alpha from 0 to 255 and an opaque subject. Outer corner alpha is 0 or at most 1/255, and 48–69% of pixels are completely transparent. The main subject spans 81–86% of the canvas along its longest dimension (alpha threshold 32). A browser preview checks 64 px and 24 px rendering on white, glacier-blue, and pale-lavender surfaces.

Project test evidence: `NAVA-App/Build/TestRuns/App-Checks/health-report-icons/`.

## My rhythm header illustration

`rhythm.png` is an additional original illustration generated with the same built-in image tool and `transparent_background: true`. It is a soft glacier-blue rhythm clock with a lavender wave, intended for the 24–28 CSS px header beside “My rhythm”. It is not a medical ECG and contains no text or separate background tile.

Source filename: `exec-a80011e2-3191-4b7f-9cdc-76df2a86b52b.png`. The original PNG is preserved unchanged. Use `rhythm.webp` (384 × 384, 27,408 bytes) in the application; it uses the same Sharp settings above and has a maximum alpha difference of 0 against the resized original. PNG and WebP both retain alpha from 0 to 255. The original six assets are unchanged.

The exact complete generation prompt was:

```text
Use case: stylized-concept. Create ONE original production app icon for NAVA's health-report category row. Style: a softly dimensional hand-painted toy illustration, 2D raster artwork with gentle sculpted volume, smooth rounded silhouettes, subtle matte watercolor-gouache texture, clean softly shaded edges; warm and friendly, polished, not a line icon, not a photoreal render. Shared art direction: pastel glacier blue and airy mint foundation, clear medium saturation accents, soft upper-left lighting, very slight three-quarter front view. Square canvas, one centered coherent subject filling 70–80% of the canvas with equal transparent breathing room. The image must read clearly at 60–68 CSS pixels: few bold forms, no tiny ornamental details. Background must be genuinely transparent alpha everywhere outside the subject. No white or colored backdrop, no tile, no badge, no framing circle, no ground, no cast shadow on an invisible floor, no text, numbers, logos, labels, watermarks, scenery, or extra floating decorations. Internal shading is allowed.  Subject: one miniature pebble-shaped rhythm clock made of pale glacier-blue ceramic, seen almost from the front with the same soft hand-painted shading as a toy object. The clock body is rounded and gently dimensional, with a small lavender top knob. Across its pale blue face is one thick, softly undulating lavender-blue wave, just two gentle rounded rises, like a calm daily rhythm, not a medical ECG. No clock hands, numbers, tiny ticks, extra ornaments or text. Use very few bold readable forms so it is unmistakable at 24–28 CSS pixels. The small clock itself is the entire subject; no separate badge, tile or background. Keep warm friendly pastel volume with clear silhouette, original illustration. Center it and fill at least 80% of the canvas.
```

Actual-size header preview: `NAVA-App/Build/TestRuns/App-Checks/health-report-icons/rhythm-24px-28px.png`.

