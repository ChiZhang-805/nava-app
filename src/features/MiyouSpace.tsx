import { ArrowLeft, BookUser, Copy, Share2, RefreshCw, Smartphone, Cat, ChevronRight, Ellipsis, Keyboard, Mic, Pencil, Plus, Search, SendHorizontal, Smile, X } from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import BottomSheet from '../components/BottomSheet';
import MascotImage from '../components/MascotImage';
import catStill from '../assets/figma/home-option2/home-mascot-v5.png';
import catIdle from '../assets/mascot/animated/home-idle.webp';
import catEating from '../assets/mascot/animated/home-fish-1.webp';
import catPlaying from '../assets/mascot/animated/home-butterfly.webp';
import catSleeping from '../assets/mascot/animated/home-drowsy.webp';
import { startVoiceInput, type VoiceInputSession } from '../services/voice';
import { animalAvatar, resolveMiyouAvatar, careAsset, chatTime, miyouError, miyouRpc, type CareItem, type CareKind, type Friend, type FriendMessage, type MiyouState, type PetState } from '../services/miyou';
import { canInviteContact, inviteContact, shareMiyouInvite } from '../services/miyouInvite';
import MiyouNearby from './MiyouNearby';
import './miyou-space.css';

const emoji = ['😊','🥰','😺','😴','🥳','🥹','😂','🤗','❤️','💙','✨','🌙','☀️','🌷','👍','👏','🙌','🫶','🐾','🎉','🍵','🍀','💪','😎'];
const fiveMinutes = 300000;
function Avatar({ name, userId, source }: { name: string; userId: string; source?: string | null }) {
  const fallback = animalAvatar(userId);
  const [photo, setPhoto] = useState<{ source: string; url: string } | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!source) return;
      void resolveMiyouAvatar(source).then(url => { if (active) setPhoto(url ? {source,url} : null); }).catch(() => { if (active) setPhoto(null); });
    };
    refresh();
    const timer = window.setInterval(refresh, 240000);
    return () => { active = false; window.clearInterval(timer); };
  }, [source]);
  const url = photo?.source === source ? photo?.url : null;
  return <span className="miyou-avatar"><img src={url || fallback} alt={name} referrerPolicy="no-referrer" onError={e => { if (e.currentTarget.getAttribute('src') !== fallback) { e.currentTarget.src = fallback; setPhoto(null); } }}/></span>;
}

