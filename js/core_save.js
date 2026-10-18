// 저장·불러오기: 저장 칸 목록(SAVE_FIELDS), 압축(save_lzPack), 예전 세이브 보완(save_ensureStateReady)
// 규칙 1. 저장 칸 목록은 SAVE_FIELDS 한 곳. state에 칸을 추가하면 여기에도 적는다.
//         (tools/test_oldsaves.py가 state_newGame의 칸과 SAVE_FIELDS가 같은지 검사)
// 규칙 2. 불러오기는 "새 게임 기본값 위에 저장된 값을 덮는" 방식. 빠진 칸은 기본값이 남는다.
// 규칙 3. 예전 세이브 보완은 save_ensureStateReady 하나에서만 한다.
// 규칙 4. 저장 칸의 뜻이 바뀌면 data/data_config.js의 SAVE_VERSION을 올리고
//         save_ensureStateReady의 "버전별 옮기기" 자리에 옮기는 코드를 넣는다.
//         그리고 tools/oldsaves/에 이전 버전 세이브를 하나 남긴다.
//
// 세이브 글자 모양: "DG" + 세이브버전 + ":" + save_lzPack(JSON)
//   JSON = { v: 세이브버전, game: 게임버전, data: { SAVE_FIELDS 칸들 } }

const SAVE_FIELDS = [
  "turn",
  "rngSeed",
  "rngPos",
  "lastRoll",
  "createdVersion",
];

const SAVE_MAGIC = "DG";

// ---------- 압축 (직접 만든 LZW, 결과는 URL에도 안전한 64글자) ----------

const SAVE_LZ_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const SAVE_LZ_INDEX = {};
for (let i = 0; i < SAVE_LZ_ALPHABET.length; i++) SAVE_LZ_INDEX[SAVE_LZ_ALPHABET[i]] = i;

// 사전 크기가 size일 때 번호 하나에 필요한 비트 수.
function save_lzWidth(size) {
  let bits = 1;
  while ((1 << bits) < size) bits++;
  return bits;
}

// 글자를 압축한다. 머리: 원래 길이(32비트) + 쓰인 글자 목록, 몸통: LZW 번호들.
function save_lzPack(text) {
  const out = [];
  let acc = 0;
  let accBits = 0;
  const put = (value, bits) => {
    for (let i = bits - 1; i >= 0; i--) {
      acc = (acc << 1) | (Math.floor(value / Math.pow(2, i)) & 1);
      accBits++;
      if (accBits === 6) {
        out.push(SAVE_LZ_ALPHABET[acc]);
        acc = 0;
        accBits = 0;
      }
    }
  };
  const dict = new Map();
  const chars = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!dict.has(c)) {
      dict.set(c, chars.length);
      chars.push(c);
    }
  }
  // 쓰인 글자가 모두 0~255면 글자 하나를 8비트로, 아니면 16비트로 적는다.
  const charBits = chars.every((c) => c.charCodeAt(0) < 256) ? 8 : 16;
  put(text.length, 32);
  put(chars.length, 17);
  put(charBits === 8 ? 0 : 1, 1);
  for (const c of chars) put(c.charCodeAt(0), charBits);
  let w = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const wc = w + c;
    if (dict.has(wc)) {
      w = wc;
      continue;
    }
    put(dict.get(w), save_lzWidth(dict.size));
    dict.set(wc, dict.size);
    w = c;
  }
  if (w !== "") put(dict.get(w), save_lzWidth(dict.size));
  if (accBits > 0) put(0, 6 - accBits);
  return out.join("");
}

// save_lzPack의 반대. 망가진 글자면 오류를 던진다.
function save_lzUnpack(packed) {
  let pos = 0;
  let acc = 0;
  let accBits = 0;
  const get = (bits) => {
    let v = 0;
    for (let i = 0; i < bits; i++) {
      if (accBits === 0) {
        if (pos >= packed.length) throw new Error("압축 데이터가 중간에 끝남");
        const idx = SAVE_LZ_INDEX[packed[pos++]];
        if (idx === undefined) throw new Error("압축 데이터에 모르는 글자");
        acc = idx;
        accBits = 6;
      }
      accBits--;
      v = v * 2 + ((acc >>> accBits) & 1);
    }
    return v;
  };
  const length = get(32);
  const charCount = get(17);
  const charBits = get(1) === 1 ? 16 : 8;
  const dict = [];
  for (let i = 0; i < charCount; i++) dict.push(String.fromCharCode(get(charBits)));
  const parts = [];
  let outLen = 0;
  let prev = null;
  while (outLen < length) {
    const encoderSize = dict.length + (prev === null ? 0 : 1);
    const code = get(save_lzWidth(encoderSize));
    let entry;
    if (code < dict.length) entry = dict[code];
    else if (prev !== null && code === dict.length) entry = prev + prev[0];
    else throw new Error("압축 데이터 번호가 틀림");
    if (prev !== null) dict.push(prev + entry[0]);
    parts.push(entry);
    outLen += entry.length;
    prev = entry;
  }
  if (outLen !== length) throw new Error("압축을 푼 길이가 다름");
  return parts.join("");
}

