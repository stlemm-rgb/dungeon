// 게임 결과용 무작위: 씨앗 고정 가능, 씨앗과 위치가 state에 저장돼 불러온 뒤에도 같은 결과
// 규칙 1. 게임 결과(전투, 보상, 이벤트)는 반드시 rng_ 함수만 쓴다.
// 규칙 2. 연출(흔들림, 반짝임)은 js/fx.js의 fxRandom을 쓴다. 섞으면 같은 씨앗인데 결과가 달라진다.
// 규칙 3. Math.random은 js/fx.js 밖에서 쓰면 tools/test_rules.py가 실패한다.
//
// 방식: mulberry32. 내부 값이 "씨앗 + 위치 x 상수"라서 씨앗과 위치(rngPos)만 저장하면
//       어느 시점에서든 같은 다음 숫자가 나온다.

// 씨앗과 위치로 0 이상 1 미만 숫자 하나를 계산한다 (state를 바꾸지 않음).
function rng_valueAt(seed, pos) {
  let t = (seed + Math.imul(pos + 1, 0x6D2B79F5)) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// 게임용 무작위 0 이상 1 미만. 부를 때마다 state.rngPos가 1 오른다.
function rng_game() {
  const pos = state_takeRngPos();
  return rng_valueAt(state.rngSeed, pos);
}

// min 이상 max 이하 정수.
function rng_int(min, max) {
  return min + Math.floor(rng_game() * (max - min + 1));
}

// 배열에서 하나 고르기.
function rng_pick(list) {
  return list[Math.floor(rng_game() * list.length)];
}
