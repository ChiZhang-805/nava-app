(async()=>{
  try{
    // Keep the original scene artwork, but let its background cover the viewport
    // independently of the scaled content. No homepage or letterbox underneath.
    const stage=document.querySelector('.stage');
    stage.prepend(...document.querySelectorAll('.cream-bg,.green-bg'));
    await window.NavaJournal.ready;
    const {installJournalLayout}=await import('./nava-layout.js');
    installJournalLayout(window.NavaJournal);
    __fluffyModules['entry-i18n.js'].setLanguage(window.NavaJournal.initial.locale);
    const client=document.createElement('script');client.src='js/nava-clients.js';
    await new Promise((resolve,reject)=>{client.onload=resolve;client.onerror=reject;document.head.append(client);});
    const app=document.createElement('script');app.src='js/app.js';document.head.append(app);
  }catch{document.getElementById('loading').textContent='记录加载失败，请返回后重试。';}
})();
