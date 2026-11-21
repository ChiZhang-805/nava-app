import { useCallback, useEffect, useRef, useState } from 'react';
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { Smartphone } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { animalAvatar, miyouError } from '../services/miyou';

const native = registerPlugin<{
  watchShake(): Promise<{ available: boolean }>;
  start(options: { token: string }): Promise<{ started: boolean }>;
  stop(): Promise<void>;
  addListener(event: string, callback: (data: { tokens?: string[] }) => void): Promise<PluginListenerHandle>;
}>('NavaNearby');
type Peer = { token: string; name: string };
async function nearby<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc('nava_miyou_nearby', { action, payload });
  if (error) throw error;
  return data as T;
}

export default function MiyouNearby({ zh, onInvited }: { zh: boolean; onInvited: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const alive = useRef(false);
  const token = useRef<string | null>(null);
  const pending = useRef(false);
  const candidates = useRef<string[]>([]);
  const generation = useRef(0);
  const retire = useCallback(() => {
    const previous = token.current; token.current = null; candidates.current = [];
    if (previous) void nearby('stop', { token: previous }).catch(() => {});
    if (alive.current) { setScanning(false); setPeers([]); }
  }, []);
  const start = useCallback(async () => {
    if (pending.current || token.current) return;
    pending.current = true; setStarting(true); setError(''); setPeers([]);
    const attempt = generation.current;
    try {
      const session = await nearby<{ token: string }>('start');
      if (!alive.current || attempt !== generation.current) { void nearby('stop', { token: session.token }).catch(() => {}); return; }
      token.current = session.token;
      await native.start({ token: session.token });
      if (alive.current && token.current) setScanning(true);
    } catch (e) { retire(); if (alive.current) setError(miyouError(e, zh)); }
    finally { pending.current = false; if (alive.current) setStarting(false); }
  }, [retire, zh]);
  useEffect(() => {
    alive.current = true;
    let disposed = false;
    const handles: PluginListenerHandle[] = [];
    const listen = async (event: string, callback: (data: { tokens?: string[] }) => void) => {
      if (disposed) return;
      const handle = await native.addListener(event, data => { if (!disposed) callback(data); });
      if (!disposed) handles.push(handle); else await handle.remove();
    };
    let lookup = false;
    const find = async () => {
      const active = token.current;
      if (!active || lookup) return;
      lookup = true;
      try {
        const result = await nearby<Peer[]>('find', { tokens: candidates.current });
        if (alive.current && token.current === active) setPeers(result);
      } catch (e) { if (alive.current && token.current === active) setError(miyouError(e, zh)); }
      finally { lookup = false; }
    };
    void (async () => {
      await listen('shake', () => { void start(); });
      await listen('peers', data => { candidates.current = data.tokens ?? []; void find(); });
      await listen('stopped', retire);
      await listen('waiting', () => setError(zh ? '请开启 Wi-Fi，并允许本地网络访问。' : 'Turn on Wi-Fi and allow Local Network access.'));
      await listen('ready', () => setError(''));
      await listen('failed', () => { retire(); setError(zh ? '请检查 Wi-Fi 和本地网络权限，再试一次。' : 'Check Wi-Fi and Local Network access, then retry.'); });
      if (!disposed) await native.watchShake();
    })().catch(e => { if (alive.current) setError(miyouError(e, zh)); });
    const timer = window.setInterval(() => { void find(); }, 4000);
    const visibility = () => {
      if (document.hidden) {
        generation.current += 1; retire(); void native.stop().catch(() => {});
      } else { void native.watchShake().catch(() => {}); }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true; alive.current = false; generation.current += 1;
      document.removeEventListener('visibilitychange', visibility);
      clearInterval(timer); retire();
      handles.forEach(handle => { void handle.remove(); });
      void native.stop().catch(() => {});
    };
  }, [retire, start, zh]);
  async function invite(peer: Peer) {
    if (sending) return;
    setSending(true); setError('');
    try { await nearby('invite', { token: peer.token }); if (alive.current) onInvited(); }
    catch (e) { if (alive.current) setError(miyouError(e, zh)); }
    finally { if (alive.current) setSending(false); }
  }
  return <div className="miyou-nearby miyou-scroll">
    <Smartphone size={64} aria-hidden="true"/>
    <h2>{zh ? '一起摇一摇' : 'Shake together'}</h2>
    <p role="status">{scanning ? (zh ? '正在发现附近咪友…' : 'Finding nearby friends…') : (zh ? '双方打开此页，摇一摇' : 'Both open this page and shake')}</p>
    <button className="miyou-primary" disabled={starting} onClick={() => {
      if (scanning) { retire(); void native.stop().then(() => native.watchShake()).catch(() => {}); }
      else void start();
    }}>{scanning ? (zh ? '停止查找' : 'Stop finding') : (zh ? '开始查找' : 'Find friends')}</button>
    {error && <p role="alert">{error}</p>}
    <div className="miyou-nearby-peers">{peers.map(peer => <div key={peer.token}><img src={animalAvatar(peer.token)} alt=""/><strong>{peer.name}</strong><button className="miyou-primary" disabled={sending} onClick={() => void invite(peer)}>{zh ? '加好友' : 'Add friend'}</button></div>)}</div>
  </div>;
}
