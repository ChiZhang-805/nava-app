import { readFileSync, writeFileSync } from 'node:fs';
// Mechanical entry-point rewiring, leaving the imported artwork/markup intact.
const path='public/journal/index.html';
let html=readFileSync(path,'utf8');
if(!html.includes('js/nava-bridge.js')){
  html=html.replace('<head>','<head>\n<script src="js/nava-bridge.js"></script>');
  html=html.replace('src="js/app.js?v=20260923-ai-v16"','src="js/nava-start.js"');
  html=html.replace('</head>','<link rel="stylesheet" href="css/nava-host.css"/>\n</head>');
  html=html.replace(/<title>.*?<\/title>/,'<title>NAVA · Journal</title>');
  writeFileSync(path,html);
}
