import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { App as NativeApp } from '@capacitor/app';
import { loadJournal, saveJournal, deleteJournal, saveJournalSettings, journalAI, type JournalCategory, type JournalRecord } from '../services/journal';
import { FirstRecordFeedback } from './ColdStartExperience';
import { usesNativePhotos, pickNativePhoto } from '../services/nativePhotos';
import { registerPreviewActivity } from '../services/previewEnvironment';
import { startVoiceInput, type VoiceInputSession } from '../services/voice';
import { requestScreenWakeLock, type ScreenWakeLockSentinel } from '../services/focusImmersion';
import type { RecordModule } from './RecordsScreen';
import NavaLoadingScene from '../components/NavaLoadingScene';
import './journal-experience.css';
import type { AppSkin } from '../services/appSkin';

const categoryMap:Record<RecordModule,JournalCategory>={mood:'mood',diet:'food',exercise:'sport',focus:'focus',sleep:'sleep',face:'face'};
type Props={user:User;module:RecordModule;locale:'zh'|'en';skin:AppSkin;forceGuide?:boolean;guidePreview?:boolean;onSaved:()=>void;onExit:()=>void};

/** Exactly one iframe, scoped to the authenticated parent. It never receives the JWT. */
export default function JournalExperience({user,module,locale,skin,forceGuide=false,guidePreview=false,onSaved,onExit}:Props){
  const frame=useRef<HTMLIFrameElement>(null), callbacks=useRef({onSaved,onExit});
  callbacks.current={onSaved,onExit};
  const [error,setError]=useState(''),[ready,setReady]=useState(false),[attempt,setAttempt]=useState(0);
  const [firstFeedback,setFirstFeedback]=useState<JournalRecord|null>(null);
  const [guideActive,setGuideActive]=useState(false);
  useEffect(()=>{if(frame.current)frame.current.inert=Boolean(firstFeedback);},[firstFeedback]);
  useEffect(()=>{
    let alive=true,channel:MessageChannel|null=null,settings:Record<string,unknown>={};
    let firstSaved:JournalRecord|null=null;
    setFirstFeedback(null);
    const controllers=new Map<number,AbortController>();
    let queue=Promise.resolve();
    let voice:VoiceInputSession|null=null,wake:ScreenWakeLockSentinel|null=null;
    const viewport=()=>{
      const r=frame.current?.getBoundingClientRect(),style=frame.current?.parentElement&&getComputedStyle(frame.current.parentElement);
      const visibleBottom=window.visualViewport?window.visualViewport.offsetTop+window.visualViewport.height:innerHeight;
      const logicalHeight=frame.current?.clientHeight||r?.height||innerHeight;
      const scale=r&&r.height>0?r.height/logicalHeight:1;
      return {type:'viewport',visibleHeight:r?Math.max(1,Math.min(r.height,visibleBottom-r.top)/scale):logicalHeight,safeTop:parseFloat(style?.getPropertyValue('--journal-safe-top')||'0')||0,safeBottom:parseFloat(style?.getPropertyValue('--journal-safe-bottom')||'0')||0};
    };
    const resize=()=>channel?.port1.postMessage(viewport());
    window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);
    const interrupt=()=>channel?.port1.postMessage({type:'interrupt'});
    const unregister=registerPreviewActivity({module:module==='focus'?'focus':'recording',state:'running'},interrupt);
    const visibility=()=>{if(document.hidden)interrupt();};
    document.addEventListener('visibilitychange',visibility);
    const native=usesNativePhotos()?NativeApp.addListener('appStateChange',({isActive})=>{if(!isActive)interrupt();}):null;
    const start=async()=>{
      try{
        const initial=await loadJournal(user.id);if(!alive||!frame.current?.contentWindow)return;
        settings=initial.settings;channel=new MessageChannel();
        channel.port1.onmessage=async({data})=>{
          if(data.cancel){controllers.get(data.cancel)?.abort();return;}
          const {id,method,payload,context}=data;
          const controller=new AbortController();controllers.set(id,controller);
          try{
            let result:unknown=null;
            if(method==='save'){
              if(guidePreview)throw Error(locale==='zh'?'新手引导预览不会保存真实记录。':'The guide preview does not save real records.');
              result=await saveJournal(payload.record,payload.expectedVersion??null);callbacks.current.onSaved();
              if(!initial.records.some(r=>r.category===categoryMap[module])){firstSaved=result as JournalRecord;initial.records.push(firstSaved);}
            }else if(method==='delete'){
              if(guidePreview)throw Error(locale==='zh'?'新手引导预览不会删除真实记录。':'The guide preview does not delete real records.');
              await deleteJournal(user.id,payload.id);callbacks.current.onSaved();
            }else if(method==='settings'){
              if(!/^fluffy-[a-z0-9-]+$/.test(payload.key)||/key|token|secret/.test(payload.key))throw Error('Invalid preference');
              settings={...settings,[payload.key]:payload.value};
              if(!guidePreview){const snapshot=settings;queue=queue.catch(()=>{}).then(()=>saveJournalSettings(user.id,snapshot));await queue;}
            }else if(method==='first-feedback'){
              if(firstSaved)setFirstFeedback(firstSaved);
            }else if(method==='ai'){
              result=await journalAI({...payload,category:context.category||categoryMap[module],recordDate:context.recordDate||new Date().toLocaleDateString('en-CA')},controller.signal);
            }else if(method==='photo'){
              result=await pickNativePhoto(payload.source==='camera'?'camera':'library',payload.facing==='user'?'user':'environment',controller.signal);
            }else if(method==='voice-start'){
              await voice?.cancel();
              voice=await startVoiceInput({locale:payload.locale==='en'?'en':'zh',onTranscript:(text,final)=>channel?.port1.postMessage({type:'voice',text,final}),onEnd:()=>channel?.port1.postMessage({type:'voice-end'}),onError:()=>channel?.port1.postMessage({type:'voice-error'})});
              if(!alive){await voice.cancel();voice=null;}
            }else if(method==='voice-stop'){await voice?.stop();voice=null;
            }else if(method==='voice-cancel'){await voice?.cancel();voice=null;
            }else if(method==='wake'){
              if(payload.enabled){wake=await requestScreenWakeLock();if(!alive)await wake?.release();result=Boolean(wake);}
              else{await wake?.release();wake=null;result=false;}
            }else if(method==='guide-state')setGuideActive(Boolean(payload?.active));
            else if(method==='ready')setReady(true);
            else if(method==='exit')callbacks.current.onExit();
            else if(method!=='locale')throw Error('Unknown journal action');
            if(alive&&!controller.signal.aborted)channel?.port1.postMessage({id,result});
          }catch(cause){if(alive)channel?.port1.postMessage({id,error:cause instanceof Error?cause.message:'操作失败，请重试。'});}
          finally{controllers.delete(id);}
        };
        frame.current.contentWindow.postMessage({type:'nava-journal-connect',initial:{...initial,category:categoryMap[module],locale,skin,forceGuide,nativePhotos:usesNativePhotos(),viewport:viewport()}},location.origin,[channel.port2]);
      }catch{if(alive)setError(locale==='zh'?'记录未能加载，请重试。':'Could not load your journal. Please retry.');}
    };
    const element=frame.current; element?.addEventListener('load',start);
    const observer=new ResizeObserver(resize);if(element)observer.observe(element);
    return()=>{alive=false;setGuideActive(false);interrupt();unregister();observer.disconnect();void voice?.cancel();void wake?.release();void native?.then(handle=>handle.remove());document.removeEventListener('visibilitychange',visibility);window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);element?.removeEventListener('load',start);for(const c of controllers.values())c.abort();channel?.port1.close();};
  },[user.id,module,locale,skin,attempt,forceGuide,guidePreview]);
  return <section className={`journal-experience${guideActive?' is-guiding':''}`} aria-label={locale==='zh'?'生活记录':'Journal'}>
    <iframe key={`${module}-${locale}-${skin}-${attempt}-${forceGuide}`} ref={frame} aria-hidden={Boolean(firstFeedback)} tabIndex={firstFeedback?-1:undefined} src={`${import.meta.env.BASE_URL}journal/index.html?v=20261006-skins-a11y-v3&skin=${encodeURIComponent(skin)}&category=${encodeURIComponent(categoryMap[module])}`} title={locale==='zh'?'记录与回顾':'Journal and recap'} allow="camera; microphone"/>
    {firstFeedback&&<div className="cold-feedback-layer"><FirstRecordFeedback record={firstFeedback} onClose={()=>setFirstFeedback(null)}/></div>}
    {!ready&&!error&&<div className="journal-loading"><NavaLoadingScene /></div>}
    {error&&<div className="journal-loading is-error" role="alert"><strong>{error}</strong><button onClick={()=>{setError('');setReady(false);setAttempt(x=>x+1);}}>{locale==='zh'?'重试':'Retry'}</button></div>}
  </section>;
}
