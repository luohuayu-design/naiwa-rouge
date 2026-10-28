// 傀儡模型特写截图（人工检查 MC 贴图映射用）
const { spawn } = require('child_process');
const os = require('os'); const path = require('path'); const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9395;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-107b');
const OUT = path.join(os.tmpdir(), 'naiwa-block107');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title&hints';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, ['--headless=new','--remote-debugging-port='+PORT,'--num-raster-threads=2','--enable-unsafe-swiftshader','--no-first-run','--no-default-browser-check','--disable-dev-shm-usage','--user-data-dir='+UD,'--window-size=420,900','about:blank'], { stdio: 'ignore' });
  let list=null;
  for (let i=0;i<60;i++){ try{ list=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break;}catch(_){await sleep(500);} }
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`,{method:'PUT'})).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  let id=0; const pending=new Map();
  ws.onmessage=(e)=>{const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
  const send=(method,params)=>new Promise((res,rej)=>{const mid=++id;pending.set(mid,(m)=>m.error?rej(new Error(m.error.message)):res(m.result));ws.send(JSON.stringify({id:mid,method,params}));});
  const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}); if(r.result.exceptionDetails)throw new Error('js'); return r.result.value;};
  const shot=async(n)=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(OUT,n),Buffer.from(r.data,'base64'));};
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate',{url:URL});
  for(let i=0;i<200;i++){ try{ if(await ev('!!window.__game'))break;}catch(_){} await sleep(300);}
  await sleep(1500);
  await ev('if (__game.notice.open()) __game.notice.hide(); 1'); await sleep(500);
  await ev('if (__game.sign.open()) __game.sign.hide(); 1'); await sleep(500);
  await ev('if (__game.promo.open()) __game.promo.hide(); 1'); await sleep(400);
  await ev('(function(){ const x=document.querySelector("#signX"); if(x) x.click(); return 1;})()'); await sleep(400);
  await ev('__game.setPendingLevel(10)');
  await ev('(async()=>{ await __game.beginGame({tutorial:false}); return 1;})()');
  await sleep(2000);
  for (let i=0;i<40;i++){ const st=await ev('__game.state'); if(st==='playing')break;
    if(st==='hint')await ev('document.getElementById("hiOk").click()');
    else if(st==='wtut')await ev('document.getElementById("wtSkip").click()');
    else if(st==='meet')await ev('document.getElementById("mtOk").click()');
    else if(st==='weapon')await ev('document.getElementById("wcOk").click()');
    else if(st==='tutorial')await ev('__game.tutorial.skip()');
    await sleep(200); }
  await ev('if (__game.sign.open()) __game.sign.hide(); 1');
  await ev('if (__game.promo.open()) __game.promo.hide(); 1');
  await ev('__game.setWaves(true)');
  await ev('__game.block107.grantPuppet(3)');
  // 雪傀儡特写：召在主角南边，主角挪开看正面
  await ev(`__game.block107.golems.summon('snow', { x: 0, z: -2 })`);
  await ev('__game.warp(0, -5.5)');
  await ev(`__game.camera.position.set(0, 9, -10.2); __game.camera.lookAt(0, 0.6, -2);`);
  await sleep(700);
  await shot('g-snow-front.png');
  await ev('__game.block107.golems.reset()');
  await ev('__game.block107.grantPuppet(3)');
  await ev(`__game.block107.golems.summon('iron', { x: 0, z: -2 })`);
  await ev('__game.warp(0, -5.5)');
  await ev(`__game.camera.position.set(0, 10, -10.5); __game.camera.lookAt(0, 0.8, -2);`);
  await sleep(700);
  await shot('g-iron-front.png');
  ws.close(); chrome.kill();
  console.log('shots done');
  process.exit(0);
})().catch((e)=>{ console.error('ERR', e.message); process.exit(1); });
