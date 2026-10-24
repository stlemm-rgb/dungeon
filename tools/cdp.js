// 헤드리스 Chrome CDP 도우미 (Node 22+ 내장 WebSocket·fetch): 열기·JS 실행·누르기·마우스/터치 끌기·스크린샷·콘솔 오류 모으기. refs/cdp_helper.js를 검사 도구용으로 옮긴 것
/*
 * 사용 (node 스크립트에서):
 *   const { cdp_launch } = require('<저장소>/tools/cdp.js');
 *   const b = await cdp_launch(url, { w: 390, h: 844, preload: 'JS 글', mobile: true });
 *   await b.ev('식');  await b.click('선택자');  await b.mouseDrag(from, to);  await b.shot('a.png');  b.logs;  await b.close();
 * - 브라우저 경로: 환경 변수 GAME_BROWSER (검사 도구 tool_common.find_browser()가 넘겨 줌), 없으면 흔한 Chrome 경로.
 * - 매번 새 임시 프로필 (사용자의 브라우저·저장과 섞이지 않음). 디버그 포트는 0(빈 포트를 Chrome이 고름) -> DevToolsActivePort 파일에서 읽음.
 * - preload: 페이지마다 다른 스크립트보다 먼저 실행할 JS (예: 연출용 무작위 고정). 새로고침해도 다시 실행된다.
 * - logs: 페이지 예외·console.error·console.warn·불러오기 오류. 검사는 이게 비어 있어야 통과.
 * - ev 에 정규식 글자를 넣으면 깨질 수 있다 (refs/cdp_helper.js 때 겪음) -> 문자열 함수로.
 */
'use strict';
const cdp_child = require('child_process');
const cdp_fs = require('fs');
const cdp_os = require('os');
const cdp_path = require('path');

const CDP_BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

function cdp_findBrowser() {
  const env = process.env.GAME_BROWSER;
  if (env && cdp_fs.existsSync(env)) return env;
  const local = process.env.LOCALAPPDATA ? cdp_path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : '';
  const list = CDP_BROWSERS.concat(local ? [local] : []);
  for (const p of list) if (cdp_fs.existsSync(p)) return p;
  throw new Error('Chrome을 찾지 못했습니다. GAME_BROWSER 환경 변수로 경로를 알려 주세요.');
}

function cdp_sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function cdp_launch(url, opts) {
  opts = opts || {};
  const W = opts.w || 390, H = opts.h || 844, mobile = opts.mobile !== undefined ? !!opts.mobile : W < 600;
  const profile = cdp_fs.mkdtempSync(cdp_path.join(cdp_os.tmpdir(), 'dungeon_cdp_'));
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--allow-file-access-from-files', '--hide-scrollbars', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--window-size=' + W + ',' + (H + 120), 'about:blank'];
  const proc = cdp_child.spawn(cdp_findBrowser(), args, { stdio: 'ignore' });
  const portFile = cdp_path.join(profile, 'DevToolsActivePort');
  let ws = null;
  for (let tries = 0; tries < 120 && !ws; tries++) {
    await cdp_sleep(100);
    try {
      const port = cdp_fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
      if (!port) continue;
      const targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
      const pg = targets.find(t => t.type === 'page');
      if (pg) ws = pg.webSocketDebuggerUrl;
    } catch (e) { /* 아직 안 뜸 */ }
  }
  if (!ws) { proc.kill(); throw new Error('Chrome 디버그 연결 실패 (12초)'); }
  const sock = new WebSocket(ws);
  await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const logs = [];
  const waiters = [];
  sock.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); if (d.error) p.rej(new Error(JSON.stringify(d.error))); else p.res(d.result); return; }
    if (d.method === 'Runtime.exceptionThrown') {
      const x = d.params.exceptionDetails;
      logs.push('예외 ' + String(x.exception ? x.exception.description : x.text).split('\n')[0] + (x.url ? ' @' + cdp_path.basename(x.url) + ':' + (x.lineNumber + 1) : ''));
    }
    if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) {
      logs.push(d.params.type + ' ' + d.params.args.map(a => a.value !== undefined ? a.value : a.description).join(' '));
    }
    // 'intervention' = 브라우저 안내(예: 사람 손 누름 전 진동 막음)라 오류가 아님
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && d.params.entry.source !== 'intervention') logs.push('불러오기 ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
    if (d.method === 'Page.loadEventFired') waiters.splice(0).forEach(f => f());
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); sock.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  if (opts.preload) await send('Page.addScriptToEvaluateOnNewDocument', { source: opts.preload });
  const loaded = () => new Promise(r => waiters.push(r));

  const api = {
    send, logs, sleep: cdp_sleep, W, H,
    // 주소 열기 (load 사건까지 기다린 뒤 wait ms 더)
    async open(u, wait) { const l = loaded(); await send('Page.navigate', { url: u }); await Promise.race([l, cdp_sleep(10000)]); await cdp_sleep(wait === undefined ? 300 : wait); },
    async reload(wait) { const l = loaded(); await send('Page.reload', {}); await Promise.race([l, cdp_sleep(10000)]); await cdp_sleep(wait === undefined ? 300 : wait); },
    async ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('ev: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
      return r.result.value;
    },
    // 조건식이 참이 될 때까지 기다림 (ms 안에 안 되면 false)
    async until(expr, ms) {
      const end = Date.now() + (ms || 5000);
      while (Date.now() < end) { if (await api.ev('!!(' + expr + ')')) return true; await cdp_sleep(60); }
      return false;
    },
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
      cdp_fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    },
    // 요소 가운데 좌표 (없으면 null)
    async center(sel) {
      return await api.ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');if(!e)return null;var r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height};})()');
    },
    // DOM으로 누르기 (화면 밖 요소도 됨). 없으면 오류
    async click(sel) {
      const ok = await api.ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');if(!e)return false;e.click();return true;})()');
      if (!ok) throw new Error('누를 요소 없음: ' + sel);
      await cdp_sleep(120);
    },
    async mouseDrag(from, to, o) {
      o = o || {};
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
      await cdp_sleep(60);
      const n = o.steps || 10;
      for (let i = 1; i <= n; i++) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + (to.x - from.x) * i / n, y: from.y + (to.y - from.y) * i / n, button: 'left', buttons: 1 });
        await cdp_sleep(30);
      }
      await cdp_sleep(o.hold || 150);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
      await cdp_sleep(300);
    },
    async touchDrag(from, to, o) {
      o = o || {};
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
      await cdp_sleep(60);
      const n = o.steps || 10;
      for (let i = 1; i <= n; i++) {
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / n, y: from.y + (to.y - from.y) * i / n }] });
        await cdp_sleep(30);
      }
      await cdp_sleep(o.hold || 150);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp_sleep(300);
    },
    async close() {
      try { sock.close(); } catch (e) { /* 이미 닫힘 */ }
      proc.kill();
      await cdp_sleep(200);
      try { cdp_fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 다음에 OS가 치움 */ }
    }
  };
  if (url) await api.open(url, opts.wait);
  return api;
}

module.exports = { cdp_launch, cdp_findBrowser, cdp_sleep };
