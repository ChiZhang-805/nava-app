import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, CheckCircle2, ChevronDown, CircleHelp, ExternalLink, KeyRound, LoaderCircle, RefreshCw, XCircle } from 'lucide-react';
import { useLocale } from '../i18n';
import { AdminServiceStatusError, loadAdminServiceStatus, type AdminServiceSnapshot, type BalanceState, type FunctionStatus, type ServiceId, type ServiceSignal } from '../services/adminServiceStatus';
import './admin-service-status.css';

const serviceNames: Record<ServiceId, [string, string]> = {
  chat_text: ['瓦咪儿文字聊天', 'Wamier text chat'], chat_images: ['聊天图片识别', 'Chat image recognition'],
  record_text: ['记录整理与陪聊', 'Record assistance'], record_food_image: ['记录页饮食识别', 'Journal food photos'],
  record_face_image: ['记录页面部观察', 'Journal face photos'], extract_text: ['聊天记录提取', 'Chat record extraction'],
  diet_photo: ['饮食照片识别', 'Food photo recognition'], face_photo: ['面部照片观察', 'Face photo observations'],
  health_report: ['健康报告', 'Health reports'], diet_report: ['饮食报告', 'Food reports'],
  food_visual: ['统一俯视菜品图', 'Overhead food images'], food_matting: ['菜品图透明处理', 'Food background removal'],
};
const reasons: Record<FunctionStatus['reason'], [string, string]> = {
  not_observed: ['尚无功能验证', 'Not verified'], configuration_missing: ['缺少配置', 'Missing configuration'],
  configuration_invalid: ['配置无效', 'Invalid configuration'], recent_success: ['最近成功', 'Recent success'],
  recent_failure: ['最近失败', 'Recent failure'], observation_stale: ['结果已过期', 'Result is stale'],
  needs_details: ['记录信息不足', 'More record detail needed'], observation_unavailable: ['暂时无法读取结果', 'Results unavailable'],
  provider_unavailable: ['服务账户受限', 'Provider account blocked'],
};
const balanceNames: Record<BalanceState, [string, string]> = {
  available: ['余额可用', 'Balance available'], insufficient: ['额度不足', 'Insufficient balance'],
  unconfigured: ['尚未配置', 'Not configured'], unauthorized: ['Key 无效或无权限', 'Invalid key or permission'],
  rate_limited: ['查询限流，请稍后刷新', 'Rate limited; refresh later'], unavailable: ['暂时无法查询', 'Temporarily unavailable'], unknown: ['未获得有效余额', 'Balance not available'],
};
function Badge({ signal, children }: { signal: ServiceSignal; children: React.ReactNode }) {
  const Icon = signal === 'success' ? CheckCircle2 : signal === 'error' ? XCircle : CircleHelp;
  return <span className="admin-service-badge" data-signal={signal}><Icon size={15} aria-hidden="true" />{children}</span>;
}

