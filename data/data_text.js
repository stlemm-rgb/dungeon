// 화면에 나오는 글 모음 (다른 AI에게 글만 따로 맡길 수 있게 코드와 분리)
// 규칙: 이 파일에는 글만 둔다. 함수 금지. {이름} 자리는 ui_fmt가 채운다.

const TEXT = {
  title: "던전",
  subtitle: "빈 게임 뼈대",
  versionLabel: "v{version}",

  statusHeading: "지금 상황",
  rowTurn: "턴",
  rowLastRoll: "이번 턴 주사위",
  rowSeed: "씨앗",
  rowRngPos: "무작위 위치",
  noRollYet: "아직 없음",

  emptyHeading: "던전이 아직 비어 있어요",
  emptyBody: "게임 규칙은 아직 정해지지 않았어요. '다음 턴'을 눌러 턴이 넘어가고 저장되는지 확인해 보세요.",

  btnNextTurn: "다음 턴",
  btnNewGame: "새 게임",
  btnReload: "저장에서 다시 불러오기",

  confirmNewGameTitle: "새 게임을 시작할까요?",
  confirmNewGameBody: "지금 진행 중인 게임은 지워집니다.",
  confirmYes: "네",
  confirmNo: "아니요",

  savedAt: "자동 저장됨 (턴 {turn})",
  loadedFrom: "저장된 게임을 불러왔어요 (턴 {turn})",
  newGameStarted: "새 게임을 시작했어요",
  noSaveToLoad: "불러올 저장이 없어요",
  saveFailed: "저장에 실패했어요: {error}",
  loadFailed: "저장을 불러오지 못해 새 게임으로 시작했어요: {error}",
  storageBlocked: "이 브라우저에서는 저장 공간(localStorage)을 쓸 수 없어요. 게임은 할 수 있지만 창을 닫으면 진행이 사라집니다. 주소창이 file:// 이라면 다른 브라우저로 열거나 웹 주소로 접속해 주세요.",
};
