import type { User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  BellRing,
  Boxes,
  Check,
  CloudUpload,
  ImagePlus,
  LoaderCircle,
  PackageCheck,
  Pencil,
  Send,
  ShieldCheck,
  Smartphone,
  Store,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocale } from "../i18n";
import {
  loadAdminAccess,
  loadAdminNotificationBatches,
  loadAdminProducts,
  loadAdminPushCapability,
  publishAdminNotification,
  saveAdminProduct,
  uploadAdminProductImage,
  type AdminNotificationBatch,
  type AdminProduct,
  type AdminProductDraft,
  type AdminPushCapability,
} from "../services/adminConsole";
import type { NavaNotificationCategory, NavaNotificationTarget } from "../services/notifications";
import "./admin-console.css";

type Section = "products" | "notifications";

const emptyProduct = (): AdminProductDraft => ({
  slug: "",
  name: "",
  description: "",
  pointPrice: 100,
  imageUrls: [],
  inventory: 10,
  published: false,
});

const categoryOptions: Array<{ id: NavaNotificationCategory; zh: string; en: string }> = [
  { id: "system", zh: "系统", en: "System" },
  { id: "mood", zh: "情绪", en: "Mood" },
  { id: "sleep", zh: "睡眠", en: "Sleep" },
  { id: "nutrition", zh: "饮食", en: "Nutrition" },
  { id: "exercise", zh: "运动", en: "Exercise" },
  { id: "focus", zh: "专注", en: "Focus" },
  { id: "face", zh: "面部", en: "Face" },
  { id: "weekly", zh: "周报", en: "Weekly" },
];

const targets: Array<{ id: string; zh: string; en: string; target: NavaNotificationTarget }> = [
  { id: "notifications", zh: "通知中心", en: "Notifications", target: { tab: "today", view: "notifications" } },
  { id: "today", zh: "首页", en: "Home", target: { tab: "today" } },
  { id: "mood", zh: "情绪记录", en: "Mood log", target: { tab: "record", module: "mood" } },
  { id: "sleep", zh: "睡眠记录", en: "Sleep log", target: { tab: "record", module: "sleep" } },
  { id: "diet", zh: "饮食记录", en: "Food log", target: { tab: "record", module: "diet" } },
  { id: "exercise", zh: "运动记录", en: "Exercise log", target: { tab: "record", module: "exercise" } },
  { id: "focus", zh: "专注记录", en: "Focus log", target: { tab: "record", module: "focus" } },
  { id: "face", zh: "面部记录", en: "Face log", target: { tab: "record", module: "face" } },
  { id: "ai", zh: "NAVA 对话", en: "NAVA chat", target: { tab: "ai" } },
];

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function batchStatus(batch: AdminNotificationBatch, zh: boolean) {
  if (batch.deliveryMode === "in_app") return zh ? "APP 内" : "In app";
  if (batch.pushStatus === "completed") return zh ? `系统送达 ${batch.deliveredCount}` : `Push ${batch.deliveredCount}`;
  if (batch.pushStatus === "no_devices") return zh ? "无已注册设备" : "No devices";
  if (batch.pushStatus === "partial") return zh ? "部分送达" : "Partial";
  if (batch.pushStatus === "failed") return zh ? "系统推送失败" : "Push failed";
  return zh ? "系统推送排队中" : "Push queued";
}

