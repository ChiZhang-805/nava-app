import { Check, ChevronLeft, ChevronRight, CloudUpload, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AdminProductDraft } from "../services/adminConsole";

export default function AdminProductEditor({ product, onChange, onUpload, onSubmit, busy, zh }: {
  product: AdminProductDraft; onChange: (product: AdminProductDraft) => void;
  onUpload: (files: FileList | null) => Promise<void>; onSubmit: (event: FormEvent) => Promise<void>;
  busy: boolean; zh: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const activeIndex = useRef(0);
  const uploadStart = useRef(0);
  const wasBusy = useRef(false);
  const touching = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slides = product.imageUrls.length + 1;
  const goTo = (index: number) => {
    const node = track.current;
    if (!node) return;
    node.scrollTo({ left: Math.max(0, Math.min(slides - 1, index)) * node.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  function settleImage() {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const node = track.current;
      if (!node || touching.current) return;
      const position = Math.round(node.scrollLeft / node.clientWidth);
      if (Math.abs(node.scrollLeft - position * node.clientWidth) > 1) goTo(position);
    }, 180);
  }
  useEffect(() => {
    if (busy && !wasBusy.current) uploadStart.current = product.imageUrls.length;
    if (!busy && wasBusy.current && track.current) {
      // The browser may keep the trailing add tile snapped while uploads are inserted before it.
      // Return to the first newly uploaded image only after the whole batch is rendered.
      track.current.scrollTo({ left: Math.min(uploadStart.current, product.imageUrls.length) * track.current.clientWidth, behavior: "instant" });
    }
    wasBusy.current = busy;
  }, [busy, product.imageUrls.length]);
  useEffect(() => {
    const node = track.current;
    if (!node) return;
    let width = node.clientWidth;
    const observer = new ResizeObserver(() => {
      if (node.clientWidth === width) return;
      width = node.clientWidth;
      node.scrollTo({ left: activeIndex.current * width, behavior: "instant" });
    });
    observer.observe(node);
    return () => { observer.disconnect(); if (settleTimer.current) clearTimeout(settleTimer.current); };
  }, []);
  const textField = (key: "name" | "nameEn" | "brand" | "brandEn", label: string, english = false) => (
    <label><span>{label}</span><input lang={english ? "en" : "zh"} value={product[key]} maxLength={120} required
      onChange={(event) => onChange({ ...product, [key]: event.target.value })} /></label>
  );
  return <form className="admin-product-editor admin-console-content" onSubmit={onSubmit}>
    <fieldset disabled={busy}>
      <div className="admin-product-gallery" aria-label={zh ? "商品图片" : "Product images"}>
        <div className="admin-image-carousel" ref={track} tabIndex={0} role="region" aria-label={zh ? "左右滑动查看商品图片" : "Swipe to view product images"} aria-roledescription="carousel"
          onTouchStart={() => { touching.current = true; }} onTouchEnd={() => { touching.current = false; settleImage(); }} onTouchCancel={() => { touching.current = false; settleImage(); }}
          onScroll={(event) => { activeIndex.current = Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth); setImageIndex(activeIndex.current); settleImage(); }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
            event.preventDefault(); goTo(imageIndex + (event.key === "ArrowRight" ? 1 : -1));
          }}>
          {product.imageUrls.map((url, index) => <div className="admin-image-slide" key={url} role="group" aria-label={`${index + 1} / ${product.imageUrls.length}`}>
            <img src={url} alt={zh ? `商品图片 ${index + 1}` : `Product image ${index + 1}`} draggable={false} />
            <button className="admin-remove-image" type="button" aria-label={zh ? `移除图片 ${index + 1}` : `Remove image ${index + 1}`}
              onClick={() => onChange({ ...product, imageUrls: product.imageUrls.filter((_, itemIndex) => index !== itemIndex) })}><X size={21} /></button>
          </div>)}
          <label className="admin-image-slide admin-image-upload">
            <CloudUpload size={38} /><strong>{zh ? "添加图片" : "Add images"}</strong>
            <small>{product.imageUrls.length >= 6 ? (zh ? "最多 6 张，请先移除一张" : "6 images maximum. Remove one to add another.") : (zh ? "JPG、PNG、WebP 或 AVIF · 每张不超过 8 MB" : "JPG, PNG, WebP or AVIF · up to 8 MB each")}</small>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple disabled={busy || product.imageUrls.length >= 6}
              aria-label={zh ? "添加图片" : "Add images"} onChange={(event) => { void onUpload(event.target.files); event.target.value = ""; }} />
          </label>
        </div>
        <div className="admin-gallery-navigation">
          <button type="button" disabled={imageIndex === 0} onClick={() => goTo(imageIndex - 1)} aria-label={zh ? "上一张图片" : "Previous image"}><ChevronLeft /></button>
          <span aria-live="polite">{imageIndex < product.imageUrls.length ? `${imageIndex + 1} / ${product.imageUrls.length}` : (zh ? "添加图片" : "Add images")}</span>
          <button type="button" disabled={imageIndex === slides - 1} onClick={() => goTo(imageIndex + 1)} aria-label={zh ? "下一张图片" : "Next image"}><ChevronRight /></button>
        </div>
      </div>
      {textField("name", zh ? "商品名称（中文）" : "Product name · Chinese")}
      {textField("nameEn", zh ? "商品英文名称" : "Product name · English", true)}
      {textField("brand", zh ? "商品品牌（中文）" : "Brand · Chinese")}
      {textField("brandEn", zh ? "商品英文品牌" : "Brand · English", true)}
      <label><span>{zh ? "商品标识" : "Product identifier"}</span><input value={product.slug} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="cat-notebook" required
        onChange={(event) => onChange({ ...product, slug: event.target.value.toLowerCase() })} /></label>
      <label><span>{zh ? "商品说明（中文）" : "Description · Chinese"}</span><textarea aria-label={zh ? "商品说明（中文）" : "Description · Chinese"} lang="zh" value={product.description} maxLength={2000} rows={4} required onChange={(event) => onChange({ ...product, description: event.target.value })} /></label>
      <label><span>{zh ? "商品英文说明" : "Description · English"}</span><textarea aria-label={zh ? "商品英文说明" : "Description · English"} lang="en" value={product.descriptionEn} maxLength={2000} rows={4} required onChange={(event) => onChange({ ...product, descriptionEn: event.target.value })} /></label>
      <label><span>{zh ? "积分价格" : "Points price"}</span><input type="number" inputMode="numeric" min={1} max={1000000} step={1} value={Number.isNaN(product.pointPrice) ? "" : product.pointPrice} required onChange={(event) => onChange({ ...product, pointPrice: event.target.valueAsNumber })} /></label>
      <label><span>{zh ? "库存" : "Inventory"}</span><input type="number" inputMode="numeric" min={0} max={1000000} step={1} value={Number.isNaN(product.inventory) ? "" : product.inventory} required onChange={(event) => onChange({ ...product, inventory: event.target.valueAsNumber })} /></label>
      <label><span>{zh ? "上架状态" : "Listing status"}</span><select aria-label={zh ? "上架状态" : "Listing status"} value={product.listingStatus} onChange={(event) => onChange({ ...product, listingStatus: event.target.value as AdminProductDraft["listingStatus"] })}>
        <option value="published">{zh ? "上架" : "Published"}</option><option value="unpublished">{zh ? "下架" : "Unpublished"}</option><option value="upcoming">{zh ? "待上架" : "Coming soon"}</option>
      </select></label>
      <button className="admin-primary-action" type="submit">{busy ? <LoaderCircle className="admin-spin" size={21} /> : <Check size={21} />}{zh ? "保存商品" : "Save product"}</button>
    </fieldset>
  </form>;
}