export default function MiyouSpace({ userId, locale, onBack }: { userId: string; locale: 'zh' | 'en'; onBack: () => void }) {
  const zh = locale === 'zh';
  const [state, setState] = useState<MiyouState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [petOpen, setPetOpen] = useState(false);
  const [sheet, setSheet] = useState<'invite' | 'nearby' | 'menu' | 'report' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef({value:0}).current;
  const busyRef = useRef(false);
  const drafts = useRef(new Map<string,string>());
  const friend = state?.friends?.find(f => f.id === selected);

  const refresh = useCallback(async () => {
    const ticket = ++generation.value;
    const data = await miyouRpc<MiyouState>('state');
    if (ticket === generation.value) setState(data);
  }, [generation]);
  useEffect(() => {
    let active = true;
    const poll = () => { if (document.visibilityState !== 'hidden') void refresh().catch(e => { if (active) setError(miyouError(e,zh)); }); };
    poll();
    const timer = window.setInterval(poll, 8000);
    window.addEventListener('online',poll);
    document.addEventListener('visibilitychange',poll);
    return () => { active=false; generation.value++; clearInterval(timer); window.removeEventListener('online',poll); document.removeEventListener('visibilitychange',poll); };
  }, [refresh,zh,generation]);

  async function run(action: string, payload: Record<string, unknown> = {}) {
    if (busyRef.current) return false;
    busyRef.current=true; setBusy(true); setError(''); setNotice('');
    try {
      await miyouRpc(action,payload);
      await refresh().catch(e=>setError(miyouError(e,zh)));
      return true;
    } catch(e) { setError(miyouError(e,zh)); return false; }
    finally { busyRef.current=false; setBusy(false); }
  }
  const back = () => {
    setError('');
    if (sheet) { setSheet(sheet==='nearby'?'invite':null); return; }
    if (petOpen) setPetOpen(false);
    else if (selected) setSelected(null);
    else onBack();
  };
  const openFriend = (id: string) => { setSelected(id); setPetOpen(false); setError(''); };
  return <section className="miyou-space" data-view={petOpen ? 'pet' : selected ? 'chat' : 'list'}>
    <header className="miyou-header">
      <button className="miyou-icon" aria-label={zh?'返回':'Back'} onClick={back}><ArrowLeft size={24}/></button>
      {friend && !petOpen ? <div className="miyou-chat-title"><Avatar name={friend.name} userId={friend.peerId} source={friend.avatar}/><h1>{friend.name}</h1></div> : <h1>{petOpen ? (friend?.pet?.name || (zh?'纳瓦咪':'Nava Mi')) : (sheet==='nearby' ? (zh?'面对面':'Face to face') : sheet==='invite' ? (zh?'添加好友':'Add friends') : (zh?'咪友空间':'Miyou Space'))}</h1>}
      {sheet==='invite'||sheet==='nearby' ? <span className="miyou-icon"/> : <button className="miyou-icon" aria-label={selected ? (zh?'更多':'More') : (zh?'添加好友':'Add friend')} onClick={()=>setSheet(selected?'menu':'invite')} disabled={!state?.registered}>{selected?<Ellipsis size={24}/>:<Plus size={24}/>}</button>}
    </header>
    {error && <div className="miyou-error" role="alert"><span>{error}</span><button onClick={()=>{setError('');void refresh().catch(e=>setError(miyouError(e,zh)));}}>{zh?'重试':'Retry'}</button></div>}
    {notice && <p className="miyou-notice" role="status">{notice}</p>}
    {!state ? <p className="miyou-empty" role="status">{zh?'正在连接咪友空间…':'Connecting to Miyou Space…'}</p> : sheet==='nearby' ? <MiyouNearby zh={zh} onInvited={()=>{setSheet(null);setNotice(zh?'好友请求已发出':'Friend request sent');void refresh().catch(e=>setError(miyouError(e,zh)));}}/> : sheet==='invite' ? <div className="miyou-add-friend miyou-scroll">
      <form onSubmit={e=>{e.preventDefault();void run('invite',{code:code.trim()}).then(ok=>{if(ok){setCode('');setSheet(null);setNotice(zh?'好友请求已发出':'Friend request sent');}});}}>
        <label className="miyou-search"><Search size={19}/><input aria-label={zh?'好友的邀请码':'Your friend’s code'} placeholder={zh?'输入好友邀请码':'Enter a friend’s invite code'} value={code} onChange={e=>setCode(e.target.value)} maxLength={36} autoCapitalize="none" autoCorrect="off" required/></label>
        <button className="miyou-primary" disabled={busy||!code.trim()}>{zh?'发送好友请求':'Send friend request'}</button>
      </form>
      <div className="miyou-invite-identity"><Avatar name={state.me?.name||''} userId={userId} source={state.me?.avatar}/><strong>{state.me?.name}</strong><div className="miyou-code">{state.me?.code}</div><button className="miyou-icon" aria-label={zh?'复制邀请码':'Copy code'} onClick={()=>void navigator.clipboard.writeText(state.me?.code||'').then(()=>setNotice(zh?'邀请码已复制':'Invite code copied')).catch(()=>setNotice(zh?'请长按邀请码复制':'Touch and hold the code to copy'))}><Copy size={20}/></button></div>
      <div className="miyou-invite-tools">
        {canInviteContact()&&<button onClick={()=>setSheet('nearby')}><Smartphone size={27}/>{zh?'面对面':'Face to face'}</button>}
        {canInviteContact()&&<button disabled={busy} onClick={()=>{setBusy(true);void inviteContact(state.me?.code||'',zh).then(result=>{if(result.status==='sent')setNotice(zh?'邀请已发送':'Invitation sent');}).catch(e=>setError(miyouError(e,zh))).finally(()=>setBusy(false));}}><BookUser size={27}/>{zh?'通讯录邀请':'Contacts'}</button>}
        <button onClick={()=>void shareMiyouInvite(state.me?.code||'',zh).catch(e=>{if(!/cancel/i.test(String(e)))setError(miyouError(e,zh));})}><Share2 size={27}/>{zh?'分享邀请':'Share invite'}</button>
        <button disabled={busy} onClick={()=>void run('invite_code')}><RefreshCw size={27}/>{zh?'换邀请码':'New code'}</button>
      </div>
    </div> : !selected ? <div className="miyou-scroll">
      <label className="miyou-search"><Search size={19}/><input aria-label={zh?'搜索好友':'Search friends'} placeholder={zh?'搜索好友':'Search friends'} value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <div className="miyou-conversations">
        {state.friends?.filter(f=>f.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a,b)=>(Date.parse(b.lastMessage?.at||'')||0)-(Date.parse(a.lastMessage?.at||'')||0)).map(f=><div className="miyou-friend-row" key={f.id}>
          <button className="miyou-friend" onClick={()=>openFriend(f.id)}><Avatar name={f.name} userId={f.peerId} source={f.avatar}/><div><strong>{f.name}</strong><p>{f.blocked?(zh?'会话已暂停':'Conversation paused'):f.status==='pending'?(f.incoming?(zh?'想加你为好友':'Wants to be your friend'):(zh?'等待对方接受':'Waiting for acceptance')):f.lastMessage?.body||(zh?'发第一条消息吧':'Say hello')}</p></div><aside>{f.lastMessage&&<time>{chatTime(f.lastMessage.at,Date.now(),zh).split(' ')[0]}</time>}{f.unread>0&&<b aria-label={zh?`${f.unread}条未读`:`${f.unread} unread`}>{Math.min(f.unread,99)}</b>}</aside></button>
        </div>)}
        {!state.friends?.length&&<p className="miyou-empty">{zh?'暂无消息':'No messages yet'}</p>}
      </div>
    </div> : !friend ? <div className="miyou-empty"><p>{zh?'这段会话已不可用。':'This conversation is unavailable.'}</p><button onClick={back}>{zh?'返回':'Back'}</button></div> : friend.blocked ? <div className="miyou-empty"><p>{zh?'这段会话已暂停。':'This conversation is paused.'}</p>{friend.blockedByMe&&<button disabled={busy} onClick={()=>void run('unblock',{linkId:friend.id})}>{zh?'解除屏蔽':'Unblock'}</button>}</div> : friend.status==='pending' ? <div className="miyou-empty"><Avatar name={friend.name} userId={friend.peerId} source={friend.avatar}/><h2>{friend.name}</h2><p>{friend.incoming?(zh?'想和你成为咪友':'Wants to be your friend'):(zh?'等待接受':'Awaiting acceptance')}</p>{friend.incoming&&<div className="miyou-actions"><button disabled={busy} onClick={()=>void run('decline',{linkId:friend.id}).then(ok=>{if(ok)setSelected(null);})}>{zh?'忽略':'Ignore'}</button><button className="miyou-primary" disabled={busy} onClick={()=>void run('accept',{linkId:friend.id,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})}>{zh?'接受':'Accept'}</button></div>}</div> : <>
      <div className="miyou-chat-container" hidden={petOpen}><FriendChat key={friend.id} friend={friend} active={!petOpen} userId={userId} me={state.me?.name||''} meAvatar={state.me?.avatar} zh={zh} draftCache={drafts.current} onPet={()=>setPetOpen(true)}/></div>
      {petOpen&&<PetRoom key={friend.id} friend={friend} userId={userId} me={state.me?.name||''} meAvatar={state.me?.avatar} catalog={state.catalog||[]} zh={zh} run={run} busy={busy} actionError={error}/>}
    </>}
    {(sheet==='menu'||sheet==='report')&&<BottomSheet label={zh?'会话设置':'Conversation'} closeLabel={zh?'关闭':'Close'} onClose={()=>setSheet(null)} busy={busy}>
      <div className="miyou-sheet">
        {sheet==='menu'&&friend&&<><h2>{friend.name}</h2>{friend.status==='accepted'&&!friend.blocked&&<button onClick={()=>{setPetOpen(true);setSheet(null);}}><Cat size={22}/>{zh?'纳瓦咪':'Nava Mi'}</button>}<button onClick={()=>setSheet('report')}>{zh?'举报这段会话':'Report conversation'}</button><button disabled={busy} onClick={()=>void run(friend.blockedByMe?'unblock':'block',{linkId:friend.id}).then(ok=>{if(ok)setSheet(null);})}>{friend.blockedByMe?(zh?'解除屏蔽':'Unblock'):(zh?'屏蔽此人':'Block this person')}</button></>}
        {sheet==='report'&&friend&&<form onSubmit={e=>{e.preventDefault();void run('report',{linkId:friend.id,reason}).then(ok=>{if(ok){setSheet(null);setReason('');setNotice(zh?'举报已提交':'Report submitted');}});}}><label>{zh?'举报原因':'Reason'}<textarea maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} required/></label><button className="miyou-primary" disabled={busy||!reason.trim()}>{zh?'提交':'Submit'}</button></form>}
        {error&&<p role="alert">{error}</p>}
      </div>
    </BottomSheet>}
  </section>;
}

