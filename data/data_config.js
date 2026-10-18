// 게임 상수: 버전, 저장 키, 처음 값 같은 숫자 모음 (계산 코드는 js/에)
// 규칙: 이 파일에는 값만 둔다. 함수 금지. 이름은 대문자_밑줄.

// 화면 오른쪽 위에 보이는 게임 버전. 출시할 때마다 올린다.
const GAME_VERSION = "0.1.0";

// 세이브 형식 번호. 저장 칸의 뜻이 바뀌면 1 올리고 save_ensureStateReady에 옮기는 코드를 넣는다.
const SAVE_VERSION = 1;

// localStorage 키 이름 (버전 번호는 키가 아니라 세이브 안에 들어간다)
const SAVE_KEY = "dungeon.save";

// 게임 규칙 숫자. 밸런스를 바꿀 때는 여기만 고친다.
const GAME_CONFIG = {
  startTurn: 1,      // 새 게임의 첫 턴 번호
  rollMin: 1,        // 턴마다 굴리는 시험용 주사위 최솟값 (무작위 동작 확인용 자리)
  rollMax: 6,        // 같은 주사위 최댓값
};
