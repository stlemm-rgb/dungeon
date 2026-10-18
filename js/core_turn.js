// 턴 흐름: '다음 턴' 한 번에 일어나는 일의 순서
// 규칙: 한 턴의 순서는 turn_next 한 곳에만 적는다. 화면 코드는 turn_next를 부르고 다시 그리기만 한다.
//       저장은 여기서 하지 않는다 (자동 진행 검사가 localStorage 없이 돌 수 있게). 화면 쪽에서 save_write.

// 한 턴 진행. 순서: 1) 이번 턴 무작위 결과  2) 턴 숫자 올리기
function turn_next() {
  const roll = rng_int(GAME_CONFIG.rollMin, GAME_CONFIG.rollMax);
  state_setLastRoll(roll);
  state_addTurn(1);
  return state;
}

// 여러 턴 연속 진행 (검사 도구용).
function turn_runMany(count) {
  for (let i = 0; i < count; i++) turn_next();
  return state;
}
