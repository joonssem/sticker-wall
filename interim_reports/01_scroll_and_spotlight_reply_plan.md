# 스티커 담벼락: 실시간 화면 깜빡임/스크롤 점프 개선 및 발표 화면 댓글 복원 기술 보고서

## 1. 개요 및 배경

교실 수업 실사용 환경에서 학생들이 글을 작성하거나 새로 입장할 때, 화면 전체가 깜빡거리며 스크롤이 최상단으로 리셋되는 현상(Scroll Jump)이 발생하여 질문 탐색과 글 작성이 중단되는 문제가 보고되었습니다. 또한, 과거 커밋에서 작업되었던 발표 화면(스포트라이트 오버레이) 내 질문 댓글(답글) 토글 기능이 후속 기능 병합 과정에서 누락된 사실을 확인하여 이를 함께 해결하였습니다.

---

## 2. 문제 원인 분석 (Root Cause Analysis)

### 2.1 실시간 갱신 시 화면 깜빡임 및 스크롤 최상단 이동
- **Firebase Realtime Listener 동작 방식**:
  - `rooms/${ROOM_ID}` 경로를 구독하는 `onValue` 리스너는 학생 입장, 새 포스트잇 추가, 질문 등록 등 데이터 변경이 일어날 때마다 `room` 데이터 전체를 수신하고 `render()`를 재호출함.
- **전체 DOM 재구축**:
  - `render()` -> `renderApp()` -> `shell()` 순으로 실행되며, `appEl.innerHTML = ...`를 통해 전체 DOM 트리를 매번 완전히 파괴하고 다시 생성함.
- **스크롤 상태 유실 및 간섭**:
  - 커밋 `9387a17`에서 포커스 유실 방지 로직(`captureFocusState`/`restoreFocusState`)은 도입되었으나, **스크롤 위치(`window.scrollY` 및 내부 컨테이너 `scrollTop`)를 보존하는 로직은 누락**되어 DOM이 재생성되는 순간 스크롤이 0으로 리셋됨.
  - 또한 기존 `restoreFocusState`의 `el.focus()` 호출 시 브라우저가 포커스 요소로 스크롤을 강제 이동시키면서 화면 스크롤이 추가로 튀는 현상 유발.
- **교사 화면의 불필요한 레이아웃 시프트**:
  - 교사 화면에서 `renderRoomQr()` 실행 시 `queueMicrotask(arrangeTeacherControls)`가 비동기로 DOM 구조를 다시 변경하고, QR 코드를 매 렌더마다 새로 생성하여 심한 깜빡임 발생.

### 2.2 발표 화면 댓글 토글 기능 누락 (회귀 결함)
- 커밋 `177a75a`에서 스포트라이트 화면에 질문별 답글 토글 버튼(`<button class="spotlight-answer-toggle">`)과 답글 목록(`<ul class="spotlight-answers">`)이 구현되었음.
- 그러나 커밋 `489cebe`("Add student question coach learning flow")에서 질문 코치 기능을 추가하며 `app.js`와 `styles.css`를 전면 재작성/병합하는 과정에서 해당 로직 및 스타일이 누락되어 단순 질문 텍스트만 출력되는 상태로 회귀함.

---

## 3. 해결 및 구현 내용

### 3.1 스크롤 보존 및 깜빡임 제거 (`app.js`, `styles.css`)
1. **스크롤 캡처 및 복원 함수 구현**:
   - `captureScrollState()`: `window.scrollX`, `window.scrollY` 및 주요 스크롤 컨테이너(`.stickies`, `.spotlight-questions`, `.card`, `.control-grid`, `.teacher-dashboard`)의 스크롤 위치를 기록.
   - `restoreScrollState()`: DOM 재렌더링 직후 1차 동기 복원 및 `requestAnimationFrame`을 통한 2차 레이아웃 보정을 수행하여 단일 프레임 내 완벽한 위치 유지 보장.
2. **포커스 복원 시 브라우저 간섭 차단**:
   - `restoreFocusState()`에서 `el.focus({preventScroll: true})` 옵션을 적용하여 브라우저 기본 스크롤 점프를 방지.
3. **렌더링 파이프라인 정립**:
   ```javascript
   function render() {
     const focusState = captureFocusState();
     const scrollState = captureScrollState();
     renderApp();
     restoreFocusState(focusState);
     restoreScrollState(scrollState);
   }
   ```
4. **QR 코드 캐싱 및 동기 제어 배치**:
   - `cachedQrDataUrl`을 도입하여 동일 URL의 QR 코드 중복 생성을 방지하고, `queueMicrotask` 대신 동기적으로 컨트롤 바(`arrangeTeacherControls`)를 배치하여 화면 깜빡임과 CLS 억제.

### 3.2 발표 화면(스포트라이트) 댓글 토글 기능 복원
1. **상태 관리**: 전역 상태 변수 `spotlightOpenQuestionId`를 선언하고, 포스트잇 변경(`moveSpotlight`, 새 포스트잇 선택) 시 초기화 연동.
2. **마크업 복원 (`spotlightMarkup`)**:
   - 각 질문 항목에 `.spotlight-question-line`과 `<button class="spotlight-answer-toggle" data-spotlight-answers="${id}">답글 N개 ▾/▴</button>` 추가.
   - 토글 열림 상태 시 답글 목록(`<ul class="spotlight-answers">`) 출력 및 빈 답글 안내 처리.
3. **이벤트 핸들러 연동 (`bindSpotlightControls`)**:
   - `[data-spotlight-answers]` 클릭 시 해당 질문 ID를 토글하고 화면을 재렌더링.
4. **스타일 복원 (`styles.css`)**:
   - `.spotlight-question-line`, `.spotlight-answer-toggle`, `.spotlight-answers`, 모바일 반응형 미디어 쿼리 복원.

### 3.3 캐시 무효화 및 배포 관리 (`index.html`)
- `styles.css?v=spotlight-replies-v1-20260930`
- `app.js?v=scroll-spotlight-v1-20260930`
- 버전 파라미터를 갱신하여 클라이언트 브라우저 캐시 문제를 원천 차단.

---

## 4. 검증 결과 및 피드백

| 검증 항목 | 검증 방법 | 결과 |
| --- | --- | --- |
| JavaScript 문법 검사 | `node -c app.js` | 통과 |
| Worker 단위 테스트 | `npm run test:worker` | 통과 |
| 배포 및 Git 동기화 | 커밋 `17d770e` GitHub Pages 배포 | 완료 |
| 스크롤 보존 확인 | 긴 포스트잇 목록 스크롤 상태에서 실시간 데이터 갱신 시 스크롤 유지 | 정상 작동 확인 |
| 발표 화면 댓글 토글 확인 | 스포트라이트 화면에서 `[답글 N개 ▾]` 클릭 시 답글 목록 펼침/접힘 | **실제 브라우저 검증 완료 ("확인 완료 잘 나옴")** |

---

## 5. 향후 유지보수 참고사항
- 포스트잇이나 담벼락 구조 변경 시 `captureScrollState()`의 추적 대상 셀렉터 목록(`.stickies`, `.spotlight-questions`, `.card` 등)을 함께 업데이트할 것.
- 향후 대규모 기능 추가 시 이전 커밋의 발표 제어 및 스포트라이트 로직이 누락되지 않도록 회귀 테스트 체크리스트를 준수할 것.