// ---------- state <-> 세이브 글자 ----------

// state에서 저장 칸만 골라 세이브 글자로 만든다.
function save_serialize(st) {
  const data = {};
  for (const f of SAVE_FIELDS) data[f] = st[f];
  const payload = { v: SAVE_VERSION, game: GAME_VERSION, data: data };
  return SAVE_MAGIC + SAVE_VERSION + ":" + save_lzPack(JSON.stringify(payload));
}

// 예전 세이브 보완은 이 함수 하나에서만. 새 게임 기본값 위에 저장된 칸을 덮는다.
// fixes 배열을 주면 고친 내용을 적어 준다 (검사 도구용).
function save_ensureStateReady(data, fromVersion, fixes) {
  const log = fixes || [];
  const src = (data && typeof data === "object" && !Array.isArray(data)) ? data : {};
  if (src !== data) log.push("data가 객체가 아님");
  const seed = (typeof src.rngSeed === "number" && isFinite(src.rngSeed)) ? src.rngSeed : 0;
  const base = state_newGame(seed);

  // --- 버전별 옮기기 자리 (SAVE_VERSION을 올릴 때 여기에 추가) ---
  // 예: if (fromVersion < 2) { src.gold = src.money; }

  for (const f of SAVE_FIELDS) {
    if (!(f in src)) {
      log.push("빠진 칸 " + f + " -> 기본값");
      continue;
    }
    const want = base[f];
    const got = src[f];
    const wantArray = Array.isArray(want);
    if (wantArray ? !Array.isArray(got) : (typeof got !== typeof want || got === null)) {
      log.push("모양이 다른 칸 " + f + " -> 기본값");
      continue;
    }
    if (typeof want === "number" && !isFinite(got)) {
      log.push("숫자가 아닌 칸 " + f + " -> 기본값");
      continue;
    }
    base[f] = got;
  }
  return base;
}

// 세이브 글자를 읽어 완성된 state 객체를 돌려준다 (전역 state는 바꾸지 않음).
function save_deserialize(text) {
  const result = { ok: false, state: null, version: 0, fixes: [], error: "" };
  try {
    if (typeof text !== "string") throw new Error("세이브가 글자가 아님");
    const head = /^DG(\d+):/.exec(text);
    if (!head) throw new Error("세이브 머리가 틀림");
    const version = Number(head[1]);
    if (version > SAVE_VERSION) throw new Error("더 새 버전 게임의 세이브 (v" + version + ")");
    const payload = JSON.parse(save_lzUnpack(text.slice(head[0].length)));
    result.version = version;
    result.state = save_ensureStateReady(payload && payload.data, version, result.fixes);
    result.ok = true;
  } catch (e) {
    result.error = String(e && e.message ? e.message : e);
  }
  return result;
}

// ---------- localStorage ----------

let save_blockedForTest = false;

// 저장 공간이 막힌 환경을 흉내 낸다 (주소에 ?nostorage=1, 화면 검사용).
function save_setBlockedForTest(flag) {
  save_blockedForTest = !!flag;
}

// localStorage를 실제로 쓸 수 있는지 시험해 본다.
function save_storageAvailable() {
  if (save_blockedForTest) return false;
  try {
    const key = SAVE_KEY + ".test";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    return true;
  } catch (e) {
    return false;
  }
}

// 지금 state를 저장한다. 돌려주는 값: { ok, size, error }
function save_write() {
  if (!save_storageAvailable()) return { ok: false, size: 0, error: "저장 공간을 쓸 수 없음" };
  try {
    const text = save_serialize(state);
    window.localStorage.setItem(SAVE_KEY, text);
    return { ok: true, size: text.length, error: "" };
  } catch (e) {
    return { ok: false, size: 0, error: String(e && e.message ? e.message : e) };
  }
}

// 저장된 게임을 읽는다 (전역 state는 바꾸지 않음). 돌려주는 값: { ok, found, state, fixes, error }
function save_read() {
  if (!save_storageAvailable()) return { ok: false, found: false, state: null, fixes: [], error: "저장 공간을 쓸 수 없음" };
  let text = null;
  try {
    text = window.localStorage.getItem(SAVE_KEY);
  } catch (e) {
    return { ok: false, found: false, state: null, fixes: [], error: String(e) };
  }
  if (text === null) return { ok: true, found: false, state: null, fixes: [], error: "" };
  const r = save_deserialize(text);
  return { ok: r.ok, found: true, state: r.state, fixes: r.fixes, error: r.error };
}

// 저장을 지운다.
function save_delete() {
  if (!save_storageAvailable()) return false;
  try {
    window.localStorage.removeItem(SAVE_KEY);
    return true;
  } catch (e) {
    return false;
  }
}
