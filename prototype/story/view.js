(function () {
  'use strict';
  const loadErrors = [];
  // story.js보다 먼저 등록해야 문법 오류의 위치도 안내할 수 있습니다.
  window.addEventListener('error', event => {
    if ((event.filename || '').includes('story.js')) {
      loadErrors.push('story.js ' + (event.lineno ? event.lineno + '번째 줄 근처' : '몇 번째 줄 근처') + '를 확인하세요. ' + event.message);
    } else if (event.target && event.target.tagName === 'SCRIPT' && event.target.src.includes('story.js')) {
      loadErrors.push('story.js 파일을 열지 못했습니다. index.html과 같은 폴더에 있는지 확인하세요.');
    }
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const colors = ['--story', '--tutorial', '--build', '--battle', '--branch', '--end'];
    const kinds = window.StoryCheck.kinds;
    function color(kind) { return 'var(' + (colors[kinds.indexOf(kind)] || '--muted') + ')'; }
    function element(tag, text, parent, cls) {
      const el = document.createElement(tag);
      if (text !== undefined) el.textContent = text;
      if (cls) el.className = cls;
      if (parent) parent.appendChild(el);
      return el;
    }
    kinds.forEach(kind => {
      const item = element('li', undefined, $('legend'));
      const dot = element('span', undefined, item, 'dot');
      dot.style.setProperty('--kind', color(kind));
      element('span', kind, item);
    });
    const result = window.StoryCheck.validate(window.STORY);
    const errors = loadErrors.concat(window.STORY ? result.errors : ['story.js를 불러오지 못했습니다. story.js 몇 번째 줄 근처를 확인하세요. 백틱·쉼표·괄호를 살펴보세요.']);
    if (errors.length) {
      $('problems').hidden = false;
      element('p', '확인이 필요합니다 · ' + errors.length + '건', $('problems'));
      const list = element('ul', undefined, $('problems'));
      errors.forEach(error => element('li', error, list));
    }
    $('summary').textContent = '장면 ' + result.scenes.length + '개 · 분기 ' + result.branches + '개' + (errors.length ? ' · 위의 문제를 확인하세요' : ' · 연결 검사 통과');
    const scenes = result.scenes.filter(s => s && typeof s.id === 'string');
    const byId = new Map();
    scenes.forEach(scene => { if (!byId.has(scene.id)) byId.set(scene.id, scene); });
    if (!byId.size) return;
    const nextOf = s => Array.isArray(s.다음) ? s.다음 : [];
    const depths = new Map([[scenes[0].id, 0]]);
    const queue = [scenes[0].id];
    for (let i = 0; i < queue.length; i++) {
      nextOf(byId.get(queue[i])).forEach(id => {
        if (byId.has(id) && !depths.has(id)) {
          depths.set(id, depths.get(queue[i]) + 1);
          queue.push(id);
        }
      });
    }
    const lastDepth = Math.max(...depths.values()) + 1;
    byId.forEach((s, id) => { if (!depths.has(id)) depths.set(id, lastDepth); });
    const rows = [];
    byId.forEach(s => { const d = depths.get(s.id); (rows[d] ||= []).push(s); });
    const cardW = 218, cardH = 100, stepX = 290, stepY = 178, margin = 36;
    const rowWidth = Math.max(...rows.map(row => row ? row.length : 0)) * stepX - (stepX - cardW);
    const backward = [];
    byId.forEach(s => nextOf(s).forEach((id, i) => {
      if (byId.has(id) && depths.get(id) <= depths.get(s.id)) backward.push({ from: s.id, index: i });
    }));
    const width = rowWidth + margin * 2 + (backward.length ? 160 + backward.length * 24 : 0);
    const height = rows.length * stepY + margin;
    const positions = new Map();
    rows.forEach((row, d) => row.forEach((s, i) => positions.set(s.id, {
      x: margin + (rowWidth - (row.length * stepX - (stepX - cardW))) / 2 + i * stepX,
      y: margin + d * stepY
    })));
    const ns = 'http://www.w3.org/2000/svg';
    function svgEl(tag, attrs, parent, text) {
      const el = document.createElementNS(ns, tag);
      Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
      if (text !== undefined) el.textContent = text;
      if (parent) parent.appendChild(el);
      return el;
    }
    const svg = svgEl('svg', { width, height, viewBox: '0 0 ' + width + ' ' + height, role: 'group', 'aria-label': '장면 연결도' }, $('diagram'));
    const marker = svgEl('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svgEl('defs', {}, svg));
    svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--arrow)' }, marker);
    const edgeLayer = svgEl('g', {}, svg);
    const labelLayer = svgEl('g', {}, svg);
    const nodes = new Map();
    const short = (value, limit) => {
      const chars = Array.from(String(value || '').replace(/\s+/g, ' '));
      return chars.length > limit ? chars.slice(0, limit - 1).join('') + '…' : chars.join('');
    };
    byId.forEach(s => nextOf(s).forEach((id, i) => {
      if (!positions.has(id)) return;
      const a = positions.get(s.id), b = positions.get(id);
      let d, lx, ly;
      if (depths.get(id) <= depths.get(s.id)) {
        const lane = backward.findIndex(e => e.from === s.id && e.index === i);
        const x = margin + rowWidth + 36 + lane * 24;
        const ay = a.y + 68, by = b.y + 32;
        d = `M ${a.x + cardW} ${ay} H ${x} V ${by} H ${b.x + cardW + 3}`;
        lx = x + 8; ly = (ay + by) / 2;
      } else {
        const ax = a.x + cardW / 2, bx = b.x + cardW / 2;
        const ay = a.y + cardH, by = b.y - 3, mid = (ay + by) / 2;
        d = `M ${ax} ${ay} C ${ax} ${mid}, ${bx} ${mid}, ${bx} ${by}`;
        lx = (ax + bx) / 2 + 8; ly = mid - 6;
      }
      svgEl('path', { d, class: 'edge', 'marker-end': 'url(#arrow)' }, edgeLayer);
      if (nextOf(s).length > 1) {
        const text = Array.isArray(s.선택) && s.선택[i] ? s.선택[i] : '선택 ' + (i + 1);
        const label = svgEl('text', { x: lx, y: ly, class: 'edge-label' }, labelLayer, short(text, 14));
        svgEl('title', {}, label, text);
      }
    }));
    function select(id, focusNode) {
      const s = byId.get(id);
      if (!s) return;
      nodes.forEach((node, key) => node.setAttribute('aria-pressed', String(key === id)));
      const detail = $('detail');
      detail.replaceChildren();
      element('h2', '장면 자세히', detail).id = 'detail-title';
      const badge = element('p', s.종류 || '종류 없음', detail, 'badge');
      badge.style.setProperty('--kind', color(s.종류));
      element('h3', s.제목 || '(제목 없음)', detail);
      const dl = element('dl', undefined, detail);
      ['id', '종류', '제목', '장소', '등장', '배움', '다음', '선택', '메모'].forEach(key => {
        element('dt', key, dl);
        const dd = element('dd', undefined, dl);
        if (key === '다음' && nextOf(s).length) {
          nextOf(s).forEach(target => {
            const button = element('button', String(target) + (byId.has(target) ? ' → ' + byId.get(target).제목 : ' (없는 장면)'), dd, 'next-link');
            button.type = 'button';
            button.addEventListener('click', () => select(target, true));
          });
        } else dd.textContent = Array.isArray(s[key]) ? (s[key].join('\n') || (key === '다음' ? '없음 · 여기서 끝' : '—')) : String(s[key] || '—');
      });
      if (focusNode) {
        nodes.get(id).scrollIntoView({ block: 'nearest', inline: 'nearest' });
        nodes.get(id).focus({ preventScroll: true });
      }
    }
    byId.forEach(s => {
      const p = positions.get(s.id);
      const g = svgEl('g', { class: 'scene', transform: `translate(${p.x},${p.y})`, tabindex: 0, role: 'button', 'aria-label': s.id + ' ' + s.제목, 'aria-pressed': 'false' }, svg);
      g.style.setProperty('--kind', color(s.종류));
      svgEl('title', {}, g, s.id + ' · ' + s.제목 + '\n' + s.장소);
      svgEl('rect', { width: cardW, height: cardH, rx: 10 }, g);
      svgEl('text', { x: 16, y: 24, class: 'node-meta' }, g, short(s.id, 14) + ' · ' + (s.종류 || '?'));
      svgEl('text', { x: 16, y: 53, class: 'node-title' }, g, short(s.제목, 12));
      svgEl('text', { x: 16, y: 79, class: 'node-place' }, g, short(s.장소, 20) + (nextOf(s).length ? '' : ' · 끝'));
      g.addEventListener('click', () => select(s.id));
      g.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(s.id); }
      });
      nodes.set(s.id, g);
    });
    select(scenes[0].id);
  });
})();
