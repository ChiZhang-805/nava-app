(async()=>{
  try{
    // Keep the original scene artwork, but let its background cover the viewport
    // independently of the scaled content. No homepage or letterbox underneath.
    const stage=document.querySelector('.stage');
    stage.prepend(...document.querySelectorAll('.cream-bg,.green-bg'));
    const [,{installJournalLayout}]=await Promise.all([window.NavaJournal.ready,import('./nava-layout.js?v=20261121-keyboard')]);
    installJournalLayout(window.NavaJournal);
    __fluffyModules['entry-i18n.js'].setLanguage(window.NavaJournal.initial.locale);
    const client=document.createElement('script');client.src='js/nava-clients.js';
    await new Promise((resolve,reject)=>{client.onload=resolve;client.onerror=reject;document.head.append(client);});
    const app=document.createElement('script');app.src='js/app.js?v=20261121-keyboard';
    await new Promise((resolve,reject)=>{app.onload=resolve;app.onerror=reject;document.head.append(app);});
  }catch{
    document.getElementById('loading').textContent='记录加载失败，请返回后重试。';
    window.NavaJournal?.call('boot-error').catch(()=>{});
  }
})();