export default function AdminServiceStatus() {
  const { locale } = useLocale(); const zh = locale === 'zh'; const lang = zh ? 0 : 1;
  const [snapshot, setSnapshot] = useState<AdminServiceSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AdminServiceStatusError['code'] | null>(null);
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(null);
    try { const data = await loadAdminServiceStatus(controller.signal); if (!controller.signal.aborted) setSnapshot(data); }
    catch (failure) { if (!controller.signal.aborted) { const code = failure instanceof AdminServiceStatusError ? failure.code : 'status_unavailable'; setError(code); if (code !== 'status_unavailable') setSnapshot(null); } }
    finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }, []);
  useEffect(() => { void refresh(); return () => { active.current?.abort(); active.current = null; }; }, [refresh]);
  const time = (value: string) => new Date(value).toLocaleString(zh ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const balanceSignal: ServiceSignal = snapshot?.deepseek.state === 'available' ? 'success' : ['insufficient', 'unauthorized', 'unconfigured'].includes(snapshot?.deepseek.state ?? '') ? 'error' : 'unknown';

  return <div className="admin-console-content admin-services">
    <div className="admin-services-toolbar">
      <div><strong>{zh ? '服务概况' : 'Service overview'}</strong><small aria-live="polite">{busy ? (zh ? '正在只读查询…' : 'Checking…') : snapshot ? `${zh ? '上次检查' : 'Last checked'} ${time(snapshot.checkedAt)}` : (zh ? '尚未检查' : 'Not checked')}</small></div>
      <button type="button" onClick={() => void refresh()} disabled={busy} aria-label={zh ? '刷新服务状态' : 'Refresh service status'}>{busy ? <LoaderCircle className="admin-spin" size={18} /> : <RefreshCw size={18} />}<span>{zh ? '刷新' : 'Refresh'}</span></button>
    </div>
    <p className="admin-services-note">{zh ? '配置齐全不等于功能可用。这里只读查询，不自动调用付费模型。' : 'Configured does not mean verified. These checks do not run paid models.'}</p>
    {error && <div className="admin-services-error" role="alert">{error === 'authentication_required' ? (zh ? '登录已失效，请重新登录。' : 'Your session expired. Sign in again.') : error === 'administrator_required' ? (zh ? '此账号没有管理员权限。' : 'Administrator access is required.') : (zh ? '暂时无法读取服务状态，请稍后刷新。' : 'Service status is unavailable. Please refresh later.')}{snapshot && <small>{zh ? '下方保留上次检查结果。' : 'The previous results remain below.'}</small>}</div>}
    {snapshot && <>
      <section className="admin-service-card" aria-labelledby="admin-balance-title">
        <h2 id="admin-balance-title">{zh ? '余额与额度' : 'Balance and quota'}</h2>
        <article className="admin-provider" data-provider="deepseek">
          <div className="admin-service-heading"><h3>DeepSeek</h3><Badge signal={balanceSignal}>{balanceNames[snapshot.deepseek.state][lang]}</Badge></div>
          {snapshot.deepseek.balances.map(balance => <div className="admin-service-balance" key={balance.currency}><strong>{balance.total}<small>{balance.currency}</small></strong><span>{zh ? '账户总余额' : 'Account balance'}</span><small>{zh ? '赠送' : 'Granted'} {balance.granted} · {zh ? '充值' : 'Topped up'} {balance.toppedUp}</small></div>)}
          <p><KeyRound size={14} aria-hidden="true" /><code>DEEPSEEK_API_KEY_NAVA</code></p>
          <small>{zh ? '余额查询成功不代表每项功能均已验证。' : 'A balance check does not verify each feature.'}</small>
        </article>
        <article className="admin-provider" data-provider="aliyun"><div className="admin-service-heading"><h3>{zh ? '阿里云百炼' : 'Alibaba Model Studio'}</h3><Badge signal="unknown">{zh ? '余额未接入' : 'Balance not connected'}</Badge></div><p>{zh ? '模型额度与阿里云账户余额不同。当前不读取账单，也不修改权限。' : 'Model quota differs from the cloud account balance. Billing access is not connected.'}</p><a href="https://bailian.console.aliyun.com/" target="_blank" rel="noopener noreferrer">{zh ? '打开百炼控制台' : 'Open Model Studio'}<ExternalLink size={14} /></a></article>
        <article className="admin-provider" data-provider="aidge"><div className="admin-service-heading"><h3>Aidge</h3><Badge signal="unknown">{zh ? '额度未接入' : 'Quota not connected'}</Badge></div><p>{zh ? '尚未接入剩余次数查询。配置和功能结果见下方。' : 'Remaining calls are not connected. Configuration and results are listed below.'}</p><a href="https://ecoa.console.aliyun.com/" target="_blank" rel="noopener noreferrer">{zh ? '打开 Aidge 控制台' : 'Open Aidge console'}<ExternalLink size={14} /></a></article>
      </section>
      <section className="admin-service-card" aria-labelledby="admin-features-title"><h2 id="admin-features-title"><Activity size={20} />{zh ? '功能状态' : 'Feature status'}</h2><p className="admin-services-note">{zh ? '绿色：最近 1 小时有真实成功记录；红色：配置异常或最近失败；灰色：未验证、过期或结果不可读。' : 'Green: real success within 1 hour. Red: a configuration issue or recent failure. Grey: unverified, stale or unavailable.'}</p>
        {snapshot.services.map(service => <details className="admin-service-feature" key={service.id} data-service={service.id}>
          <summary><span><strong>{serviceNames[service.id][lang]}</strong><small>{service.configuration === 'configured' ? (zh ? '配置已就绪' : 'Configuration ready') : service.configuration === 'missing' ? (zh ? '配置不完整' : 'Configuration incomplete') : (zh ? '配置需要修正' : 'Configuration needs attention')}</small></span><Badge signal={service.signal}>{reasons[service.reason][lang]}</Badge><ChevronDown className="admin-service-disclosure" size={15} aria-hidden="true" /></summary>
          <div className="admin-service-details"><p>{zh ? '仅展示变量名，不展示密钥。' : 'Variable names only; key values stay on the server.'}</p><ul>{service.credentials.map(item => <li key={item.name}><code>{item.name}</code><span>{item.configured ? (zh ? '已配置' : 'Configured') : item.required ? (zh ? '未配置' : 'Missing') : (zh ? '可选，未配置' : 'Optional, not set')}</span></li>)}</ul><p>{zh ? '上次结果：' : 'Last result: '}{service.observedAt ? time(service.observedAt) : (zh ? '暂无' : 'None')}</p>{service.errorCode && <p>{zh ? '错误类别：' : 'Error category: '}<code>{service.errorCode}</code></p>}</div>
        </details>)}
      </section>
      <section className="admin-service-card admin-food-activity"><h2>{zh ? '菜品图最近结果' : 'Recent food-image results'}</h2>{snapshot.foodActivity.available ? <><p>{zh ? '过去 24 小时，最近最多 50 个完成或失败的任务。' : 'Up to 50 recent finished or failed jobs in the last 24 hours.'}</p><dl><div><dt>{zh ? '成功' : 'Ready'}</dt><dd>{snapshot.foodActivity.ready}</dd></div><div><dt>{zh ? '失败' : 'Failed'}</dt><dd>{snapshot.foodActivity.failed}</dd></div><div><dt>{zh ? '需补充' : 'Need detail'}</dt><dd>{snapshot.foodActivity.needsDetails}</dd></div></dl>{snapshot.foodActivity.sampled === 0 && <small>{zh ? '暂无近期结果，不代表功能已验证。' : 'No recent results; the feature is not verified.'}</small>}</> : <p>{zh ? '暂时无法读取任务结果。' : 'Job results are unavailable.'}</p>}<small>{zh ? '不展示用户记录、照片或账号信息。' : 'No user records, photos or account details are shown.'}</small></section>
    </>}
  </div>;
}
