import type { User } from "@supabase/supabase-js";
import { ArrowLeft, CheckCircle2, Image, LoaderCircle, Minus, PackageOpen, Plus, ShoppingCart } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../i18n";
import {
  checkoutRewardCart,
  loadRewardCart,
  loadRewardPointsBalance,
  loadRewardProducts,
  placeholderRewardProducts,
  setRewardCartItem,
  type RewardCartLine,
  type RewardProduct,
} from "../services/rewardShop";

type ShopRoute = "catalog" | "cart" | "product";

function parseShopRoute(view: string | null) {
  if (view === "points-shop-cart") return { route: "cart" as ShopRoute, productId: null };
  if (view?.startsWith("points-shop-product-")) return { route: "product" as ShopRoute, productId: view.slice("points-shop-product-".length) };
  return { route: "catalog" as ShopRoute, productId: null };
}

function readableShopError(error: unknown, locale: "zh" | "en") {
  const message = error instanceof Error ? error.message : String(error);
  if (/sold out/i.test(message)) return locale === "zh" ? "商品刚刚售罄，购物车已为你保留但无法结算。" : "This product just sold out and cannot be checked out.";
  if (/insufficient points/i.test(message)) return locale === "zh" ? "当前积分不足，暂时无法完成兑换。" : "You do not have enough points for this order.";
  if (/cart is empty/i.test(message)) return locale === "zh" ? "购物车还是空的。" : "Your cart is empty.";
  return message;
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
  const [{ route, productId }] = useState(() => parseShopRoute(view));
  const parsedRoute = parseShopRoute(view);
  const activeRoute = parsedRoute.route || route;
  const activeProductId = parsedRoute.productId ?? productId;
  const [products, setProducts] = useState<RewardProduct[]>([]);
  const [cart, setCart] = useState<RewardCartLine[]>([]);
  const [points, setPoints] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderConfirmation, setOrderConfirmation] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      setProducts(placeholderRewardProducts(locale));
      setError(readableShopError(loadError, locale));
    } finally {
      setLoading(false);
    }
  }, [locale, user.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const product = useMemo(() => products.find((candidate) => candidate.id === activeProductId) ?? null, [activeProductId, products]);
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + (line.product.pointPrice ?? 0) * line.quantity, 0);

  async function updateCart(target: RewardProduct, quantity: number) {
    if (target.placeholder || target.soldOut || target.pointPrice === null) return;
    setBusyId(target.id);
    setError(null);
    try {
      await setRewardCartItem(target.id, quantity);
      const freshProducts = await loadRewardProducts();
      setProducts(freshProducts.length > 0 ? freshProducts : placeholderRewardProducts(locale));
      setCart(await loadRewardCart(user.id, freshProducts));
    } catch (cartError) {
      setError(readableShopError(cartError, locale));
    } finally {
      setBusyId(null);
    }
  }

  async function checkout() {
    setBusyId("checkout");
    setError(null);
    try {
      const result = await checkoutRewardCart();
      setCart([]);
      setPoints(result.balance);
      setOrderConfirmation(locale === "zh" ? `兑换成功，订单 ${result.orderId.slice(0, 8)} 已确认。` : `Order ${result.orderId.slice(0, 8)} is confirmed.`);
      const freshProducts = await loadRewardProducts();
      setProducts(freshProducts.length > 0 ? freshProducts : placeholderRewardProducts(locale));
    } catch (checkoutError) {
      setError(readableShopError(checkoutError, locale));
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  const title = activeRoute === "cart"
    ? (locale === "zh" ? "购物车" : "Cart")
    : activeRoute === "product"
      ? (locale === "zh" ? "商品详情" : "Product")
      : (locale === "zh" ? "积分商城" : "Points shop");
  const back = activeRoute === "catalog" ? onBack : () => onViewChange("points-shop");

  return (
    <section className="home-experience points-shop-screen" data-shop-route={activeRoute}>
      <header className="home-experience-header points-shop-header">
        <button className="home-experience-back" type="button" onClick={back} aria-label={locale === "zh" ? "返回" : "Back"}><ArrowLeft size={21} /></button>
        <div><h1>{title}</h1></div>
        <button className="points-shop-cart-shortcut" type="button" onClick={() => onViewChange("points-shop-cart")} aria-label={locale === "zh" ? `购物车，共 ${cartCount} 件` : `Cart, ${cartCount} items`}>
          <ShoppingCart size={22} />{cartCount > 0 && <span>{cartCount}</span>}
        </button>
      </header>

      {activeRoute === "catalog" && <div className="points-shop-balance"><span>{locale === "zh" ? "可用积分" : "Available points"}</span><strong>{points ?? "--"} XP</strong></div>}
      {error && <p className="home-experience-error points-shop-error" role="alert">{error}</p>}
      {orderConfirmation && <p className="points-shop-success" role="status"><CheckCircle2 size={17} />{orderConfirmation}</p>}

      {loading ? (
        <div className="points-shop-loading" aria-label={locale === "zh" ? "正在加载积分商城" : "Loading points shop"}><LoaderCircle size={26} /></div>
      ) : activeRoute === "catalog" ? (
        <div className="points-shop-list">
          {products.map((item) => {
            const disabled = item.placeholder || item.soldOut || item.pointPrice === null;
            return <article className={["points-shop-product-row", item.soldOut ? "is-sold-out" : "", item.placeholder ? "is-placeholder" : ""].filter(Boolean).join(" ")} key={item.id}>
              <button className="points-shop-product-open" type="button" onClick={() => onViewChange(`points-shop-product-${item.id}`)}>
                <span className="points-shop-product-image">
                  {item.imageUrls[0] ? <img src={item.imageUrls[0]} alt="" /> : <Image size={28} aria-hidden="true" />}
                  {item.soldOut && <b>{locale === "zh" ? "已售罄" : "Sold out"}</b>}
                </span>
                <span className="points-shop-product-copy"><strong>{item.name}</strong><small>{locale === "zh" ? "定价：" : "Price: "}{item.pointPrice === null ? (locale === "zh" ? "待填写" : "TBD") : `${item.pointPrice} XP`}</small></span>
              </button>
              <button className="points-shop-add" type="button" disabled={disabled || busyId === item.id} onClick={() => void updateCart(item, (cart.find((line) => line.product.id === item.id)?.quantity ?? 0) + 1)} aria-label={locale === "zh" ? `将${item.name}加入购物车` : `Add ${item.name} to cart`}><ShoppingCart size={20} /></button>
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
            {product.imageUrls.map((_, index) => <button type="button" className={index === slide ? "active" : ""} key={index} onClick={() => carouselRef.current?.scrollTo({ left: index * carouselRef.current.clientWidth, behavior: "smooth" })} aria-label={`${index + 1}`} />)}
          </div>}
          <div className="points-shop-detail-copy"><h2>{product.name}</h2><strong>{locale === "zh" ? "定价：" : "Price: "}{product.pointPrice === null ? (locale === "zh" ? "待填写" : "TBD") : `${product.pointPrice} XP`}</strong><p>{product.description}</p></div>
          <footer><button type="button" disabled={product.placeholder || product.soldOut || product.pointPrice === null || busyId === product.id} onClick={() => void updateCart(product, (cart.find((line) => line.product.id === product.id)?.quantity ?? 0) + 1)}><ShoppingCart size={18} />{locale === "zh" ? "加入购物车" : "Add to cart"}</button><button type="button" onClick={() => onViewChange("points-shop-cart")}>{locale === "zh" ? "去购物车" : "View cart"}</button></footer>
        </article> : <div className="points-shop-empty"><PackageOpen size={36} /><p>{locale === "zh" ? "没有找到这个商品。" : "Product not found."}</p></div>
      ) : (
        <div className="points-shop-cart">
          {cart.length === 0 ? <div className="points-shop-empty"><ShoppingCart size={38} /><p>{locale === "zh" ? "购物车还是空的" : "Your cart is empty"}</p><button type="button" onClick={() => onViewChange("points-shop")}>{locale === "zh" ? "返回商城" : "Browse shop"}</button></div> : <>
            <div className="points-shop-cart-list">{cart.map((line) => <article key={line.product.id}>
              <span className="points-shop-cart-thumb">{line.product.imageUrls[0] ? <img src={line.product.imageUrls[0]} alt="" /> : <Image size={22} />}</span>
              <div><strong>{line.product.name}</strong><small>{line.product.pointPrice} XP</small></div>
              <div className="points-shop-quantity"><button type="button" onClick={() => void updateCart(line.product, line.quantity - 1)} aria-label={locale === "zh" ? "减少数量" : "Decrease quantity"}><Minus size={16} /></button><span>{line.quantity}</span><button type="button" disabled={line.quantity >= 5 || line.product.soldOut} onClick={() => void updateCart(line.product, line.quantity + 1)} aria-label={locale === "zh" ? "增加数量" : "Increase quantity"}><Plus size={16} /></button></div>
            </article>)}</div>
            <section className="points-shop-checkout"><div><span>{locale === "zh" ? "合计" : "Total"}</span><strong>{cartTotal} XP</strong></div><small>{locale === "zh" ? `余额 ${points ?? "--"} XP` : `Balance ${points ?? "--"} XP`}</small><button type="button" disabled={busyId === "checkout" || points === null || points < cartTotal} onClick={() => void checkout()}>{busyId === "checkout" && <LoaderCircle size={17} />}{locale === "zh" ? "确认兑换" : "Confirm order"}</button></section>
          </>}
        </div>
      )}
    </section>
  );
}