function FriendChat({friend,active,userId,me,meAvatar,zh,draftCache,onPet}: {friend: Friend;active:boolean;userId:string;me:string;meAvatar?:string|null;zh:boolean;draftCache:Map<string,string>;onPet:()=>void}) {
  const [messages,setMessages]=useState<FriendMessage[]>([]);
  const [draft,setDraft]=useState(()=>draftCache.get(friend.id)||'');
  const [reply,setReply]=useState<FriendMessage|null>(null);
  const [panel,setPanel]=useState<'emoji'|'more'|null>(null);
  const [error,setError]=useState('');
  const [sending,setSending]=useState(false);
  const [loading,setLoading]=useState(true);
  const [hasEarlier,setHasEarlier]=useState(false);
  const [now,setNow]=useState(Date.now);
  const [recording,setRecording]=useState(false);
  const voice=useRef<VoiceInputSession|null>(null);
  const voiceAbort=useRef<AbortController|null>(null);
  const list=useRef<HTMLDivElement>(null);
  const input=useRef<HTMLTextAreaElement>(null);
  const nearBottom=useRef(true);
  const alive=useRef(true);
  const sendLock=useRef(false);
  const retry=useRef<{body:string;replyId:string|null;id:string}|null>(null);
  const request=useRef({value:0}).current;
  const clockOffset=useRef(0);
  const updateDraft=(value:string)=>{setDraft(value);draftCache.set(friend.id,value);};
  const refresh=useCallback(async()=>{
    const ticket=++request.value;
    const result=await miyouRpc<{messages:FriendMessage[];serverNow:string}>('messages',{linkId:friend.id});
    if(!alive.current||ticket!==request.value)return;
    const time=Date.parse(result.serverNow);clockOffset.current=time-Date.now();setNow(time);
    setMessages(previous=>{
      const earliest=result.messages[0]?.created_at;
      const older=earliest?previous.filter(m=>m.created_at<earliest&&Date.parse(m.expires_at)>time):[];
      const current=result.messages.filter(m=>Date.parse(m.expires_at)>time);
      return [...older,...current];
    });
    setHasEarlier(result.messages.length===60);setLoading(false);
    if(active&&list.current?.getClientRects().length&&document.visibilityState==='visible'&&nearBottom.current&&result.messages.length) void miyouRpc('read',{linkId:friend.id,messageId:result.messages[result.messages.length-1].id}).catch(()=>{});
  },[friend.id,request,active]);
  useEffect(()=>{
    alive.current=true;
    const clock=setInterval(()=>setNow(Date.now()+clockOffset.current),1000);
    return()=>{clearInterval(clock);alive.current=false;voiceAbort.current?.abort();void voice.current?.cancel().catch(()=>{});};
  },[]);
  useEffect(()=>{
    if(!active){voiceAbort.current?.abort();void voice.current?.cancel().catch(()=>{});setRecording(false);return;}
    const poll=()=>{if(document.visibilityState!=='hidden')void refresh().catch(e=>{if(alive.current){setError(miyouError(e,zh));setLoading(false);}});};
    poll();const timer=setInterval(poll,4000);
    window.addEventListener('online',poll);document.addEventListener('visibilitychange',poll);
    return()=>{request.value++;clearInterval(timer);window.removeEventListener('online',poll);document.removeEventListener('visibilitychange',poll);};
  },[refresh,zh,active,request]);
  useEffect(()=>{if(nearBottom.current&&list.current)list.current.scrollTop=list.current.scrollHeight;},[messages,panel]);
  async function send(){
    const body=draft.trim();if(!body||sendLock.current)return;
    voiceAbort.current?.abort();void voice.current?.cancel().catch(()=>{});voice.current=null;setRecording(false);
    sendLock.current=true;setSending(true);setError('');
    if(!retry.current||retry.current.body!==body||retry.current.replyId!==(reply?.id||null))retry.current={body,replyId:reply?.id||null,id:crypto.randomUUID()};
    try{
      await miyouRpc('send',{linkId:friend.id,body,replyId:retry.current.replyId,requestId:retry.current.id});
      if(!alive.current)return;
      updateDraft('');setReply(null);retry.current=null;nearBottom.current=true;
      await refresh();
    }catch(e){if(alive.current)setError(miyouError(e,zh));}
    finally{sendLock.current=false;if(alive.current)setSending(false);}
  }
  async function earlier(){
    const first=messages[0];if(!first)return;
    const el=list.current;const oldHeight=el?.scrollHeight||0;
    try{const result=await miyouRpc<{messages:FriendMessage[]}>('messages',{linkId:friend.id,before:first.created_at,beforeId:first.id});
      if(!alive.current)return;
      nearBottom.current=false;setHasEarlier(result.messages.length===60);
      setMessages(current=>[...result.messages.filter(m=>!current.some(c=>c.id===m.id)),...current]);
      requestAnimationFrame(()=>{if(el)el.scrollTop+=el.scrollHeight-oldHeight;});
    }catch(e){setError(miyouError(e,zh));}
  }
  async function dictate(){
    if(sendLock.current)return;
    if(recording){
      if(voice.current)await voice.current.stop().catch(()=>setError(zh?'语音输入已中断':'Dictation interrupted'));
      else voiceAbort.current?.abort();
      setRecording(false);return;
    }
    const controller=new AbortController();voiceAbort.current=controller;
    setError('');setRecording(true);
    const valid=()=>alive.current&&!controller.signal.aborted;
    try{
      const session=await startVoiceInput({locale:zh?'zh':'en',signal:controller.signal,
        onTranscript:text=>{if(valid())updateDraft((draft+' '+text).trim().slice(0,2000));},
        onEnd:()=>{if(valid())setRecording(false);},
        onError:()=>{if(valid()){setRecording(false);setError(zh?'语音输入未能开始，请检查麦克风权限。':'Voice input could not start. Check microphone access.');}},
      });
      if(valid())voice.current=session;else await session.cancel().catch(()=>{});
    }catch{if(valid()){setRecording(false);setError(zh?'语音输入暂不可用。':'Voice input is unavailable.');}}
  }
  return <>
    <button className="miyou-pet-banner" onClick={onPet}><img src={catStill} alt=""/><span><strong>{friend.pet?.name||(zh?'纳瓦咪':'Nava Mi')}</strong></span><ChevronRight size={18}/></button>
    <div className="miyou-messages" ref={list} onScroll={()=>{const el=list.current;if(el)nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<70;}} role="log" aria-label={zh?'聊天记录':'Conversation'}>
      {hasEarlier&&<button className="miyou-earlier" onClick={()=>void earlier()}>{zh?'查看更早消息':'Earlier messages'}</button>}
      {loading&&<p className="miyou-time">{zh?'正在加载…':'Loading…'}</p>}
      {messages.filter(m=>Date.parse(m.expires_at)>now).map((m,index)=>{const prev=messages[index-1];const own=m.sender_id===userId;const showTime=!prev||Date.parse(m.created_at)-Date.parse(prev.created_at)>=fiveMinutes||new Date(m.created_at).toDateString()!==new Date(prev.created_at).toDateString();return <Fragment key={m.id}>
        {showTime&&<p className="miyou-time"><time dateTime={m.created_at}>{chatTime(m.created_at,now,zh)}</time></p>}
        <div className="miyou-message" data-own={own}><Avatar name={own?me:friend.name} userId={own?userId:friend.peerId} source={own?meAvatar:friend.avatar}/><div className="miyou-message-content"><button className="miyou-bubble" aria-label={`${zh?'引用消息':'Reply to'}: ${m.body}`} onClick={()=>{setReply(m);input.current?.focus();}}>{m.body}</button>{m.quote&&<blockquote>{m.quote.senderId===userId?me:friend.name}：{m.quote.body}</blockquote>}</div></div>
      </Fragment>;})}
    </div>
    {error&&<p className="miyou-error" role="alert">{error}<button onClick={()=>void refresh().then(()=>setError('')).catch(e=>setError(miyouError(e,zh)))}>{zh?'重试':'Retry'}</button></p>}
    <div className="miyou-compose-area">
      <div className="miyou-quick-replies">{(zh?['🌙 晚上好','🫶 比心','🐾 看看小猫','💪 一起运动']:['🌙 Good evening','🫶 Love','🐾 Our cat','💪 Let’s move']).map(text=><button key={text} onClick={()=>updateDraft((draft+text).slice(0,2000))}>{text}</button>)}</div>
      {reply&&<div className="miyou-reply"><span>{zh?'回复':'Reply'} {reply.sender_id===userId?me:friend.name}：{reply.body}</span><button className="miyou-icon" aria-label={zh?'取消引用':'Remove quote'} onClick={()=>setReply(null)}><X size={18}/></button></div>}
      <form className="miyou-composer" onSubmit={e=>{e.preventDefault();void send();}}>
        <button className="miyou-icon" type="button" aria-label={recording?(zh?'结束语音输入':'Finish dictation'):(zh?'语音输入':'Dictate')} aria-pressed={recording} disabled={sending} onClick={()=>void dictate()}><Mic size={22}/></button>
        <textarea ref={input} rows={1} maxLength={2000} aria-label={zh?'消息':'Message'} placeholder={recording?(zh?'正在聆听…':'Listening…'):(zh?'发消息':'Message')} value={draft} disabled={sending} onChange={e=>updateDraft(e.target.value)} onFocus={()=>setPanel(null)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/>
        <button className="miyou-icon" type="button" aria-label={zh?'表情':'Emoji'} aria-expanded={panel==='emoji'} onClick={()=>{input.current?.blur();setPanel(panel==='emoji'?null:'emoji');}}>{panel==='emoji'?<Keyboard size={22}/>:<Smile size={22}/>}</button>
        {draft.trim()?<button className="miyou-icon miyou-send" disabled={sending} aria-label={zh?'发送':'Send'}><SendHorizontal size={21}/></button>:<button className="miyou-icon" type="button" aria-label={zh?'更多功能':'More actions'} aria-expanded={panel==='more'} onClick={()=>{input.current?.blur();setPanel(panel==='more'?null:'more');}}><Plus size={24}/></button>}
      </form>
      {panel==='emoji'&&<div className="miyou-emoji" aria-label={zh?'表情面板':'Emoji panel'}>{emoji.map(item=><button key={item} aria-label={item} onClick={()=>updateDraft((draft+item).slice(0,2000))}>{item}</button>)}</div>}
      {panel==='more'&&<div className="miyou-more"><button onClick={onPet}><Cat size={28}/>{zh?'一起养猫':'Our cat'}</button><button onClick={()=>setPanel('emoji')}><Smile size={28}/>{zh?'表情':'Emoji'}</button></div>}
    </div>
  </>;
}

function PetRoom({friend,userId,me,meAvatar,catalog,zh,run,busy,actionError}:{friend:Friend;userId:string;me:string;meAvatar?:string|null;catalog:CareItem[];zh:boolean;run:(a:string,p?:Record<string,unknown>)=>Promise<boolean>;busy:boolean;actionError:string}) {
  const [data,setData]=useState<PetState|null>(null);
  const [name,setName]=useState(friend.pet?.name||(zh?'纳瓦咪':'Nava Mi'));
  const [category,setCategory]=useState<CareKind|null>(null);
  const [rename,setRename]=useState(false);
  const [error,setError]=useState('');
  const [tick,setTick]=useState(Date.now);
  const offset=useRef(0);
  const alive=useRef(true);
  const refresh=useCallback(async()=>{if(!friend.pet?.accepted_at)return;const result=await miyouRpc<PetState>('pet',{linkId:friend.id});if(alive.current){offset.current=Date.parse(result.serverNow)-Date.now();setData(result);setError('');}},[friend.id,friend.pet?.accepted_at]);
  useEffect(()=>{alive.current=true;const poll=()=>{if(document.visibilityState!=='hidden')void refresh().catch(e=>{if(alive.current)setError(miyouError(e,zh));});};poll();const timer=setInterval(poll,4000);const clock=setInterval(()=>setTick(Date.now()),1000);document.addEventListener('visibilitychange',poll);return()=>{alive.current=false;clearInterval(timer);clearInterval(clock);document.removeEventListener('visibilitychange',poll);};},[refresh,zh]);
  const now=tick+offset.current;
  const active=data?.active&&Date.parse(data.active.ends_at)>now?data.active:null;
  const activeItem=catalog.find(c=>c.id===active?.item_id);
  const animation=activeItem?.kind==='food'?catEating:activeItem?.kind==='exercise'?catPlaying:activeItem?.kind==='rest'?catSleeping:catIdle;
  const accepted=Boolean(friend.pet?.accepted_at);
  const days=accepted?Math.max(1,Math.floor((now-Date.parse(friend.pet!.accepted_at!))/86400000)+1):0;
  const names={food:zh?'喂食':'Food',exercise:zh?'运动':'Play',rest:zh?'休息':'Rest'};
  return <div className="miyou-pet-room miyou-scroll">
    <div className="miyou-pet-top"><div><small>{zh?'一起陪伴':'Days together'}</small><strong>{days}<span>{zh?'天':' days'}</span></strong></div><div className="miyou-pair" role="group" aria-label={zh?'共同陪伴者':'Cat companions'}><Avatar name={me} userId={userId} source={meAvatar}/><Avatar name={friend.name} userId={friend.peerId} source={friend.avatar}/></div></div>
    <div className="miyou-pet-stage"><span className="miyou-star star-one">✦</span><span className="miyou-star star-two">✧</span><span className="miyou-star star-three">✦</span><div className="miyou-pet-platform"/><MascotImage className="miyou-pet-cat" animatedSrc={animation} staticSrc={catStill} alt={zh?'你们的纳瓦猫':'Your shared NAVA cat'}/>{activeItem&&<img className="miyou-active-item" src={careAsset(activeItem.asset)} alt={zh?activeItem.name_zh:activeItem.name_en}/>}</div>
    <button className="miyou-pet-name" onClick={()=>{setName(friend.pet?.name||'');setRename(true);}}>{data?.pet.name||friend.pet?.name}<Pencil size={15}/></button><p className="miyou-pet-growth">{zh?'成长':'Growth'} {data?`${data.growth} · Lv.${1+Math.floor(data.growth/100)}`:'—'}</p>
      <div className="miyou-care-actions">{(['food','exercise','rest'] as CareKind[]).map(kind=><button key={kind} onClick={()=>setCategory(kind)}><img src={careAsset(kind==='food'?'fish':kind==='exercise'?'ball':'sleep')} alt=""/><strong>{names[kind]}</strong></button>)}</div>
    {error&&<p role="alert">{error}</p>}
    {(category||rename)&&<BottomSheet label={rename?(zh?'小猫名字':'Cat name'):names[category!]} closeLabel={zh?'关闭':'Close'} onClose={()=>{setCategory(null);setRename(false);}} busy={busy}><div className="miyou-sheet">
      {rename?<form onSubmit={e=>{e.preventDefault();void run('pet_name',{linkId:friend.id,name:name.trim()}).then(ok=>{if(ok){setRename(false);void refresh();}});}}><label>{zh?'小猫名字':'Cat name'}<input maxLength={16} value={name} onChange={e=>setName(e.target.value)} required/></label><button className="miyou-primary" disabled={busy||!name.trim()}>{zh?'保存名字':'Save name'}</button></form>:<><h2>{names[category!]}</h2><div className="miyou-catalog">{catalog.filter(item=>item.kind===category).map(item=><button key={item.id} disabled={busy||Boolean(active)||!data} onClick={()=>void run('care',{linkId:friend.id,itemId:item.id,requestId:crypto.randomUUID()}).then(ok=>{if(ok){setCategory(null);void refresh();}})}><img src={careAsset(item.asset)} alt=""/><strong>{zh?item.name_zh:item.name_en}</strong><small>{item.duration_minutes>=60?`${item.duration_minutes/60}${zh?' 小时':' h'}`:`${item.duration_minutes}${zh?' 分钟':' min'}`}</small></button>)}</div></>}
      {actionError&&<p role="alert">{actionError}</p>}
    </div></BottomSheet>}
  </div>;
}
