// 헤드리스 Chrome CDP 도우미 (Node 24 내장 WebSocket): 클릭·터치 끌기·마우스 끌기·스크린샷. 사용: const { launch } = require('C:/project/Dunguen/refs/cdp_helper.js'). Chrome 경로는 CHROME 상수
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function launch(url, opts = {}) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp_prof_'));
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--allow-file-access-from-files', '--hide-scrollbars',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile, '--window-size=' + (opts.w || 390) + ',' + ((opts.h || 844) + 120), 'about:blank'];
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  let ws = null, tries = 0, targets = null;
  while (tries++ < 60) {
    try { targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json(); const pg = targets.find(t => t.type === 'page'); if (pg) { ws = pg.webSocketDebuggerUrl; break; } } catch (e) { /* wait */ }
    await new Promise(r => setTimeout(r, 250));
  }
  if (!ws) throw new Error('chrome not reachable');
  const sock = new WebSocket(ws);
  await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const logs = [];
  sock.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); return; }
    if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (d.params.exceptionDetails.exception ? d.params.exceptionDetails.exception.description : d.params.exceptionDetails.text));
    if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) logs.push(d.params.type.toUpperCase() + ' ' + d.params.args.map(a => a.value || a.description).join(' '));
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') logs.push('LOG ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); sock.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  const W = opts.w || 390, H = opts.h || 844;
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url });
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await sleep(opts.wait || 1200);
  const api = {
    send, logs, sleep,
    async ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    // 요소 가운데 좌표
    async center(sel) {
      return await api.ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');if(!e)return null;var r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height};})()');
    },
    async click(sel) {
      const c = await api.center(sel);
      if (!c) throw new Error('no element ' + sel);
      await api.tap(c.x, c.y);
    },
    async tap(x, y) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await sleep(40);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(250);
    },
    // 터치로 끌기 (from -> to, 중간 몇 점). hold = 놓기 전 멈춤(ms). shotAt 이 있으면 끄는 도중 스크린샷
    async touchDrag(from, to, o = {}) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
      await sleep(60);
      const n = 10;
      for (let i = 1; i <= n; i++) {
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / n, y: from.y + (to.y - from.y) * i / n }] });
        await sleep(30);
      }
      await sleep(o.hold || 150);
      if (o.shot) await api.shot(o.shot);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(300);
    },
    async mouseDrag(from, to, o = {}) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
      await sleep(60);
      const n = 10;
      for (let i = 1; i <= n; i++) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + (to.x - from.x) * i / n, y: from.y + (to.y - from.y) * i / n, button: 'left', buttons: 1 });
        await sleep(30);
      }
      await sleep(o.hold || 150);
      if (o.shot) await api.shot(o.shot);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
      await sleep(300);
    },
    async close() { try { sock.close(); } catch (e) { /* */ } proc.kill(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* */ } }
  };
  return api;
}
module.exports = { launch };
