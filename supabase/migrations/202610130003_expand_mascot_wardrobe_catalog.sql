-- Expands each visible wardrobe category to 17 choices. The legacy
-- accessory-none row remains an internal compatibility sentinel and is not
-- rendered as a visible choice.

begin;

insert into public.mascot_wardrobe_items (id, category, point_price, sort_order) values
  ('skin-cherry-blossom', 'skin', 320, 5),
  ('skin-lake-blue', 'skin', 280, 6),
  ('skin-mint-mist', 'skin', 260, 7),
  ('skin-honey-gold', 'skin', 300, 8),
  ('skin-lavender-cloud', 'skin', 340, 9),
  ('skin-mica-silver', 'skin', 380, 10),
  ('skin-forest-dew', 'skin', 360, 11),
  ('skin-sea-salt', 'skin', 320, 12),
  ('skin-milk-tea', 'skin', 280, 13),
  ('skin-coral-red', 'skin', 350, 14),
  ('skin-moonlight-purple', 'skin', 420, 15),
  ('skin-aurora-teal', 'skin', 460, 16),
  ('skin-star-sand', 'skin', 520, 17),
  ('accessory-star-moon-clip', 'accessory', 220, 5),
  ('accessory-pearl-bow', 'accessory', 200, 6),
  ('accessory-mint-earmuffs', 'accessory', 260, 7),
  ('accessory-honey-neck-warmer', 'accessory', 240, 8),
  ('accessory-cloud-backpack', 'accessory', 300, 9),
  ('accessory-fish-brooch', 'accessory', 180, 10),
  ('accessory-laurel-crown', 'accessory', 420, 11),
  ('accessory-sailor-hat', 'accessory', 280, 12),
  ('accessory-cherry-bow', 'accessory', 220, 13),
  ('accessory-star-glasses', 'accessory', 260, 14),
  ('accessory-raindrop-cape', 'accessory', 360, 15),
  ('accessory-aurora-scarf', 'accessory', 400, 16),
  ('accessory-lily-garland', 'accessory', 380, 17),
  ('accessory-night-voyage-cap', 'accessory', 340, 18),
  ('background-seaside-afternoon', 'background', 320, 5),
  ('background-cherry-courtyard', 'background', 380, 6),
  ('background-rainy-study', 'background', 400, 7),
  ('background-star-terrace', 'background', 480, 8),
  ('background-forest-mist', 'background', 300, 9),
  ('background-cream-kitchen', 'background', 280, 10),
  ('background-glasshouse', 'background', 420, 11),
  ('background-snowy-fireplace', 'background', 460, 12),
  ('background-moonlit-lakeshore', 'background', 440, 13),
  ('background-cloud-station', 'background', 520, 14),
  ('background-honey-sunset', 'background', 360, 15),
  ('background-sea-salt-bath', 'background', 340, 16),
  ('background-milky-way-bedroom', 'background', 500, 17)
on conflict (id) do update set
  category = excluded.category,
  point_price = excluded.point_price,
  sort_order = excluded.sort_order,
  enabled = true;

commit;
