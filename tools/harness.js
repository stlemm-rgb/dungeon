// 검사용 실행기: 주소의 ?mode=로 정답지·예전 세이브·자동 진행·화면 틀 검사를 돌리고 결과를 JSON으로 적는다
// 규칙 1. 게임 코드를 바꾸지 않고 부르기만 한다. state도 state_ 함수로만 바꾼다.
// 규칙 2. 결과는 harness_finish 한 곳에서 #result에 적는다. 한글은 \uXXXX로 바꿔 적는다
//         (Chrome --dump-dom 출력의 글자 인코딩이 PC마다 달라서).
//
// mode 목록
//   golden    ?seeds=1,2&turns=200       씨앗마다 N턴 진행한 요약 + 중간 저장/불러오기 뒤에도 같은지
//   selfcheck                            저장 칸 목록, 압축 왕복, 망가진 세이브 처리
//   oldsave   #<세이브 글자>              예전 세이브 불러오기 + ensureStateReady 뒤 검사
//   autoplay  ?seed=7&turns=1000          많은 턴 진행: 오류 수, 걸린 시간, 세이브 크기
//   pack      ?v=1#<JSON 글자>            JSON을 세이브 글자로 바꿈 (예전 세이브 파일 만들 때)
//   frame     ?w=390&h=844&src=<주소>     게임 화면을 정해진 폭의 틀에 띄우고 가로 넘침 측정
//   flow                                 진짜 화면에서 다음 턴 -> 자동 저장 -> 새로고침 -> 불러오기 -> 새 게임

// 결과를 적고 끝낸다.
function harness_finish(obj) {
  obj.errors = (obj.errors || []).concat(HARNESS_ERRORS);
  const json = JSON.stringify(obj).replace(/[\u007f-￿]/g, (c) => "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4));
  document.getElementById("result").textContent = json;
  document.title = "DONE";
}

// 주소의 ?이름=값 읽기.
function harness_param(name, fallback) {
  const m = new RegExp("[?&]" + name + "=([^&#]*)").exec(window.location.search);
  return m ? decodeURIComponent(m[1]) : fallback;
}

// 주소 # 뒤의 글자.
function harness_hash() {
  return decodeURIComponent(window.location.hash.slice(1));
}

// 글자의 짧은 지문 (FNV-1a 32비트, 16진수).
function harness_hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ("00000000" + (h >>> 0).toString(16)).slice(-8);
}

// 칸 이름 순서를 고정한 JSON (같은 state면 늘 같은 글자). skip에 적은 칸은 뺀다.
function harness_stableJson(obj, skip) {
  const keys = Object.keys(obj).sort();
  const out = {};
  for (const k of keys) if (!skip || skip.indexOf(k) < 0) out[k] = obj[k];
  return JSON.stringify(out);
}

// 정답지에서 빼는 칸: 게임 결과가 아니라 버전만 바뀌어도 달라지는 칸.
const HARNESS_GOLDEN_SKIP = ["createdVersion"];

// 씨앗 하나로 turns턴 진행하며 요약을 만든다. resumeAt이 있으면 그 턴에서 저장/불러오기를 끼워 넣는다.
function harness_runSeed(seed, turns, resumeAt) {
  state_startNew(seed);
  let trail = "";
  for (let i = 0; i < turns; i++) {
    if (resumeAt !== undefined && i === resumeAt) {
      const r = save_deserialize(save_serialize(state));
      if (!r.ok) throw new Error("중간 불러오기 실패: " + r.error);
      state_replace(r.state);
    }
    turn_next();
    trail += state.lastRoll;
  }
  return {
    seed: seed,
    turns: turns,
    turn: state.turn,
    rngPos: state.rngPos,
    lastRoll: state.lastRoll,
    trailHash: harness_hash32(trail),
    stateHash: harness_hash32(harness_stableJson(state, HARNESS_GOLDEN_SKIP)),
    state: JSON.parse(harness_stableJson(state, HARNESS_GOLDEN_SKIP)),
  };
}