export default function AdminConsole({ user, onBack }: { user: User; onBack: () => void }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const qa = import.meta.env.DEV && new URLSearchParams(window.location.search).get("qa") === "admin-console";
  const [access, setAccess] = useState<"loading" | "allowed" | "denied">("loading");
  const [section, setSection] = useState<Section>("products");
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [batches, setBatches] = useState<AdminNotificationBatch[]>([]);
  const [capability, setCapability] = useState<AdminPushCapability>({ apns: false, fcm: false, hms: false, remotePush: false });
  const [product, setProduct] = useState<AdminProductDraft>(emptyProduct);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [noticeTitle, setNoticeTitle] = useState(zh ? "来自 NAVA 的新消息" : "A new note from NAVA");
  const [noticeBody, setNoticeBody] = useState("");
  const [noticeCategory, setNoticeCategory] = useState<NavaNotificationCategory>("system");
  const [targetId, setTargetId] = useState("notifications");
  const [deliveryMode, setDeliveryMode] = useState<"in_app" | "in_app_and_push">("in_app");

  const target = useMemo(() => targets.find((item) => item.id === targetId)?.target ?? targets[0].target, [targetId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const allowed = qa || await loadAdminAccess();
        if (!active) return;
        setAccess(allowed ? "allowed" : "denied");
        if (allowed) {
          const [nextProducts, nextBatches, nextCapability] = await Promise.all([
            qa ? Promise.resolve([]) : loadAdminProducts(),
            qa ? Promise.resolve([]) : loadAdminNotificationBatches(),
            qa ? Promise.resolve({ apns: false, fcm: false, hms: false, remotePush: false }) : loadAdminPushCapability(),
          ]);
          if (!active) return;
          setProducts(nextProducts);
          setBatches(nextBatches);
          setCapability(nextCapability);
        }
      } catch (loadError) {
        if (!active) return;
        setAccess("denied");
        setError(messageFrom(loadError));
      }
    })();
    return () => { active = false; };
  }, [qa, user.id]);

  function editProduct(item?: AdminProduct) {
    setError(null);
    setSuccess(null);
    setProduct(item ? {
      id: item.id,
      slug: item.slug,
      name: item.name,
      description: item.description,
      pointPrice: item.pointPrice,
      imageUrls: item.imageUrls,
      inventory: item.inventory,
      published: item.published,
    } : emptyProduct());
    setEditorOpen(true);
  }

  async function uploadImages(files: FileList | null) {
    if (!files?.length) return;
    setBusy("image");
    setError(null);
    try {
      const remaining = Math.max(0, 6 - product.imageUrls.length);
      const selected = [...files].slice(0, remaining);
      const urls = qa ? selected.map((file) => URL.createObjectURL(file)) : await Promise.all(selected.map(uploadAdminProductImage));
      setProduct((current) => ({ ...current, imageUrls: [...current.imageUrls, ...urls] }));
    } catch (uploadError) {
      setError(messageFrom(uploadError));
    } finally {
      setBusy(null);
    }
  }

  async function submitProduct(event: FormEvent) {
    event.preventDefault();
    setBusy("product");
    setError(null);
    setSuccess(null);
    try {
      if (qa) {
        setProducts((current) => [{
          id: product.id ?? crypto.randomUUID(),
          ...product,
          soldOut: product.inventory === 0,
          updatedAt: new Date().toISOString(),
        } as AdminProduct, ...current.filter((item) => item.id !== product.id)]);
      } else {
        await saveAdminProduct(product);
        setProducts(await loadAdminProducts());
      }
      setEditorOpen(false);
      setSuccess(zh ? "商品已保存" : "Product saved");
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setBusy(null);
    }
  }

  async function submitNotification(event: FormEvent) {
    event.preventDefault();
    setBusy("notification");
    setError(null);
    setSuccess(null);
    try {
      if (qa) {
        setBatches((current) => [{
          id: crypto.randomUUID(), title: noticeTitle, body: noticeBody, category: noticeCategory,
          deliveryMode, recipientCount: 3, deliveredCount: 0, failedCount: 0, skippedCount: 0,
          pushStatus: deliveryMode === "in_app" ? "not_requested" : "no_devices", createdAt: new Date().toISOString(),
        }, ...current]);
      } else {
        const published = await publishAdminNotification({ title: noticeTitle, body: noticeBody, category: noticeCategory, target, deliveryMode });
        setBatches(await loadAdminNotificationBatches());
        setSuccess(zh ? `已发送给 ${published.recipients} 个账号` : `Sent to ${published.recipients} accounts`);
      }
      setNoticeBody("");
    } catch (publishError) {
      setError(messageFrom(publishError));
    } finally {
      setBusy(null);
    }
  }

  if (access === "loading") return <section className="admin-console-screen"><div className="admin-console-centered"><LoaderCircle className="admin-spin" size={28} /></div></section>;
  if (access === "denied") return <section className="admin-console-screen"><header className="home-experience-header admin-console-header"><button type="button" className="home-experience-back" onClick={onBack}><ArrowLeft size={21} /></button><div><h1>{zh ? "管理员端" : "Admin"}</h1></div><span /></header><div className="admin-console-centered"><ShieldCheck size={42} /><strong>{zh ? "此账号没有管理员权限" : "This account is not an administrator"}</strong>{error && <small>{error}</small>}<button type="button" onClick={onBack}>{zh ? "返回" : "Back"}</button></div></section>;

  return (
    <section className="admin-console-screen">
      <header className="home-experience-header admin-console-header">
        <button type="button" className="home-experience-back" onClick={onBack} aria-label={zh ? "返回首页" : "Back home"}><ArrowLeft size={21} /></button>
        <div><span>NAVA CONTROL</span><h1>{zh ? "管理员端" : "Admin console"}</h1></div>
        <span className="admin-console-badge"><ShieldCheck size={18} /></span>
      </header>

      <div className="admin-console-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={section === "products"} onClick={() => setSection("products")}><Store size={18} />{zh ? "商品" : "Products"}</button>
        <button type="button" role="tab" aria-selected={section === "notifications"} onClick={() => setSection("notifications")}><BellRing size={18} />{zh ? "通知" : "Notices"}</button>
      </div>

      {(error || success) && <div className={["admin-console-toast", error ? "is-error" : "is-success"].join(" ")} role={error ? "alert" : "status"}>{error ? <X size={17} /> : <Check size={17} />}<span>{error ?? success}</span><button type="button" onClick={() => { setError(null); setSuccess(null); }} aria-label={zh ? "关闭" : "Close"}><X size={15} /></button></div>}

      {section === "products" && <div className="admin-console-content">
        <div className="admin-console-intro"><span><Boxes size={21} /></span><div><strong>{zh ? "积分商城商品" : "Points shop products"}</strong><small>{zh ? `${products.length} 件商品` : `${products.length} products`}</small></div><button type="button" onClick={() => editProduct()}><ImagePlus size={17} />{zh ? "发布商品" : "New product"}</button></div>
        <div className="admin-product-list">
          {products.length === 0 && <div className="admin-empty"><PackageCheck size={34} /><strong>{zh ? "还没有商品" : "No products yet"}</strong></div>}
          {products.map((item) => <article key={item.id}>
            <div className="admin-product-thumb">{item.imageUrls[0] ? <img src={item.imageUrls[0]} alt="" /> : <Store size={26} />}</div>
            <div><strong>{item.name}</strong><small>{item.pointPrice} XP · {zh ? `库存 ${item.inventory}` : `${item.inventory} in stock`}</small><span className={item.published ? "is-published" : "is-draft"}>{item.published ? (zh ? "已上架" : "Published") : (zh ? "草稿" : "Draft")}</span></div>
            <button type="button" onClick={() => editProduct(item)} aria-label={zh ? `编辑${item.name}` : `Edit ${item.name}`}><Pencil size={17} /></button>
          </article>)}
        </div>
      </div>}

      {section === "notifications" && <div className="admin-console-content admin-notice-layout">
        <form className="admin-form-card" onSubmit={submitNotification}>
          <div className="admin-card-heading"><span><BellRing size={20} /></span><div><strong>{zh ? "发布通知" : "Publish notice"}</strong><small>{zh ? "发送到用户通知中心" : "Send to user inboxes"}</small></div></div>
          <label><span>{zh ? "标题" : "Title"}</span><input value={noticeTitle} maxLength={160} onChange={(event) => setNoticeTitle(event.target.value)} required /></label>
          <label><span>{zh ? "内容" : "Message"}</span><textarea value={noticeBody} maxLength={1000} rows={4} onChange={(event) => setNoticeBody(event.target.value)} required /></label>
          <div className="admin-form-grid"><label><span>{zh ? "分类" : "Category"}</span><select value={noticeCategory} onChange={(event) => setNoticeCategory(event.target.value as NavaNotificationCategory)}>{categoryOptions.map((item) => <option key={item.id} value={item.id}>{zh ? item.zh : item.en}</option>)}</select></label><label><span>{zh ? "点击后打开" : "Open on tap"}</span><select value={targetId} onChange={(event) => setTargetId(event.target.value)}>{targets.map((item) => <option key={item.id} value={item.id}>{zh ? item.zh : item.en}</option>)}</select></label></div>
          <div className="admin-delivery-choice"><button type="button" aria-pressed={deliveryMode === "in_app"} onClick={() => setDeliveryMode("in_app")}><BellRing size={18} /><span><strong>{zh ? "APP 内通知" : "In-app"}</strong><small>{zh ? "通知中心" : "Inbox"}</small></span></button><button type="button" aria-pressed={deliveryMode === "in_app_and_push"} disabled={!capability.remotePush} onClick={() => setDeliveryMode("in_app_and_push")}><Smartphone size={18} /><span><strong>{zh ? "同时系统推送" : "Also push"}</strong><small>{capability.apns ? "APNs" : (zh ? "待配置" : "Setup required")}</small></span></button></div>
          <div className="admin-notice-preview"><span>NAVA <small>{zh ? "现在" : "now"}</small></span><strong>{noticeTitle || (zh ? "通知标题" : "Notice title")}</strong><p>{noticeBody || (zh ? "通知内容会显示在这里。" : "Your message will appear here.")}</p></div>
          <button className="admin-primary-action" type="submit" disabled={busy === "notification"}>{busy === "notification" ? <LoaderCircle className="admin-spin" size={18} /> : <Send size={18} />}{zh ? "发送通知" : "Send notice"}</button>
        </form>
        <div className="admin-batch-list"><h2>{zh ? "最近发布" : "Recent"}</h2>{batches.length === 0 && <div className="admin-empty is-compact"><BellRing size={27} /><span>{zh ? "暂无通知" : "No notices"}</span></div>}{batches.map((batch) => <article key={batch.id}><span className={`admin-category-dot is-${batch.category}`} /><div><strong>{batch.title}</strong><small>{new Date(batch.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {zh ? `${batch.recipientCount} 个账号` : `${batch.recipientCount} accounts`}</small></div><em>{batchStatus(batch, zh)}</em></article>)}</div>
      </div>}

      {editorOpen && <div className="admin-editor-layer" role="presentation" onClick={() => setEditorOpen(false)}><form className="admin-product-editor" onSubmit={submitProduct} onClick={(event) => event.stopPropagation()}><header><div><span>{product.id ? (zh ? "编辑商品" : "Edit product") : (zh ? "新商品" : "New product")}</span><strong>{product.name || (zh ? "积分商城" : "Points shop")}</strong></div><button type="button" onClick={() => setEditorOpen(false)}><X size={20} /></button></header><div className="admin-image-strip">{product.imageUrls.map((url) => <div key={url}><img src={url} alt="" /><button type="button" onClick={() => setProduct((current) => ({ ...current, imageUrls: current.imageUrls.filter((item) => item !== url) }))}><X size={13} /></button></div>)}{product.imageUrls.length < 6 && <label className="admin-image-upload"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(event) => void uploadImages(event.target.files)} /><>{busy === "image" ? <LoaderCircle className="admin-spin" /> : <CloudUpload />}<small>{zh ? "添加图片" : "Add image"}</small></></label>}</div><label><span>{zh ? "商品名称" : "Product name"}</span><input value={product.name} maxLength={120} onChange={(event) => setProduct((current) => ({ ...current, name: event.target.value }))} required /></label><label><span>{zh ? "商品标识" : "Slug"}</span><input value={product.slug} maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="cat-notebook" onChange={(event) => setProduct((current) => ({ ...current, slug: event.target.value.toLowerCase() }))} required /></label><label><span>{zh ? "说明" : "Description"}</span><textarea value={product.description} maxLength={2000} rows={3} onChange={(event) => setProduct((current) => ({ ...current, description: event.target.value }))} /></label><div className="admin-form-grid"><label><span>{zh ? "积分价格" : "Price"}</span><input type="number" min={1} max={1000000} value={product.pointPrice} onChange={(event) => setProduct((current) => ({ ...current, pointPrice: Number(event.target.value) }))} required /></label><label><span>{zh ? "库存" : "Inventory"}</span><input type="number" min={0} max={1000000} value={product.inventory} onChange={(event) => setProduct((current) => ({ ...current, inventory: Number(event.target.value) }))} required /></label></div><label className="admin-publish-toggle"><span><strong>{zh ? "上架商品" : "Publish"}</strong><small>{zh ? "保存后在商城显示" : "Show in the shop"}</small></span><input type="checkbox" checked={product.published} onChange={(event) => setProduct((current) => ({ ...current, published: event.target.checked }))} /><i /></label><button className="admin-primary-action" type="submit" disabled={busy === "product"}>{busy === "product" ? <LoaderCircle className="admin-spin" size={18} /> : <Check size={18} />}{zh ? "保存商品" : "Save product"}</button></form></div>}
    </section>
  );
}
