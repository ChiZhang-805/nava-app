import type { User } from "@supabase/supabase-js";
import {
  ArrowLeft, BellRing, Boxes, Check, ChevronRight, History, Home,
  ImagePlus, LoaderCircle, PackageCheck, Pencil, Search, Send, ShieldCheck, Store,
  Trash2, UsersRound, X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import AdminProductEditor from "./AdminProductEditor";
import MoreMenu from "../components/MoreMenu";
import { useLocale } from "../i18n";
import {
  loadAdminAccess, loadAdminAccounts, loadAdminNotificationBatches, loadAdminProducts,
  archiveAdminProduct, publishAdminNotification, saveAdminProduct, setAdminAccountRole, uploadAdminProductImage,
  type AdminAccount, type AdminNotificationBatch, type AdminProduct, type AdminProductDraft,
} from "../services/adminConsole";
import type { NavaNotificationCategory, NavaNotificationTarget } from "../services/notifications";
import "./admin-console.css";

type AdminPage = "overview" | "products" | "notifications" | "roles" | "recent" | "editor";

const emptyProduct = (): AdminProductDraft => ({
  slug: "", name: "", nameEn: "", brand: "", brandEn: "", description: "", descriptionEn: "",
  listingStatus: "unpublished", pointPrice: 100, imageUrls: [], inventory: 10, published: false,
});

const categoryOptions: Array<{ id: NavaNotificationCategory; zh: string; en: string }> = [
  { id: "system", zh: "系统", en: "System" }, { id: "mood", zh: "情绪", en: "Mood" },
  { id: "sleep", zh: "睡眠", en: "Sleep" }, { id: "nutrition", zh: "饮食", en: "Nutrition" },
  { id: "exercise", zh: "运动", en: "Exercise" }, { id: "focus", zh: "专注", en: "Focus" },
  { id: "face", zh: "面部", en: "Face" }, { id: "weekly", zh: "周报", en: "Weekly" },
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

function messageFrom(error: unknown) { return error instanceof Error ? error.message : String(error); }

function batchStatus(batch: AdminNotificationBatch, zh: boolean) {
  if (batch.deliveryMode === "in_app") return zh ? "已发布" : "Published";
  if (batch.pushStatus === "completed") return zh ? `已推送 ${batch.deliveredCount}` : `Pushed ${batch.deliveredCount}`;
  if (batch.pushStatus === "no_devices") return zh ? "无在线设备" : "No devices";
  if (batch.pushStatus === "partial") return zh ? "部分推送" : "Partial";
  if (batch.pushStatus === "failed") return zh ? "推送失败" : "Push failed";
  return zh ? "推送处理中" : "Push queued";
}

function accountIdentity(account: AdminAccount, zh: boolean) {
  return account.email || account.phone || (zh ? "未设置邮箱或手机号" : "No email or phone");
}

export default function AdminConsole({ user, onHome }: { user: User; onHome: () => void }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const qa = import.meta.env.DEV && new URLSearchParams(window.location.search).get("qa") === "admin-console";
  const [access, setAccess] = useState<"loading" | "allowed" | "denied">("loading");
  const [page, setPage] = useState<AdminPage>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [batches, setBatches] = useState<AdminNotificationBatch[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [product, setProduct] = useState<AdminProductDraft>(emptyProduct);
  const [pendingDelete, setPendingDelete] = useState<AdminProduct | null>(null);
  const [discardTo, setDiscardTo] = useState<AdminPage | null>(null);
  const screen = useRef<HTMLElement>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const productLock = useRef(false);
  const originalDraft = useRef("");
  const objectUrls = useRef<string[]>([]);
  const [roleQuery, setRoleQuery] = useState("");
  const [pendingRole, setPendingRole] = useState<{ account: AdminAccount; nextRole: "member" | "admin" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [noticeCategory, setNoticeCategory] = useState<NavaNotificationCategory>("system");
  const [targetId, setTargetId] = useState("notifications");

  const target = useMemo(() => targets.find((item) => item.id === targetId)?.target ?? targets[0].target, [targetId]);
  const pageTitle = {
    overview: zh ? "管理员端" : "Admin console", products: zh ? "商品管理" : "Products",
    notifications: zh ? "发布通知" : "Publish notice", roles: zh ? "管理员权限" : "Administrator access",
    recent: zh ? "最近发布" : "Recent releases",
    editor: product.id ? (zh ? "编辑商品" : "Edit product") : (zh ? "发布商品" : "New product"),
  }[page];

  useEffect(() => { screen.current?.scrollTo({ top: 0 }); }, [page]);
  useEffect(() => () => { objectUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);
  useEffect(() => {
    const dialog = confirmDialog.current;
    if (pendingDelete || discardTo) dialog?.showModal();
    return () => dialog?.close();
  }, [pendingDelete, discardTo]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const allowed = qa || await loadAdminAccess();
        if (!active) return;
        setAccess(allowed ? "allowed" : "denied");
        if (!allowed) return;
        const qaAccounts: AdminAccount[] = [
          { userId: user.id, email: user.email ?? "admin@nava.app", phone: user.phone ?? null, role: "admin", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { userId: "00000000-0000-4000-8000-000000000002", email: "member@nava.app", phone: null, role: "member", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ];
        const [nextProducts, nextBatches, nextAccounts] = await Promise.all([
          qa ? Promise.resolve([]) : loadAdminProducts(),
          qa ? Promise.resolve([]) : loadAdminNotificationBatches(),
          qa ? Promise.resolve(qaAccounts) : loadAdminAccounts(),
        ]);
        if (!active) return;
        setProducts(nextProducts); setBatches(nextBatches); setAccounts(nextAccounts);
      } catch (loadError) {
        if (!active) return;
        setAccess("denied"); setError(messageFrom(loadError));
      }
    })();
    return () => { active = false; };
  }, [qa, user.email, user.id, user.phone]);

  function openPage(nextPage: AdminPage) {
    if (productLock.current) return;
    if (page === "editor" && JSON.stringify(product) !== originalDraft.current) { setDiscardTo(nextPage); setMenuOpen(false); return; }
    setError(null); setSuccess(null); setMenuOpen(false); setPage(nextPage);
  }

  function editProduct(item?: AdminProduct) {
    setError(null); setSuccess(null);
    const draft = item ? {
      id: item.id, slug: item.slug, name: item.name, description: item.description,
      nameEn: item.nameEn, brand: item.brand, brandEn: item.brandEn, descriptionEn: item.descriptionEn, listingStatus: item.listingStatus,
      pointPrice: item.pointPrice, imageUrls: item.imageUrls, inventory: item.inventory, published: item.published,
    } : emptyProduct();
    setProduct(draft); originalDraft.current = JSON.stringify(draft); setPage("editor");
  }

  async function uploadImages(files: FileList | null) {
    if (!files?.length || productLock.current) return;
    productLock.current = true; setBusy("image"); setError(null);
    try {
      const selected = [...files];
      if (selected.length + product.imageUrls.length > 6) throw new Error(zh ? "最多添加 6 张图片。" : "A product can have up to 6 images.");
      if (selected.some((file) => !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) || file.size > 8 * 1024 * 1024)) throw new Error(zh ? "请选择不超过 8 MB 的 JPG、PNG、WebP 或 AVIF 图片。" : "Choose JPG, PNG, WebP or AVIF images up to 8 MB each.");
      // Preserve completed uploads even if a later file fails.
      for (const file of selected) {
        const url = qa ? URL.createObjectURL(file) : await uploadAdminProductImage(file);
        if (qa) objectUrls.current.push(url);
        setProduct((current) => ({ ...current, imageUrls: [...current.imageUrls, url] }));
      }
    } catch (uploadError) { setError(messageFrom(uploadError)); } finally { productLock.current = false; setBusy(null); }
  }

  async function submitProduct(event: FormEvent) {
    event.preventDefault(); if (productLock.current) return;
    productLock.current = true; setBusy("product"); setError(null); setSuccess(null);
    try {
      if (qa) {
        setProducts((current) => [{ ...product, id: product.id ?? crypto.randomUUID(), published: product.listingStatus !== "unpublished", soldOut: product.inventory === 0, updatedAt: new Date().toISOString() }, ...current.filter((item) => item.id !== product.id)]);
      } else {
        const id = await saveAdminProduct(product);
        // If refreshing fails, retry updates this saved product rather than creating a duplicate.
        setProduct((current) => ({ ...current, id }));
        setProducts(await loadAdminProducts());
      }
      setPage("products"); setSuccess(zh ? "商品已保存" : "Product saved");
    } catch (saveError) { setError(messageFrom(saveError)); } finally { productLock.current = false; setBusy(null); }
  }

  async function deleteProduct() {
    if (!pendingDelete || productLock.current) return;
    productLock.current = true; setBusy("delete"); setError(null);
    try {
      if (!qa) await archiveAdminProduct(pendingDelete.id);
      setProducts((current) => current.filter((item) => item.id !== pendingDelete.id));
      setPendingDelete(null); setSuccess(zh ? "商品已删除，历史订单已保留" : "Product removed. Previous orders are preserved.");
    } catch (deleteError) { setError(messageFrom(deleteError)); setPendingDelete(null); }
    finally { productLock.current = false; setBusy(null); }
  }

  async function submitNotification(event: FormEvent) {
    event.preventDefault(); setBusy("notification"); setError(null); setSuccess(null);
    try {
      if (qa) {
        setBatches((current) => [{ id: crypto.randomUUID(), title: noticeTitle, body: noticeBody, category: noticeCategory, deliveryMode: "in_app", recipientCount: accounts.length, deliveredCount: 0, failedCount: 0, skippedCount: 0, pushStatus: "not_requested", createdAt: new Date().toISOString() }, ...current]);
      } else {
        const published = await publishAdminNotification({ title: noticeTitle, body: noticeBody, category: noticeCategory, target });
        setBatches(await loadAdminNotificationBatches());
        setSuccess(zh ? `已发送给 ${published.recipients} 个账号` : `Sent to ${published.recipients} accounts`);
      }
      setNoticeTitle(""); setNoticeBody("");
    } catch (publishError) { setError(messageFrom(publishError)); } finally { setBusy(null); }
  }

  async function searchAccounts(event?: FormEvent) {
    event?.preventDefault(); setBusy("accounts"); setError(null);
    try { if (!qa) setAccounts(await loadAdminAccounts(roleQuery)); }
    catch (searchError) { setError(messageFrom(searchError)); }
    finally { setBusy(null); }
  }

  async function applyRoleChange() {
    if (!pendingRole) return;
    const { account, nextRole } = pendingRole;
    setBusy(`role:${account.userId}`); setError(null); setSuccess(null);
    try {
      if (qa) setAccounts((current) => current.map((item) => item.userId === account.userId ? { ...item, role: nextRole } : item));
      else { await setAdminAccountRole(account.userId, nextRole); setAccounts(await loadAdminAccounts(roleQuery)); }
      setPendingRole(null);
      setSuccess(nextRole === "admin" ? (zh ? "已升级为管理员" : "Administrator access granted") : (zh ? "已降级为普通用户" : "Administrator access removed"));
    } catch (roleError) { setError(messageFrom(roleError)); } finally { setBusy(null); }
  }

  if (access === "loading") return <section className="admin-console-screen"><div className="admin-console-centered"><LoaderCircle className="admin-spin" size={28} /></div></section>;
  if (access === "denied") return <section className="admin-console-screen"><header className="home-experience-header admin-console-header"><button type="button" className="home-experience-back" onClick={onHome} aria-label={zh ? "返回首页" : "Back home"}><Home size={21} /></button><div><h1>{zh ? "管理员端" : "Admin"}</h1></div><span /></header><div className="admin-console-centered"><ShieldCheck size={42} /><strong>{zh ? "此账号没有管理员权限" : "This account is not an administrator"}</strong>{error && <small>{error}</small>}<button type="button" onClick={onHome}>{zh ? "返回首页" : "Back home"}</button></div></section>;

  return <section ref={screen} className="admin-console-screen" data-admin-page={page}>
    <header className="home-experience-header admin-console-header">
      <button type="button" className="home-experience-back" disabled={!!busy} onClick={page === "overview" ? onHome : () => openPage(page === "editor" ? "products" : "overview")} aria-label={page === "overview" ? (zh ? "返回首页" : "Back home") : page === "editor" ? (zh ? "返回商品管理" : "Back to products") : (zh ? "返回管理员首页" : "Back to admin home")}>{page === "overview" ? <Home size={26} /> : <ArrowLeft size={26} />}</button>
      <div><span>NAVA CONTROL</span><h1>{pageTitle}</h1></div>
      <MoreMenu open={menuOpen} onOpenChange={setMenuOpen} label={zh ? "更多管理员操作" : "More admin actions"} className="admin-console-menu" buttonClassName="admin-console-more">
        {page !== "recent" && <button type="button" onClick={() => openPage("recent")}><History /><span>{zh ? "最近发布" : "Recent releases"}</span></button>}
        {page !== "overview" && <button type="button" onClick={() => openPage("overview")}><Boxes /><span>{zh ? "功能首页" : "Admin home"}</span></button>}
      </MoreMenu>
    </header>

    {(error || success) && <div className={["admin-console-toast", error ? "is-error" : "is-success"].join(" ")} role={error ? "alert" : "status"}>{error ? <X size={17} /> : <Check size={17} />}<span>{error ?? success}</span><button type="button" onClick={() => { setError(null); setSuccess(null); }} aria-label={zh ? "关闭" : "Close"}><X size={15} /></button></div>}

    {page === "overview" && <div className="admin-console-overview">
      <div className="admin-console-actions">
        <button type="button" data-admin-action="products" aria-label={zh ? "商品管理" : "Product management"} onClick={() => openPage("products")}><span className="is-products"><Store /></span><div><strong>{zh ? "商品管理" : "Product management"}</strong><small>{zh ? "发布和维护积分商城商品" : "Publish and maintain shop products"}</small></div><ChevronRight /></button>
        <button type="button" data-admin-action="notices" aria-label={zh ? "发布通知" : "Publish notices"} onClick={() => openPage("notifications")}><span className="is-notices"><BellRing /></span><div><strong>{zh ? "发布通知" : "Publish notices"}</strong><small>{zh ? "发送通知并自动启用可用推送" : "Send notices with available push delivery"}</small></div><ChevronRight /></button>
        <button type="button" data-admin-action="roles" aria-label={zh ? "管理员权限" : "Administrator access"} onClick={() => openPage("roles")}><span className="is-roles"><UsersRound /></span><div><strong>{zh ? "管理员权限" : "Administrator access"}</strong><small>{zh ? "按邮箱或手机号管理身份" : "Manage access by email or phone"}</small></div><ChevronRight /></button>
      </div>
    </div>}

    {page === "products" && <div className="admin-console-content">
      <div className="admin-console-intro"><span><Boxes size={21} /></span><div><strong>{zh ? "积分商城商品" : "Points shop products"}</strong><small>{zh ? `${products.length} 件商品` : `${products.length} products`}</small></div><button type="button" onClick={() => editProduct()}><ImagePlus size={17} />{zh ? "发布商品" : "New product"}</button></div>
      <div className="admin-product-list">{products.length === 0 && <div className="admin-empty"><PackageCheck size={34} /><strong>{zh ? "还没有商品" : "No products yet"}</strong></div>}{products.map((item) => {
        const name = zh ? item.name : item.nameEn || item.name;
        return <article key={item.id}><div className="admin-product-thumb">{item.imageUrls[0] ? <img src={item.imageUrls[0]} alt="" /> : <Store size={26} />}</div><div><strong>{name}</strong><small>{item.pointPrice} XP · {zh ? `库存 ${item.inventory}` : `${item.inventory} in stock`}</small><span className={`is-${item.listingStatus}`}>{item.listingStatus === "upcoming" ? (zh ? "待上架" : "Coming soon") : item.listingStatus === "published" ? (zh ? "已上架" : "Published") : (zh ? "已下架" : "Unpublished")}</span></div><div className="admin-product-actions"><button type="button" onClick={() => editProduct(item)} aria-label={zh ? `编辑${name}` : `Edit ${name}`}><Pencil size={21} /></button><button type="button" className="is-delete" onClick={() => setPendingDelete(item)} aria-label={zh ? `删除${name}` : `Delete ${name}`}><Trash2 size={21} /></button></div></article>;
      })}</div>
    </div>}

    {page === "notifications" && <div className="admin-console-content admin-notice-layout"><form className="admin-form-card" onSubmit={submitNotification}>
      <div className="admin-card-heading"><span><BellRing size={20} /></span><div><strong>{zh ? "发布通知" : "Publish notice"}</strong><small>{zh ? "发送到用户通知中心" : "Send to user inboxes"}</small></div></div>
      <label><span>{zh ? "标题" : "Title"}</span><input value={noticeTitle} maxLength={160} placeholder={zh ? "填写通知标题" : "Notice title"} onChange={(event) => setNoticeTitle(event.target.value)} required /></label>
      <label className="admin-notice-message"><span>{zh ? "内容" : "Message"}</span><textarea value={noticeBody} maxLength={1000} rows={1} placeholder={zh ? "填写通知内容" : "Write the message"} onChange={(event) => setNoticeBody(event.target.value)} required /></label>
      <label><span>{zh ? "分类" : "Category"}</span><select value={noticeCategory} onChange={(event) => setNoticeCategory(event.target.value as NavaNotificationCategory)}>{categoryOptions.map((item) => <option key={item.id} value={item.id}>{zh ? item.zh : item.en}</option>)}</select></label>
      <label><span>{zh ? "点击后打开" : "Open on tap"}</span><select value={targetId} onChange={(event) => setTargetId(event.target.value)}>{targets.map((item) => <option key={item.id} value={item.id}>{zh ? item.zh : item.en}</option>)}</select></label>
      <button className="admin-primary-action" type="submit" disabled={busy === "notification"}>{busy === "notification" ? <LoaderCircle className="admin-spin" size={18} /> : <Send size={18} />}{zh ? "发送通知" : "Send notice"}</button>
    </form></div>}

    {page === "roles" && <div className="admin-console-content admin-role-layout">
      <form className="admin-account-search" onSubmit={(event) => void searchAccounts(event)}><label><Search size={18} /><input value={roleQuery} onChange={(event) => setRoleQuery(event.target.value)} placeholder={zh ? "邮箱或手机号" : "Email or phone"} aria-label={zh ? "搜索账号" : "Search accounts"} /></label><button type="submit" disabled={busy === "accounts"}>{busy === "accounts" ? <LoaderCircle className="admin-spin" size={17} /> : (zh ? "查找" : "Search")}</button></form>
      <div className="admin-account-list">{accounts.length === 0 && <div className="admin-empty is-compact"><UsersRound size={28} /><span>{zh ? "没有找到账号" : "No accounts found"}</span></div>}{accounts.map((account) => { const isSelf = account.userId === user.id; const nextRole = account.role === "admin" ? "member" : "admin"; return <article key={account.userId}><span className={account.role === "admin" ? "is-admin" : "is-member"}><UsersRound size={19} /></span><div><strong>{accountIdentity(account, zh)}</strong>{account.email && account.phone && <small>{account.phone}</small>}<em>{account.role === "admin" ? (zh ? "管理员" : "Administrator") : (zh ? "普通用户" : "Member")}</em></div>{isSelf ? <button type="button" disabled>{zh ? "当前账号" : "Current"}</button> : <button type="button" onClick={() => setPendingRole({ account, nextRole })} disabled={busy === `role:${account.userId}`}>{nextRole === "admin" ? (zh ? "升级" : "Promote") : (zh ? "降级" : "Demote")}</button>}</article>; })}</div>
    </div>}

    {page === "recent" && <div className="admin-console-content"><div className="admin-batch-list"><h2>{zh ? "最近发布" : "Recent releases"}</h2>{batches.length === 0 && <div className="admin-empty is-compact"><BellRing size={27} /><span>{zh ? "暂无通知" : "No notices"}</span></div>}{batches.map((batch) => <article key={batch.id}><span className={`admin-category-dot is-${batch.category}`} /><div><strong>{batch.title}</strong><small>{new Date(batch.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {zh ? `${batch.recipientCount} 个账号` : `${batch.recipientCount} accounts`}</small></div><em>{batchStatus(batch, zh)}</em></article>)}</div></div>}

    {page === "editor" && <AdminProductEditor product={product} onChange={setProduct} onUpload={uploadImages} onSubmit={submitProduct} busy={!!busy} zh={zh} />}
    {(pendingDelete || discardTo) && <dialog ref={confirmDialog} className="admin-confirm-dialog" aria-labelledby="admin-product-confirm-title" onCancel={(event) => { event.preventDefault(); if (!busy) { setPendingDelete(null); setDiscardTo(null); } }}>
      <h2 id="admin-product-confirm-title">{pendingDelete ? (zh ? "删除这个商品？" : "Remove this product?") : (zh ? "放弃未保存的修改？" : "Discard unsaved changes?")}</h2>
      <p>{pendingDelete ? (zh ? "商品将从商城移除，历史订单会保留。" : "The item will leave the shop. Previous orders are preserved.") : (zh ? "离开后，本次未保存的内容将丢失。" : "Your unsaved changes will be lost.")}</p>
      <div><button type="button" disabled={!!busy} autoFocus onClick={() => { setPendingDelete(null); setDiscardTo(null); }}>{zh ? "取消" : "Cancel"}</button>
      <button type="button" disabled={!!busy} onClick={() => { if (pendingDelete) void deleteProduct(); else if (discardTo) { setPage(discardTo); setDiscardTo(null); setError(null); setSuccess(null); } }}>{busy ? <LoaderCircle className="admin-spin" /> : pendingDelete ? (zh ? "删除商品" : "Remove product") : (zh ? "放弃修改" : "Discard")}</button></div>
    </dialog>}

    {pendingRole && <div className="admin-role-confirm-layer" role="presentation" onClick={() => setPendingRole(null)}><div className="admin-role-confirm" role="dialog" aria-modal="true" aria-labelledby="admin-role-confirm-title" onClick={(event) => event.stopPropagation()}><span className={pendingRole.nextRole === "admin" ? "is-admin" : "is-member"}><ShieldCheck size={24} /></span><h2 id="admin-role-confirm-title">{pendingRole.nextRole === "admin" ? (zh ? "升级为管理员？" : "Promote to administrator?") : (zh ? "取消管理员权限？" : "Remove administrator access?")}</h2><p>{accountIdentity(pendingRole.account, zh)}</p><div><button type="button" onClick={() => setPendingRole(null)}>{zh ? "取消" : "Cancel"}</button><button type="button" onClick={() => void applyRoleChange()}>{zh ? "确认" : "Confirm"}</button></div></div></div>}
  </section>;
}
