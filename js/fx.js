// 연출용 무작위: 화면 효과 전용. 게임 결과에는 절대 쓰지 않는다
// 규칙: Math.random은 이 파일에서만 쓸 수 있다 (tools/test_rules.py가 검사).
//       게임 결과용은 js/core_rng.js의 rng_game.

// 0 이상 1 미만 연출용 무작위.
function fxRandom() {
  return Math.random();
}

// 연출용으로 배열에서 하나 고르기.
function fxPick(list) {
  return list[Math.floor(fxRandom() * list.length)];
}

// 새 게임 씨앗 만들기 (주소에 ?seed=가 없을 때만 쓴다). 씨앗을 정하는 일은 결과 계산이 아니라서 여기 둔다.
function fxNewSeed() {
  return (Math.floor(fxRandom() * 4294967296) ^ Date.now()) >>> 0;
}
