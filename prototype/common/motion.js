// 모션 토큰: 움직임 곡선·시간·손맛 숫자를 한곳에. (refs/ref_football_agency.md 3-C)
// 숫자는 출발점. 본 게임에서는 src/ui/motion.ts로 그대로 옮긴다.
// 이 파일을 불러오면 CSS 변수(--ease-out, --ease-pop-s, --dur-sheet …)도 :root에 깔린다.
//   CSS:  transition: transform var(--dur-sheet) var(--ease-out);
//   JS:   MOTION.dur.sheet, MOTION.swipe.threshold
var MOTION = {
  ease: {
    out: 'cubic-bezier(.2,.9,.3,1)',      // 시트 올라오기, 카드 날아가기
    popS: 'cubic-bezier(.2,.9,.3,1.2)',   // 안내 카드, 시설 미리보기
    popM: 'cubic-bezier(.2,.9,.3,1.3)',   // 몬스터 넣기/빼기, 말풍선
    popL: 'cubic-bezier(.2,.9,.3,1.6)',   // 납품 판정 도장, 레벨업 배지
    spring: 'cubic-bezier(.3,1.6,.5,1)',  // 카드·몬스터 제자리 복귀
    shake: 'cubic-bezier(.36,.07,.19,.97)' // 마왕 분노, 함정 발동
  },
  dur: { // ms. 닫기는 애니메이션 없이 즉시.
    tap: 150,    // 버튼 눌림
    fade: 200,   // 배경, 토스트
    sheet: 250,  // 시설 고르기 시트
    panel: 300,  // 정산 팝업
    'return': 400, // 스프링 복귀
    fx: 500      // 흔들림, 번쩍임
  },
  swipe: { threshold: 70, tossY: 91 }, // px. 의뢰서 좌우 / 위로 버리기
  hold: { charge: 1400 },              // ms. 되돌릴 수 없는 결정
  toast: { life: 3200, max: 3 },
  vibe: { // navigator.vibrate 패턴. 피드백 사다리: 작음 → 경고 → 성공 → 최고(회차당 한두 번)
    tap: 8, warn: [30, 40, 30], good: [50, 40, 100], best: [90, 50, 220], stamp: [120, 40, 120]
  },
  reduced: false // 움직임 줄이기: 켜지면 모든 dur가 10ms
};

MOTION.apply = function () {
  var rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  MOTION.reduced = !!rm;
  var st = document.documentElement.style;
  Object.keys(MOTION.ease).forEach(function (k) {
    st.setProperty('--ease-' + k.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }), MOTION.ease[k]);
  });
  Object.keys(MOTION.dur).forEach(function (k) {
    if (rm) MOTION.dur[k] = 10;
    st.setProperty('--dur-' + k, MOTION.dur[k] + 'ms');
  });
};

// 진동 한 번. 지원 안 하면 조용히 넘어감.
MOTION.buzz = function (name) {
  var p = MOTION.vibe[name];
  if (p != null && navigator.vibrate) navigator.vibrate(p);
};

MOTION.apply();
