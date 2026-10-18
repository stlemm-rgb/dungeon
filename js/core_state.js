// 게임 상태 한 곳: 전역 state와, state를 바꾸는 유일한 통로 함수들
// 규칙 1. 모든 진행 상황은 state 하나에 둔다. 화면은 state를 읽기만 한다.
// 규칙 2. state.xxx = ... 대입은 이 파일 안에서만 한다 (tools/test_rules.py가 검사).
//         다른 파일은 state_addTurn 같은 통로 함수를 부른다.
// 규칙 3. 새 칸을 만들면 state_newGame에 기본값을 넣고 core_save.js의 SAVE_FIELDS에도 적는다.

let state = null;

// 새 게임 기본값. state를 바꾸지 않고 새 객체만 돌려준다 (저장 불러오기의 바탕으로도 쓴다).
function state_newGame(seed) {
  return {
    turn: GAME_CONFIG.startTurn,
    rngSeed: seed >>> 0,   // 게임용 무작위 씨앗 (core_rng.js)
    rngPos: 0,             // 게임용 무작위를 몇 번 뽑았나 = 현재 위치
    lastRoll: 0,           // 마지막 턴에 굴린 시험용 주사위 (0 = 아직 없음)
    createdVersion: GAME_VERSION,
  };
}

// 새 게임으로 바꾼다.
function state_startNew(seed) {
  state = state_newGame(seed);
  return state;
}

// 불러온 상태로 통째로 바꾼다. save_ensureStateReady를 거친 객체만 넣는다.
function state_replace(next) {
  state = next;
  return state;
}

// 턴 숫자를 올린다.
function state_addTurn(n) {
  state.turn += (n === undefined ? 1 : n);
  return state.turn;
}

// 게임용 무작위 위치를 하나 쓰고, 쓰기 전 위치를 돌려준다 (core_rng.js 전용).
function state_takeRngPos() {
  const pos = state.rngPos;
  state.rngPos = pos + 1;
  return pos;
}

// 마지막 주사위 값을 적는다.
function state_setLastRoll(value) {
  state.lastRoll = value;
  return value;
}
