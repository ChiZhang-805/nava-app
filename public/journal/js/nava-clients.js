/* The v16 prompt/field validators remain; the transport is exclusively NAVA's backend. */
(() => {
  class Client {
    constructor(provider){this.provider=provider;this.model=provider==='deepseek'?'deepseek-flash':'qwen3-vl-plus';this.routes={chat:'journal',models:'models'};this.keyVersion=0;this.requestTimeoutMs=90000;}
    get configured(){return Boolean(window.NavaJournal.initial);}
    clear(){} setKey(){throw Error('Provider credentials are server-managed');}
    async request(path,payload,signal){
      if(!payload)throw Error('Provider settings are managed by NAVA');
      return window.NavaJournal.call('ai',{provider:this.provider,payload},signal);
    }
    async streamText(payload,signal,onDelta){
      // Deliver only a complete, validated provider answer. No invented streaming chunks.
      const result=await this.request(this.routes.chat,{...payload,stream:false},signal);
      const choice=result.choices[0];onDelta?.(choice.message.content);
      return {text:choice.message.content,finishReason:choice.finish_reason};
    }
  }
  __fluffyModules['deepseek.js']={DeepSeekClient:class extends Client{constructor(){super('deepseek');}}};
  __fluffyModules['bailian.js']={BailianClient:class extends Client{constructor(){super('bailian');}}};
  __fluffyModules['bailian-settings.js']={BailianSettings:class{open(){}close(){}clear(){}}};
  if(window.NavaJournal.initial.nativePhotos){
    // Permission is requested by NavaSpeech.startListening, not a browser permission probe.
    __fluffyModules['microphone-permission.js']={MicrophonePermission:class{async status(){return 'granted';}async authorize(){return true;}}};
    __fluffyModules['speech.js'].SpeechSession=class{
      constructor(callbacks={}){this.callbacks=callbacks;this.active=false;this.value='';this.serial=0;}
      supported(){return true;}text(){return this.value;}
      async start(options={}){
        this.cancel();const serial=++this.serial;this.value='';this.pending=true;
        window.NavaJournal.voiceEvent=e=>{if(serial!==this.serial)return;if(e.type==='voice'){this.value=e.text;this.callbacks.onText?.(this.value);}if(e.type==='voice-error')this.callbacks.onError?.(Error('语音识别中断，请重试。'));};
        await window.NavaJournal.call('voice-start',{locale:options.language?.startsWith('en')?'en':'zh'});
        if(serial!==this.serial){await window.NavaJournal.call('voice-cancel');return false;}
        this.pending=false;this.active=true;this.callbacks.onStarted?.();
        this.limit=setTimeout(()=>this.callbacks.onLimit?.(),Math.min(options.maximumSeconds||90,90)*1000);return true;
      }
      async stop(){clearTimeout(this.limit);await window.NavaJournal.call('voice-stop');this.active=false;return {text:this.value,canceled:false,interim:false};}
      sampleFrame(){} // Native bridge does not expose RMS; never draw made-up audio levels.
      cancel(){clearTimeout(this.limit);this.serial++;this.pending=false;this.active=false;window.NavaJournal.call('voice-cancel').catch(()=>{});}
    };
  }
})();
