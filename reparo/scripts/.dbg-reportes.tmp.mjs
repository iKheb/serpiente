import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const root='/home/user/serpiente/reparo';
const server = await createServer({ root, configFile: root+'/vite.config.ts', server:{port:5917,host:'127.0.0.1',hmr:false}, logLevel:'error'});
await server.listen();
const b = await pw.chromium.launch(); const p = await b.newPage({viewport:{width:1440,height:900}});
p.on('console', m => { if (m.type()==='error'||m.type()==='warning') console.log('['+m.type()+']', m.text().slice(0,1500)); });
await p.goto('http://127.0.0.1:5917/#/ajustes'); await p.waitForFunction(()=>!!window.__reparo);
await p.evaluate(async()=>{await window.__reparo.seedDemoData(); await window.__reparo.updateSettings({onboarded:true});});
console.log('---- now reportes');
await p.goto('http://127.0.0.1:5917/#/reportes'); await p.reload(); await p.waitForTimeout(3000);
console.log(await p.evaluate(()=>document.querySelector('main')?.innerText.slice(0,300)));
await b.close(); await server.close(); process.exit(0);