// 정답지 모드.
function harness_modeGolden() {
  const seeds = harness_param("seeds", "1").split(",").map(Number);
  const turns = Number(harness_param("turns", "200"));
  const cases = [];
  for (const seed of seeds) {
    const straight = harness_runSeed(seed, turns);
    const resumed = harness_runSeed(seed, turns, Math.floor(turns / 2));
    straight.resumeMatches = straight.stateHash === resumed.stateHash && straight.trailHash === resumed.trailHash;
    cases.push(straight);
  }
  return { mode: "golden", cases: cases };
}

// 저장 구조 자체 검사.
function harness_modeSelfcheck() {
  const problems = [];
  const fresh = state_newGame(1);
  const keys = Object.keys(fresh).sort();
  const fields = SAVE_FIELDS.slice().sort();
  for (const k of keys) if (fields.indexOf(k) < 0) problems.push("state_newGame에 있는데 SAVE_FIELDS에 없음: " + k);
  for (const f of fields) if (keys.indexOf(f) < 0) problems.push("SAVE_FIELDS에 있는데 state_newGame에 없음: " + f);
  if (new Set(SAVE_FIELDS).size !== SAVE_FIELDS.length) problems.push("SAVE_FIELDS에 같은 이름이 두 번 있음");

  // 압축 왕복: 빈 글자, 한글, 이모지(서로게이트), 반복, 씨앗 고정 무작위 글자
  const samples = ["", "a", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "abababababab", "던전 던전 던전 🐉🐉 끝", JSON.stringify(fresh)];
  let rand = "";
  for (let i = 0; i < 5000; i++) rand += String.fromCharCode(32 + Math.floor(rng_valueAt(99, i) * 200));
  samples.push(rand);
  let big = "";
  for (let i = 0; i < 300; i++) big += JSON.stringify(harness_runSeed(i, 3).state);
  samples.push(big);
  let packedBig = 0;
  for (const s of samples) {
    const p = save_lzPack(s);
    if (save_lzUnpack(p) !== s) problems.push("압축 왕복 실패 (길이 " + s.length + ")");
    if (s === big) packedBig = p.length;
  }

  // 게임용 무작위 고르기: 주사위 60000번, 눈마다 1/6에서 3% 안쪽인지
  state_startNew(2026);
  const faces = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 60000; i++) faces[rng_int(1, 6) - 1]++;
  for (let f = 0; f < 6; f++) if (Math.abs(faces[f] - 10000) > 300) problems.push("rng_int 치우침: 눈 " + (f + 1) + " = " + faces[f]);
  if (state.rngPos !== 60000) problems.push("rng 위치가 뽑은 횟수와 다름");

  // 망가진 세이브는 오류를 던지지 않고 ok:false
  const bad = ["", "hello", "DG1:", "DG1:!!!!", "DG1:AAAA", "DG999:" + save_lzPack("{}"), null];
  for (const b of bad) {
    const r = save_deserialize(b);
    if (r.ok) problems.push("망가진 세이브를 받아들임: " + String(b).slice(0, 20));
  }
  // 저장 -> 불러오기 왕복이 같은 state
  state_startNew(5);
  turn_runMany(17);
  const before = harness_stableJson(state);
  const back = save_deserialize(save_serialize(state));
  if (!back.ok || harness_stableJson(back.state) !== before) problems.push("저장 왕복 뒤 state가 다름");
  if (back.fixes.length) problems.push("새 세이브인데 고친 칸이 있음: " + back.fixes.join(", "));

  return { mode: "selfcheck", problems: problems, rollCounts: faces, compressRatio: Math.round((packedBig / big.length) * 1000) / 1000 };
}

// 예전 세이브 모드.
function harness_modeOldsave() {
  const raw = harness_hash();
  const r = save_deserialize(raw);
  const out = { mode: "oldsave", ok: r.ok, version: r.version, fixes: r.fixes, error: r.error, problems: [] };
  if (!r.ok) return out;
  const base = state_newGame(1);
  for (const f of SAVE_FIELDS) {
    if (!(f in r.state)) out.problems.push("불러온 뒤에도 빠진 칸: " + f);
    else if (typeof r.state[f] !== typeof base[f]) out.problems.push("모양이 다른 칸: " + f);
  }
  state_replace(r.state);
  const startTurn = state.turn;
  turn_runMany(5);
  if (state.turn !== startTurn + 5) out.problems.push("불러온 뒤 5턴 진행이 이상함");
  const again = save_deserialize(save_serialize(state));
  if (!again.ok) out.problems.push("다시 저장/불러오기 실패: " + again.error);
  out.turnAfter = state.turn;
  return out;
}

