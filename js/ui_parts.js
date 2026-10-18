// 공통 화면 부품: 페이지 머리, 표, 빈 칸 안내, 알림 띠, 버튼, 확인 창
// 규칙 1. 화면마다 모양을 따로 만들지 말고 이 부품을 조립한다.
// 규칙 2. 색은 css/style.css 맨 위 :root 변수만 쓴다. 여기서 style.color 같은 걸 직접 넣지 않는다.
// 규칙 3. confirm()/alert()/prompt()는 웹에서 막히므로 금지. 확인이 필요하면 ui_askConfirm.
// 규칙 4. 부품은 state를 바꾸지 않는다. 받은 값을 그리기만 한다.

// "턴 {turn}" 같은 글의 {이름} 자리를 채운다.
function ui_fmt(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (m, key) => (vars && key in vars ? String(vars[key]) : m));
}

// 요소 하나 만들기. text는 글자로만 넣는다 (HTML로 해석하지 않음).
function ui_el(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
}

// 버튼. kind: "primary" | "plain" | "danger"
function ui_button(label, onClick, kind) {
  const btn = ui_el("button", "btn btn-" + (kind || "plain"), label);
  btn.type = "button";
  btn.addEventListener("click", onClick);
  return btn;
}

// 페이지 머리: 제목, 부제, 오른쪽에 버전 표시.
function ui_pageHeader(title, subtitle, version) {
  const head = ui_el("header", "page-head");
  const titles = ui_el("div", "page-head-titles");
  titles.appendChild(ui_el("h1", "page-title", title));
  if (subtitle) titles.appendChild(ui_el("p", "page-sub", subtitle));
  head.appendChild(titles);
  if (version) head.appendChild(ui_el("span", "version-badge", version));
  return head;
}

// 칸막이 있는 상자(카드). heading이 있으면 위에 작은 제목.
function ui_card(heading) {
  const card = ui_el("section", "card");
  if (heading) card.appendChild(ui_el("h2", "card-title", heading));
  return card;
}

// 표. rows = [[이름, 값], ...]. headers = ["이름", "값"] (없으면 머리줄 없음)
function ui_table(rows, headers) {
  const wrap = ui_el("div", "table-wrap");
  const table = ui_el("table", "data-table");
  if (headers && headers.length) {
    const thead = ui_el("thead");
    const tr = ui_el("tr");
    for (const h of headers) tr.appendChild(ui_el("th", "", h));
    thead.appendChild(tr);
    table.appendChild(thead);
  }
  const tbody = ui_el("tbody");
  for (const row of rows) {
    const tr = ui_el("tr");
    row.forEach((cell, i) => tr.appendChild(ui_el(i === 0 ? "th" : "td", i === 0 ? "row-head" : "", cell)));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

// 빈 칸 안내: 보여 줄 게 없을 때.
function ui_empty(heading, body) {
  const box = ui_el("div", "empty");
  box.appendChild(ui_el("p", "empty-heading", heading));
  if (body) box.appendChild(ui_el("p", "empty-body", body));
  return box;
}

// 알림 띠. kind: "info" | "warn" | "error"
function ui_notice(text, kind) {
  const box = ui_el("div", "notice notice-" + (kind || "info"), text);
  box.setAttribute("role", kind === "error" || kind === "warn" ? "alert" : "status");
  return box;
}

// 확인 창 (confirm() 대신). opts = { title, body, yes, no, onYes, onNo }
function ui_askConfirm(opts) {
  const old = document.querySelector(".modal-backdrop");
  if (old) old.remove();
  const backdrop = ui_el("div", "modal-backdrop");
  const box = ui_el("div", "modal");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.appendChild(ui_el("h2", "modal-title", opts.title || ""));
  if (opts.body) box.appendChild(ui_el("p", "modal-body", opts.body));
  const actions = ui_el("div", "modal-actions");
  const close = (answer) => {
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    const fn = answer ? opts.onYes : opts.onNo;
    if (fn) fn();
  };
  const onKey = (e) => {
    if (e.key === "Escape") close(false);
  };
  actions.appendChild(ui_button(opts.no || "아니요", () => close(false), "plain"));
  const yesBtn = ui_button(opts.yes || "네", () => close(true), "danger");
  actions.appendChild(yesBtn);
  box.appendChild(actions);
  backdrop.appendChild(box);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close(false);
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(backdrop);
  yesBtn.focus();
  return backdrop;
}
