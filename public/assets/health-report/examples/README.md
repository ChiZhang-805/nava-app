# Demonstration food images

`oat-yogurt.png` and `oat-yogurt.webp` are original AI-generated **演示示意图 (demonstration illustrations)**, intended only for the local demo record named “燕麦酸奶”. They are not a real user's photograph, not evidence that a meal was eaten, and must never be sent for nutrition analysis or used to invent nutrients. Production records without a saved photo must retain a truthful empty state; this asset is not a universal meal fallback.

The pictured ingredients are only rolled oats and plain white yogurt in a shallow white ceramic bowl. It is an overhead photographic-style image, intentionally distinct from the category icon `../diet.webp`.

Generation used the built-in `image_gen` tool with `transparent_background: true`; no external photo was supplied. The selected PNG is preserved unchanged from `exec-88291f02-337a-4a0e-b65e-a31eee4fd622.png`. The source generation was `exec-8227fff7-64b5-4ed4-ae12-3f628022d37a.png`; a follow-up requested exterior-edge cleanup. The original generation outputs remain in the tool's generated-images directory.

Production WebP: 768 × 768, Sharp `resize(768,768,{fit:'inside',withoutEnlargement:true}).webp({quality:90,alphaQuality:100,effort:6})`. This is only a size/encoding derivative; no compositing or new ingredients were added.

## Complete generation prompt

```text
Use case: photorealistic-natural. Asset type: an original food demonstration image for a mobile meal-record card, NOT a user's real photograph. Create exactly ONE white ceramic shallow round bowl containing only plain white yogurt and real rolled oats. No fruit, berries, nuts, seeds, granola clusters, honey, syrup, garnish, spoon, utensils, napkin, or any other ingredient or object. Camera is perfectly directly overhead at 90 degrees, flat-lay orthographic-looking view: the entire rim is a complete symmetrical circle, not an ellipse and not a three-quarter view. Fill a square image with the centered complete circular bowl at approximately 90 percent of canvas width and height; leave a narrow equal transparent margin, never crop the bowl. The shallow white ceramic bowl has a thin clean gently rounded rim, filled with creamy natural white yogurt with delicate soft swirls and a generous loosely scattered patch of recognizable pale tan rolled oat flakes across part of the surface; some yogurt remains visible. The oats must look like natural flattened oat flakes, not nuts or cereal loops. Style is polished professional food photography, close to a real carefully lit food photograph, with fine natural edible texture and subtle realistic internal shadows, appetizing but restrained. Soft diffuse natural daylight. Genuinely transparent alpha background everywhere outside the physical bowl: no table, surface, backdrop, floor, cast shadow outside the bowl, vignette, white background, colored background, checkerboard, text, labels, border, logo, or watermark. The result should read clearly as a complete top-down bowl of oat yogurt at a small mobile-card display size.
```

## Follow-up edge-cleanup prompt

```text
Edit only the transparent cutout edge of this generated top-down oat yogurt photo. Preserve the existing entire bowl, all food texture, camera angle, ingredient amounts, white ceramic rim, yogurt and rolled oats exactly. Remove every stray white fleck, isolated opaque dot, halo, fringe, and residual background pixel outside the physical smooth circular bowl rim. The outer contour should be one clean smooth antialiased circle, with fully transparent alpha immediately beyond the bowl and a narrow equal transparent margin on all sides. No floating grains, cast shadow, glow, extra white outline, or ground shadow outside the bowl. Do not add any ingredients, text, props, surface, backdrop or objects. Do not redraw the contents. Keep the same centered complete 90-degree overhead bowl. Return a genuinely transparent PNG.
```

