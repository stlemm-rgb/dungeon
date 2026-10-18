// 첫 화면: 시작(불러오기 또는 새 게임), 그리기, 버튼 처리, 자동 저장
// 규칙 1. 화면은 state를 읽어서 그리기만 한다. state를 바꿀 때는 turn_next / state_ 함수를 부른다.
// 규칙 2. 화면에만 필요한 잠깐짜리 값(알림 글 등)은 ui_ 변수에 두고 state에 넣지 않는다 (저장 안 됨).
// 주소 옵션: ?seed=숫자 (저장이 없을 때 새 게임 씨앗), ?nostorage=1 (저장 막힘 흉내),
//            ?show=confirm (확인 창 띄운 채 시작, 화면 검사용)

let ui_status = { text: "", kind: "info" };
let ui_storageOk = true;

// 주소의 ?이름=값 읽기.
function ui_param(name) {
  const m = new RegExp("[?&]" + name + "=([^&#]*)").exec(window.location.search);
  return m ? decodeURIComponent(m[1]) : null;
}

// 알림 글을 정한다 (그리기는 ui_render가).
function ui_setStatus(text, kind) {
  ui_status = { text: text || "", kind: kind || "info" };
}

// 페이지를 열 때 한 번. 저장이 있으면 불러오고, 없으면 새 게임.
function ui_init() {
  save_setBlockedForTest(ui_param("nostorage") === "1");
  ui_storageOk = save_storageAvailable();
  const seedParam = ui_param("seed");
  const newSeed = seedParam !== null && seedParam !== "" && isFinite(Number(seedParam)) ? Number(seedParam) >>> 0 : fxNewSeed();

  if (ui_storageOk) {
    const r = save_read();
    if (r.found && r.ok) {
      state_replace(r.state);
      ui_setStatus(ui_fmt(TEXT.loadedFrom, { turn: state.turn }), "info");
    } else {
      state_startNew(newSeed);
      // 망가진 저장은 바로 덮어쓰지 않는다 (다음 턴에 자동 저장될 때 바뀜).
      if (r.found) ui_setStatus(ui_fmt(TEXT.loadFailed, { error: r.error }), "error");
      else ui_saveNow(true);
    }
  } else {
    state_startNew(newSeed);
  }
  ui_render();
  if (ui_param("show") === "confirm") ui_onNewGame();
}

// 자동 저장. showStatus면 결과를 알림 글로 보여 준다.
function ui_saveNow(showStatus) {
  if (!ui_storageOk) return;
  const r = save_write();
  if (!r.ok) ui_setStatus(ui_fmt(TEXT.saveFailed, { error: r.error }), "error");
  else if (showStatus) ui_setStatus(ui_fmt(TEXT.savedAt, { turn: state.turn }), "info");
}

// state를 읽어 화면 전체를 다시 그린다.
function ui_render() {
  const app = document.getElementById("app");
  app.textContent = "";
  app.appendChild(ui_pageHeader(TEXT.title, TEXT.subtitle, ui_fmt(TEXT.versionLabel, { version: GAME_VERSION })));

  if (!ui_storageOk) app.appendChild(ui_notice(TEXT.storageBlocked, "warn"));
  if (ui_status.text) app.appendChild(ui_notice(ui_status.text, ui_status.kind));

  const statusCard = ui_card(TEXT.statusHeading);
  statusCard.appendChild(ui_table([
    [TEXT.rowTurn, state.turn],
    [TEXT.rowLastRoll, state.lastRoll > 0 ? state.lastRoll : TEXT.noRollYet],
    [TEXT.rowSeed, state.rngSeed],
    [TEXT.rowRngPos, state.rngPos],
  ]));
  app.appendChild(statusCard);

  const mainCard = ui_card("");
  mainCard.appendChild(ui_empty(TEXT.emptyHeading, TEXT.emptyBody));
  app.appendChild(mainCard);

  const actions = ui_el("div", "actions");
  actions.appendChild(ui_button(TEXT.btnNextTurn, ui_onNextTurn, "primary"));
  if (ui_storageOk) actions.appendChild(ui_button(TEXT.btnReload, ui_onReload, "plain"));
  actions.appendChild(ui_button(TEXT.btnNewGame, ui_onNewGame, "plain"));
  app.appendChild(actions);
}

// '다음 턴' 버튼: 한 턴 진행 -> 자동 저장 -> 다시 그리기.
function ui_onNextTurn() {
  turn_next();
  ui_saveNow(true);
  ui_render();
}

// '저장에서 다시 불러오기' 버튼.
function ui_onReload() {
  const r = save_read();
  if (r.found && r.ok) {
    state_replace(r.state);
    ui_setStatus(ui_fmt(TEXT.loadedFrom, { turn: state.turn }), "info");
  } else if (r.found) {
    ui_setStatus(ui_fmt(TEXT.loadFailed, { error: r.error }), "error");
  } else {
    ui_setStatus(TEXT.noSaveToLoad, "warn");
  }
  ui_render();
}

// '새 게임' 버튼: 확인 창을 거친다.
function ui_onNewGame() {
  ui_askConfirm({
    title: TEXT.confirmNewGameTitle,
    body: TEXT.confirmNewGameBody,
    yes: TEXT.confirmYes,
    no: TEXT.confirmNo,
    onYes: () => {
      state_startNew(fxNewSeed());
      ui_setStatus(TEXT.newGameStarted, "info");
      ui_saveNow(false);
      ui_render();
    },
  });
}

document.addEventListener("DOMContentLoaded", ui_init);
