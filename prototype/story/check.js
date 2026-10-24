/* 화면과 Node가 함께 쓰는 검사. 외부 패키지는 필요 없습니다. */
(function (root) {
  'use strict';
  const kinds = ['스토리', '튜토리얼', '건설', '전투', '분기', '끝'];
  function validate(story) {
    const errors = [];
    const scenes = story && story.장면;
    if (!Array.isArray(scenes) || !scenes.length) {
      return { errors: ['장면 목록이 없거나 비어 있습니다. 장면: [ ... ] 안에 첫 장면을 넣으세요.'], scenes: [], branches: 0 };
    }
    const byId = new Map();
    scenes.forEach((scene, i) => {
      if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
        errors.push((i + 1) + '번째 장면은 { ... } 덩어리여야 합니다.');
        return;
      }
      const label = scene.id || (i + 1) + '번째 장면';
      if (typeof scene.id !== 'string' || !scene.id.trim()) errors.push(label + ': id에 장면 번호를 쓰세요.');
      else if (byId.has(scene.id)) errors.push('겹치는 id: ' + scene.id);
      else byId.set(scene.id, scene);
      if (!kinds.includes(scene.종류)) errors.push(label + ': 알 수 없는 종류 "' + scene.종류 + '"');
      if (!Array.isArray(scene.다음)) errors.push(label + ': 다음은 [ ... ] 목록이어야 합니다.');
      if (scene.선택 !== undefined && (!Array.isArray(scene.선택) || scene.선택.length !== (Array.isArray(scene.다음) ? scene.다음.length : 0) || scene.선택.some(s => typeof s !== 'string'))) {
        errors.push(label + ': 선택 글 목록은 다음과 같은 개수·순서로 쓰세요.');
      }
      ['제목', '장소', '등장', '배움', '메모'].forEach(key => {
        if (typeof scene[key] !== 'string') errors.push(label + ': ' + key + '에는 백틱으로 감싼 글을 쓰세요.');
      });
    });
    scenes.forEach(scene => {
      if (!scene || !Array.isArray(scene.다음)) return;
      scene.다음.forEach(id => {
        if (!byId.has(id)) errors.push(scene.id + ': 다음에 없는 id "' + String(id) + '"를 가리킵니다.');
      });
    });
    const reached = new Set();
    const queue = scenes[0] && byId.has(scenes[0].id) ? [scenes[0].id] : [];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      if (reached.has(id)) continue;
      reached.add(id);
      const scene = byId.get(id);
      if (scene && Array.isArray(scene.다음)) scene.다음.forEach(next => {
        if (byId.has(next) && !reached.has(next)) queue.push(next);
      });
    }
    byId.forEach((scene, id) => {
      if (!reached.has(id)) errors.push('첫 장면에서 닿지 않는 장면: ' + id);
    });
    return { errors, scenes, branches: scenes.filter(s => s && Array.isArray(s.다음) && s.다음.length > 1).length };
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { validate, kinds };
    if (require.main === module) {
      const fs = require('node:fs');
      const path = require('node:path');
      const vm = require('node:vm');
      try {
        const sandbox = { window: {} };
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'story.js'), 'utf8'), sandbox, { filename: 'story.js', timeout: 1000 });
        const result = validate(sandbox.window.STORY);
        if (result.errors.length) {
          console.error('검사 실패:\n' + result.errors.map(e => '• ' + e).join('\n'));
          process.exitCode = 1;
        } else console.log('통과: 장면 ' + result.scenes.length + '개 · 분기 ' + result.branches + '개');
      } catch (error) {
        console.error('story.js를 열지 못했습니다. story.js 몇 번째 줄 근처를 확인하세요.\n' + (error.stack || error.message));
        process.exitCode = 1;
      }
    }
  } else root.StoryCheck = { validate, kinds };
})(typeof window !== 'undefined' ? window : globalThis);
