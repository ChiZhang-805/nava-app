import { wardrobeItem, type WardrobeSelection } from "../services/mascotWardrobe";

/** Static, transparent 2D layers share the same square artwork coordinates. */
export default function WardrobeArtwork({ selection, label }: { selection: WardrobeSelection; label: string }) {
  const skin = wardrobeItem(selection.skinId);
  return <svg className="mascot-wardrobe-artwork" viewBox="0 0 512 512" role="img" aria-label={label} data-skin={skin.id}>
    <image href={skin.art} width="512" height="512" />
    {selection.accessoryIds.map((id) => {
      const accessory = wardrobeItem(id);
      return accessory.art ? <image key={id} href={accessory.art} width="512" height="512" data-accessory={id} /> : null;
    })}
  </svg>;
}