// 자동 진행 모드.
function harness_modeAutoplay() {
  const seed = Number(harness_param("seed", "7"));
  const turns = Number(harness_param("turns", "1000"));
  const every = Number(harness_param("every", "100"));
  const errors = [];
  let roundTrips = 0;
  let maxSave = 0;
  state_startNew(seed);
  const startTurn = state.turn;
  const t0 = performance.now();
  for (let i = 1; i <= turns; i++) {
    try {
      turn_next();
      if (i % every === 0) {
        const text = save_serialize(state);
        maxSave = Math.max(maxSave, text.length);
        const r = save_deserialize(text);
        if (!r.ok) throw new Error("저장 왕복 실패: " + r.error);
        if (harness_stableJson(r.state) !== harness_stableJson(state)) throw new Error("저장 왕복 뒤 state가 다름");
        state_replace(r.state);
        roundTrips++;
      }
    } catch (e) {
      errors.push("턴 " + i + ": " + (e && e.message ? e.message : e));
      if (errors.length > 20) break;
    }
  }
  const ms = performance.now() - t0;
  const finalSave = save_serialize(state);
  return {
    mode: "autoplay", seed: seed, turns: turns, startTurn: startTurn, finalTurn: state.turn, errors: errors,
    ms: Math.round(ms * 100) / 100, msPerTurn: Math.round((ms / turns) * 10000) / 10000,
    saveChars: finalSave.length, maxSaveChars: Math.max(maxSave, finalSave.length),
    jsonChars: JSON.stringify(state).length, roundTrips: roundTrips,
  };
}

// 세이브 글자 만들기 모드 (예전 세이브 파일 만들 때).
function harness_modePack() {
  const v = Number(harness_param("v", String(SAVE_VERSION)));
  const json = harness_hash();
  JSON.parse(json);
  return { mode: "pack", save: SAVE_MAGIC + v + ":" + save_lzPack(json) };
}

// 화면 틀 모드: 정해진 폭의 iframe에 게임을 띄운다. 스크린샷도 이 페이지로 찍는다.
function harness_modeFrame() {
  const w = Number(harness_param("w", "390"));
  const h = Number(harness_param("h", "844"));
  const src = harness_param("src", "../index.html");
  const result = document.getElementById("result");
  result.style.top = (h + 20) + "px";
  const frame = document.createElement("iframe");
  frame.width = String(w);
  frame.height = String(h);
  frame.addEventListener("load", () => {
    const out = { mode: "frame", w: w, h: h, src: src, errors: [] };
    try {
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      out.innerWidth = win.innerWidth;
      out.scrollWidth = doc.documentElement.scrollWidth;
      out.overflowX = out.scrollWidth > out.innerWidth;
      const wide = [];
      doc.querySelectorAll("body *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.right > win.innerWidth + 0.5 && el.closest(".table-wrap") === null) wide.push(el.tagName.toLowerCase() + "." + el.className);
      });
      out.wideElements = wide.slice(0, 10);
      out.rendered = !!doc.querySelector("#app .btn-primary");
      out.version = (doc.querySelector(".version-badge") || {}).textContent || "";
      out.modalOpen = !!doc.querySelector(".modal-backdrop");
    } catch (e) {
      out.errors.push("틀 안을 읽지 못함: " + e);
    }
    harness_finish(out);
  });
  frame.src = src;
  document.getElementById("frameHost").appendChild(frame);
  return null; // 결과는 load 뒤에 적는다
}

