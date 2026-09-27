import type { User } from "@supabase/supabase-js";
import { ArrowLeft, Cat, ChevronRight, Coins, CupSoda, Gift, Image, LoaderCircle, Minus, NotebookPen, PackageOpen, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../i18n";
import MascotImage from "../components/MascotImage";
import ShopCheckoutExperience from "../components/ShopCheckoutExperience";
import shopCat from "../assets/mascot/animated/home-drowsy.webp";
import shopCatStill from "../assets/figma/home-option2/home-mascot-v5.png";
import { filterShopProducts, SHOP_CATEGORIES, shopCategory } from "../services/rewardShopCatalog";
import {
  checkoutRewardCart,
  loadRewardCart,
  loadRewardPointsBalance,
  loadRewardProducts,
  placeholderRewardProducts,
  setRewardCartItem,
  type RewardCartLine,
  type RewardCheckoutResult,
  type RewardProduct,
} from "../services/rewardShop";

type ShopRoute = "catalog" | "category" | "cart" | "product";
const categoryIcons = { gift: Gift, cat: Cat, notebook: NotebookPen, cup: CupSoda };

function shopVisualFixture(locale: "zh" | "en"): RewardProduct {
  return {
    id: "qa-nava-journal",
    slug: "qa-nava-journal",
    name: locale === "zh" ? "NAVA 测试手账（仅本地）" : "NAVA test journal (local only)",
    description: locale === "zh" ? "仅用于本地验证积分兑换动画，不代表线上真实商品。" : "A local-only fixture for checkout animation review.",
    pointPrice: 120,
    imageUrls: [],
    soldOut: false,
  };
}

function parseShopRoute(view: string | null) {
  if (view === "points-shop-cart") return { route: "cart" as ShopRoute, productId: null };
  if (view?.startsWith("points-shop-product-")) return { route: "product" as ShopRoute, productId: view.slice("points-shop-product-".length) };
  return { route: (view?.startsWith("points-shop-category-") ? "category" : "catalog") as ShopRoute, productId: null };
}

function readableShopError(error: unknown, locale: "zh" | "en") {
  const message = error instanceof Error ? error.message : String(error);
  if (/sold out/i.test(message)) return locale === "zh" ? "商品刚刚售罄，购物车已为你保留但无法结算。" : "This product just sold out and cannot be checked out.";
  if (/insufficient points/i.test(message)) return locale === "zh" ? "当前积分不足，暂时无法完成兑换。" : "You do not have enough points for this order.";
  if (/cart is empty/i.test(message)) return locale === "zh" ? "购物车还是空的。" : "Your cart is empty.";
  return locale === "zh" ? "暂时无法完成，请稍后重试。" : "Something went wrong. Please try again.";
}

export default function PointsShopExperience({
  user,
  view,
  onViewChange,
  onBack,
}: {
  user: User;
  view: string | null;
  onViewChange: (view: string | null) => void;
  onBack: () => void;
}) {
  const { locale } = useLocale();
  const { route: activeRoute, productId: activeProductId } = parseShopRoute(view);
  const category = shopCategory(view?.replace("points-shop-category-", "") ?? "all");
  const [query, setQuery] = useState("");
  const [catalogView, setCatalogView] = useState("points-shop");
  const screenRef = useRef<HTMLElement>(null);
  const mutationRef = useRef(false);
  const checkoutRequestRef = useRef<string | null>(null);
  const visualFixture = import.meta.env.DEV && new URLSearchParams(window.location.search).get("qa") === "shop-checkout";
  const [products, setProducts] = useState<RewardProduct[]>([]);
  const [cart, setCart] = useState<RewardCartLine[]>([]);
  const [points, setPoints] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<{ lines: RewardCartLine[]; expectedTotal: number; result: RewardCheckoutResult | null } | null>(null);
  const [slide, setSlide] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (visualFixture) {
      const fixture = shopVisualFixture(locale);
      setProducts([fixture]);
      setCart([{ product: fixture, quantity: 1 }]);
      setPoints(460);
      setLoading(false);
      return;
    }
    try {
      const loadedProducts = await loadRewardProducts();
      const visibleProducts = loadedProducts.length > 0 ? loadedProducts : placeholderRewardProducts(locale);
      const [loadedCart, balance] = await Promise.all([
        loadRewardCart(user.id, loadedProducts),
        loadRewardPointsBalance(),
      ]);
      setProducts(visibleProducts);
      setCart(loadedCart);
      setPoints(balance);
    } catch (loadError) {
      setError(readableShopError(loadError, locale));
    } finally {
      setLoading(false);
    }
  }, [locale, user.id, visualFixture]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { screenRef.current?.scrollTo({ top: 0 }); setSlide(0); }, [view]);
  useEffect(() => {
    const frame = screenRef.current?.closest(".phone-frame");
    frame?.classList.toggle("has-shop-checkout", Boolean(checkoutSession));
    return () => frame?.classList.remove("has-shop-checkout");
  }, [checkoutSession]);

  const product = useMemo(() => products.find((candidate) => candidate.id === activeProductId) ?? null, [activeProductId, products]);
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + (line.product.pointPrice ?? 0) * line.quantity, 0);
  const visibleProducts = filterShopProducts(products, category, query);
  const selectedCategory = SHOP_CATEGORIES.find((item) => item.id === category)!;
  const quantityOf = (item: RewardProduct) => cart.find((line) => line.product.id === item.id)?.quantity ?? 0;
  const cannotAdd = (item: RewardProduct) => !!item.placeholder || item.soldOut || item.pointPrice === null || busyId !== null || quantityOf(item) >= 5;
  function openItem(nextView: string) {
    if (activeRoute === "catalog" || activeRoute === "category") setCatalogView(view ?? "points-shop");
    onViewChange(nextView);
  }

  async function updateCart(target: RewardProduct, quantity: number, nextView?: string) {
    // Zero removes even a sold-out item through the existing server contract.
    if (mutationRef.current || target.placeholder || quantity > 5 || (quantity > 0 && (target.soldOut || target.pointPrice === null))) return;
    mutationRef.current = true;
    setBusyId(target.id);
    setError(null);
    try {
      if (visualFixture) {
        setCart(quantity > 0 ? [{ product: target, quantity }] : []);
        checkoutRequestRef.current = null;
        if (nextView) onViewChange(nextView);
        return;
      }
      await setRewardCartItem(target.id, quantity);
      const freshProducts = await loadRewardProducts();
      setProducts(freshProducts.length > 0 ? freshProducts : placeholderRewardProducts(locale));
      setCart(await loadRewardCart(user.id, freshProducts));
      checkoutRequestRef.current = null;
      if (nextView) onViewChange(nextView);
    } catch (cartError) {
      setError(readableShopError(cartError, locale));
    } finally {
      mutationRef.current = false;
      setBusyId(null);
    }
  }

  async function checkout() {
    if (mutationRef.current) return;
    mutationRef.current = true;
    setBusyId("checkout");
    setError(null);
    const lines = cart.map((line) => ({ ...line, product: { ...line.product, imageUrls: [...line.product.imageUrls] } }));
    const expectedTotal = lines.reduce((sum, line) => sum + (line.product.pointPrice ?? 0) * line.quantity, 0);
    setCheckoutSession({ lines, expectedTotal, result: null });
    screenRef.current?.scrollTo({ top: 0 });
    try {
      const requestKey = checkoutRequestRef.current ?? crypto.randomUUID();
      checkoutRequestRef.current = requestKey;
      const result = visualFixture
        ? await new Promise<RewardCheckoutResult>((resolve) => window.setTimeout(() => resolve({ orderId: "qa-order-20260927", totalPoints: expectedTotal, balance: Math.max(0, (points ?? 0) - expectedTotal), replayed: false }), 520))
        : await checkoutRewardCart(requestKey);
      setCart([]);
      setPoints(result.balance);
      setCheckoutSession((current) => current ? { ...current, result } : current);
      checkoutRequestRef.current = null;
      if (!visualFixture) {
        const freshProducts = await loadRewardProducts();
        setProducts(freshProducts.length > 0 ? freshProducts : placeholderRewardProducts(locale));
      }
    } catch (checkoutError) {
      setCheckoutSession(null);
      await refresh();
      setError(readableShopError(checkoutError, locale));
    } finally {
      mutationRef.current = false;
      setBusyId(null);
    }
  }

  const title = activeRoute === "cart"
    ? (locale === "zh" ? "购物车" : "Cart")
    : activeRoute === "product"
      ? (locale === "zh" ? "商品详情" : "Product")
      : activeRoute === "category" ? selectedCategory[locale] : (locale === "zh" ? "积分商城" : "Points shop");
  const back = activeRoute === "catalog" ? onBack : () => onViewChange(activeRoute === "category" ? "points-shop" : catalogView);

  if (checkoutSession) return (
    <section ref={screenRef} className="home-experience points-shop-screen points-shop-screen--checkout">
      <ShopCheckoutExperience
        locale={locale}
        lines={checkoutSession.lines}
        expectedTotal={checkoutSession.expectedTotal}
        result={checkoutSession.result}
        onDone={() => {
          setCheckoutSession(null);
          onViewChange("points-shop");
        }}
      />
    </section>
  );

  return (
    <section ref={screenRef} className="home-experience points-shop-screen" data-shop-route={activeRoute}>
      <header className="home-experience-header points-shop-header">
        <button className="home-experience-back" type="button" onClick={back} aria-label={locale === "zh" ? "返回" : "Back"}><ArrowLeft size={21} /></button>
        <div><h1>{title}</h1></div>
        <button className="points-shop-cart-shortcut" type="button" onClick={() => openItem("points-shop-cart")} aria-label={locale === "zh" ? `购物车，共 ${cartCount} 件` : `Cart, ${cartCount} items`}>
          <ShoppingCart size={22} />{cartCount > 0 && <span>{cartCount}</span>}
        </button>
      </header>

      {activeRoute === "catalog" && <>
        <section className="points-shop-hero">
          <div className="points-shop-hero-copy"><span>NAVA LITTLE SHOP</span><h2>{locale === "zh" ? <>把小日常<br />变成小喜欢</> : <>Little joys,<br />just for you.</>}</h2></div>
          <MascotImage className="points-shop-mascot" animatedSrc={shopCat} staticSrc={shopCatStill} alt="" aria-hidden="true" />
          <div className="points-shop-balance"><Coins size={20} /><span>{locale === "zh" ? "我的积分" : "My points"}</span><strong>{points?.toLocaleString() ?? "—"}<small> XP</small></strong></div>
        </section>
        <nav className="points-shop-categories" aria-label={locale === "zh" ? "商品分类" : "Product categories"}>
          {SHOP_CATEGORIES.map((item) => { const Icon = categoryIcons[item.icon]; return <button key={item.id} type="button" data-category={item.id} onClick={() => { setQuery(""); onViewChange(`points-shop-category-${item.id}`); }}><span><Icon size={25} strokeWidth={1.7} /></span><b>{item[locale]}</b></button>; })}
        </nav>
      </>}
      {(activeRoute === "catalog" || activeRoute === "category") && <>
        <div className="points-shop-search"><Search size={19} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={locale === "zh" ? "找一份小喜欢" : "Find a little joy"} aria-label={locale === "zh" ? "搜索商品" : "Search products"} />{query && <button type="button" onClick={() => setQuery("")} aria-label={locale === "zh" ? "清除搜索" : "Clear search"}><X size={17} /></button>}</div>
        {activeRoute === "category" && <nav className="points-shop-category-tabs" aria-label={locale === "zh" ? "商品分类" : "Product categories"}>{SHOP_CATEGORIES.map((item) => <button key={item.id} type="button" aria-current={item.id === category ? "page" : undefined} onClick={() => onViewChange(`points-shop-category-${item.id}`)}>{item[locale]}</button>)}</nav>}
        {activeRoute === "catalog" && <div className="points-shop-section-heading"><h2>{locale === "zh" ? "逛逛好物" : "Find a little favourite"}</h2><button type="button" onClick={() => onViewChange("points-shop-category-all")}>{locale === "zh" ? "全部" : "View all"}<ChevronRight size={16} /></button></div>}
      </>}
      {error && <div className="points-shop-error" role="alert"><p>{error}</p><button type="button" onClick={() => void refresh()}>{locale === "zh" ? "重试" : "Retry"}</button></div>}
      {loading ? (
        <div className="points-shop-loading" aria-label={locale === "zh" ? "正在加载积分商城" : "Loading points shop"}><LoaderCircle size={26} /></div>
      ) : activeRoute === "catalog" || activeRoute === "category" ? (
        visibleProducts.length === 0 ? (!error && <div className="points-shop-empty"><PackageOpen size={36} /><p>{query ? (locale === "zh" ? "没有找到相关好物" : "No matching products") : (locale === "zh" ? "这一类好物还在准备中" : "New arrivals on the way")}</p><button type="button" onClick={() => { setQuery(""); onViewChange("points-shop-category-all"); }}>{locale === "zh" ? "看看全部好物" : "Browse all gifts"}</button></div>) :
        <div className="points-shop-list">
          {visibleProducts.map((item) => {
            return <article className={["points-shop-product-row", item.soldOut ? "is-sold-out" : "", item.placeholder ? "is-placeholder" : ""].filter(Boolean).join(" ")} key={item.id}>
              <button className="points-shop-product-open" type="button" onClick={() => openItem(`points-shop-product-${item.id}`)}>
                <span className="points-shop-product-image">
                  {item.imageUrls[0] ? <img src={item.imageUrls[0]} alt="" loading="lazy" decoding="async" /> : <span className="points-shop-image-pending"><Gift size={36} strokeWidth={1.3} /><small>{item.placeholder ? (locale === "zh" ? "敬请期待" : "Coming soon") : (locale === "zh" ? "图片待更新" : "Photo coming soon")}</small></span>}
                  {item.soldOut && <b>{locale === "zh" ? "已售罄" : "Sold out"}</b>}
                </span>
                <span className="points-shop-product-copy"><strong>{item.name}</strong></span>
              </button>
              <div className="points-shop-card-footer"><span className={`points-shop-price${(item.pointPrice ?? 0) >= 1000000 ? " is-long" : ""}`}>{item.pointPrice === null ? <small>{locale === "zh" ? "待上架" : "Coming soon"}</small> : <><strong>{item.pointPrice.toLocaleString()}</strong><small>XP</small></>}</span><button className="points-shop-add" type="button" disabled={cannotAdd(item)} onClick={() => void updateCart(item, quantityOf(item) + 1)} aria-label={locale === "zh" ? `将${item.name}加入购物车` : `Add ${item.name} to cart`}>{busyId === item.id ? <LoaderCircle size={19} /> : <Plus size={21} />}</button></div>
            </article>;
          })}
        </div>
      ) : activeRoute === "product" ? (
        product ? <article className={["points-shop-detail", product.soldOut ? "is-sold-out" : ""].filter(Boolean).join(" ")}>
          <div className="points-shop-carousel" ref={carouselRef} onScroll={(event) => setSlide(Math.round(event.currentTarget.scrollLeft / Math.max(1, event.currentTarget.clientWidth)))}>
            {(product.imageUrls.length > 0 ? product.imageUrls : [""]).map((url, index) => <div className="points-shop-slide" key={`${url}-${index}`}>
              {url ? <img src={url} alt={`${product.name} ${index + 1}`} /> : <span><PackageOpen size={42} /><small>{locale === "zh" ? "商品图片待上架" : "Image coming soon"}</small></span>}
              {product.soldOut && <b>{locale === "zh" ? "已售罄" : "Sold out"}</b>}
            </div>)}
          </div>
          {product.imageUrls.length > 1 && <div className="points-shop-dots" aria-label={locale === "zh" ? `第 ${slide + 1} 张图片` : `Image ${slide + 1}`}>
            {product.imageUrls.map((_, index) => <button type="button" aria-current={index === slide ? "true" : undefined} key={index} onClick={() => carouselRef.current?.scrollTo({ left: index * carouselRef.current.clientWidth, behavior: "smooth" })} aria-label={`${index + 1}`}><span /></button>)}
          </div>}
          <div className="points-shop-detail-copy"><h2>{product.name}</h2><strong>{locale === "zh" ? "定价：" : "Price: "}{product.pointPrice === null ? (locale === "zh" ? "待填写" : "TBD") : `${product.pointPrice} XP`}</strong>{!product.placeholder && product.description && <p>{product.description}</p>}</div>
          <footer><button type="button" disabled={cannotAdd(product)} onClick={() => void updateCart(product, (cart.find((line) => line.product.id === product.id)?.quantity ?? 0) + 1)}><ShoppingCart size={18} />{locale === "zh" ? "加入购物车" : "Add to cart"}</button><button type="button" disabled={cannotAdd(product)} onClick={() => void updateCart(product, (cart.find((line) => line.product.id === product.id)?.quantity ?? 0) + 1, "points-shop-cart")}>{locale === "zh" ? "立即兑换" : "Redeem now"}</button></footer>
        </article> : <div className="points-shop-empty"><PackageOpen size={36} /><p>{locale === "zh" ? "没有找到这个商品。" : "Product not found."}</p></div>
      ) : (
        <div className="points-shop-cart">
          {cart.length === 0 ? <div className="points-shop-empty"><ShoppingCart size={38} /><p>{locale === "zh" ? "购物车还是空的" : "Your cart is empty"}</p><button type="button" onClick={() => onViewChange("points-shop")}>{locale === "zh" ? "返回商城" : "Browse shop"}</button></div> : <>
            <div className="points-shop-cart-list">{cart.map((line) => <article key={line.product.id}>
              <span className="points-shop-cart-thumb">{line.product.imageUrls[0] ? <img src={line.product.imageUrls[0]} alt="" /> : <Image size={22} />}</span>
              <div><strong>{line.product.name}</strong><small>{line.product.pointPrice} XP</small></div>
              <div className="points-shop-quantity"><button type="button" disabled={busyId !== null} onClick={() => void updateCart(line.product, line.product.soldOut ? 0 : line.quantity - 1)} aria-label={line.product.soldOut ? (locale === "zh" ? "移除售罄商品" : "Remove sold out item") : (locale === "zh" ? "减少数量" : "Decrease quantity")}>{line.product.soldOut ? <Trash2 size={17} /> : <Minus size={17} />}</button><span>{line.quantity}</span><button type="button" disabled={cannotAdd(line.product)} onClick={() => void updateCart(line.product, line.quantity + 1)} aria-label={locale === "zh" ? "增加数量" : "Increase quantity"}><Plus size={16} /></button></div>
            </article>)}</div>
            <section className="points-shop-checkout"><div><span>{locale === "zh" ? "合计" : "Total"}</span><strong>{cartTotal.toLocaleString()} XP</strong></div><small>{locale === "zh" ? `余额 ${points ?? "--"} XP` : `Balance ${points ?? "--"} XP`}</small><button type="button" disabled={busyId !== null || points === null || points < cartTotal || cart.some((line) => line.product.soldOut || line.product.pointPrice === null)} onClick={() => void checkout()}>{busyId === "checkout" && <LoaderCircle size={17} />}{locale === "zh" ? "确认兑换" : "Confirm order"}</button></section>
          </>}
        </div>
      )}
    </section>
  );
}