// 화면 흐름 모드: 진짜 index.html을 틀에 띄워 '다음 턴' 3번 -> 새로고침 -> 불러온 턴 확인 -> 새 게임 확인 창.
function harness_modeFlow() {
  const frame = document.createElement("iframe");
  frame.width = "390";
  frame.height = "844";
  const out = { mode: "flow", steps: [], problems: [], errors: [] };
  const expect = (cond, msg) => {
    if (!cond) out.problems.push(msg);
  };
  let phase = 0;
  frame.addEventListener("load", () => {
    try {
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      const turnNow = () => win.eval("state.turn");
      const savedTurn = () => {
        const r = save_deserialize(win.localStorage.getItem(SAVE_KEY));
        return r.ok ? r.state.turn : -1;
      };
      const notice = () => Array.from(doc.querySelectorAll(".notice")).map((n) => n.textContent).join(" | ");
      if (phase === 0) {
        phase = 1;
        expect(turnNow() === GAME_CONFIG.startTurn, "처음 턴이 " + GAME_CONFIG.startTurn + "이 아님: " + turnNow());
        expect(savedTurn() === GAME_CONFIG.startTurn, "새 게임이 바로 저장되지 않음");
        for (let i = 0; i < 3; i++) doc.querySelector(".btn-primary").click();
        out.steps.push("다음 턴 3번 -> 턴 " + turnNow() + ", 저장된 턴 " + savedTurn() + ", 알림: " + notice());
        expect(turnNow() === GAME_CONFIG.startTurn + 3, "'다음 턴' 3번 뒤 턴이 안 맞음: " + turnNow());
        expect(savedTurn() === GAME_CONFIG.startTurn + 3, "'다음 턴' 뒤 자동 저장이 안 됨: " + savedTurn());
        win.location.reload();
        return;
      }
      if (phase === 1) {
        phase = 2;
        out.steps.push("새로고침 -> 턴 " + turnNow() + ", 알림: " + notice());
        expect(turnNow() === GAME_CONFIG.startTurn + 3, "새로고침 뒤 불러온 턴이 다름: " + turnNow());
        expect(notice().indexOf(harness_fmtTurn(TEXT.loadedFrom, turnNow())) >= 0, "불러오기 알림이 없음");
        const seedBefore = win.eval("state.rngSeed");
        const newBtn = Array.from(doc.querySelectorAll(".btn")).find((b) => b.textContent === TEXT.btnNewGame);
        newBtn.click();
        expect(!!doc.querySelector(".modal-backdrop"), "새 게임 확인 창이 안 뜸");
        doc.querySelector(".modal .btn-plain").click();
        expect(turnNow() === GAME_CONFIG.startTurn + 3, "확인 창에서 '아니요'인데 게임이 바뀜");
        newBtn.click();
        doc.querySelector(".modal .btn-danger").click();
        out.steps.push("새 게임 '네' -> 턴 " + turnNow() + ", 저장된 턴 " + savedTurn());
        expect(turnNow() === GAME_CONFIG.startTurn, "새 게임 뒤 턴이 처음으로 안 돌아감");
        expect(savedTurn() === GAME_CONFIG.startTurn, "새 게임 뒤 저장이 안 됨");
        expect(win.eval("state.rngSeed") !== seedBefore, "새 게임인데 씨앗이 같음");
        harness_finish(out);
      }
    } catch (e) {
      out.errors.push(String(e && e.stack ? e.stack : e));
      harness_finish(out);
    }
  });
  frame.src = "../index.html?seed=3";
  document.getElementById("frameHost").appendChild(frame);
  return null;
}

// TEXT.loadedFrom 같은 글의 {turn} 자리 채우기 (화면 파일을 불러오지 않으므로 따로 둠).
function harness_fmtTurn(template, turn) {
  return String(template).replace("{turn}", String(turn));
}

// 시작.
function harness_main() {
  const modes = {
    golden: harness_modeGolden,
    selfcheck: harness_modeSelfcheck,
    oldsave: harness_modeOldsave,
    autoplay: harness_modeAutoplay,
    pack: harness_modePack,
    frame: harness_modeFrame,
    flow: harness_modeFlow,
  };
  const mode = harness_param("mode", "");
  try {
    if (!modes[mode]) throw new Error("모르는 mode: " + mode);
    const out = modes[mode]();
    if (out) harness_finish(out);
  } catch (e) {
    harness_finish({ mode: mode, fatal: String(e && e.stack ? e.stack : e) });
  }
}

harness_main();
