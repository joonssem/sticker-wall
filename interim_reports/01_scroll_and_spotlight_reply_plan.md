# 스티커 담벼락: 실시간 화면 깜빡임/스크롤 점프 개선 및 발표 화면 댓글 복원 계획 및 결과 보고

## 1. 개요 및 목적
교실 수업 중 다수의 학생이 입장하거나 글/질문을 등록할 때 발생하는 화면 깜빡임과 스크롤 최상단 리셋 현상을 해결하고, 이전 작업에서 누락된 발표 화면(스포트라이트) 댓글 조회 기능을 복원하여 원활한 수업 및 발표 진행을 보장합니다.

---

## 2. 작업 체크리스트 및 완료 현황

### 🔴 P0 (긴급 / 핵심 사용성): 실시간 갱신 시 스크롤 최상단 이동 및 화면 깜빡임 개선 — [완료]
- [x] **1. 스크롤 위치 캡처 및 복원 함수 구현 (`app.js`)**
  - [x] `window.scrollY` 및 `window.scrollX` 위치 캡처 (`captureScrollState()`)
  - [x] 내부 스크롤 가능 컨테이너(`.stickies`, `.spotlight-questions`, `.control-grid`, `.teacher-dashboard`, `.card`)의 `scrollTop` 위치 캡처
  - [x] 렌더링 직후 및 `requestAnimationFrame`을 통한 2단계 스크롤 복원 (`restoreScrollState()`)
  - [x] 포커스 복원 시 브라우저 스크롤 강제 점프 방지 (`el.focus({preventScroll: true})`)
- [x] **2. 렌더링 파이프라인 순서 보정 (`render()`)**
  - [x] 1) `const focusState = captureFocusState();`
  - [x] 2) `const scrollState = captureScrollState();`
  - [x] 3) `renderApp();`
  - [x] 4) `restoreFocusState(focusState);`
  - [x] 5) `restoreScrollState(scrollState);`
- [x] **3. 불필요한 전체 재렌더링 방지 및 DOM 깜빡임 완화**
  - [x] 교사 화면 QR 코드 생성 시 중복 재생성 방지 (`cachedQrDataUrl` 캐싱)
  - [x] `queueMicrotask` 레이아웃 시프트 대신 동기적 컨트롤 배치 (`arrangeTeacherControls()`)

---

### 🟡 P1 (중요 / 회귀 결함 복구): 발표 화면(스포트라이트) 질문 댓글(답글) 토글 복원 — [완료]
- [x] **1. 상태 변수 복원 (`app.js`)**
  - [x] `spotlightOpenQuestionId` 전역 상태 변수 선언
  - [x] 포스트잇 변경(`moveSpotlight`, `selectedPostId` 변경) 시 `spotlightOpenQuestionId = null` 초기화 처리
- [x] **2. 스포트라이트 질문 마크업 복원 (`spotlightMarkup()`)**
  - [x] 커밋 `177a75a` 기준 구조 복원:
    - 질문 텍스트 라인: `.spotlight-question-line`
    - 댓글 토글 버튼: `<button class="spotlight-answer-toggle" data-spotlight-answers="${id}">답글 N개 ▾</button>`
    - 댓글 목록: 열려있을 때 `<ul class="spotlight-answers">` 렌더링 (댓글 없을 시 `.empty-answer` 안내)
- [x] **3. 이벤트 핸들러 복원 (`bindSpotlightControls()`)**
  - [x] `[data-spotlight-answers]` 버튼 클릭 시 해당 질문 ID의 토글 및 재렌더링 이벤트 바인딩
- [x] **4. 스타일 연동 확인 (`styles.css`)**
  - [x] 기존 정의된 `.spotlight-question-line`, `.spotlight-answer-toggle`, `.spotlight-answers` CSS 클래스 정상 적용

---

### 🟢 P2 (검증 및 배포 준비): 기능 및 회귀 검증 — [완료]
- [x] **1. 코드 문법 및 단위 검증**
  - [x] `node -c app.js` 문법 검증 통과
  - [x] `npm run test:worker` 질문 다듬기 Worker 검증 통과
- [x] **2. 버전 및 브라우저 캐시 무효화**
  - [x] `index.html` 내 `app.js` 스크립트 태그 버전 쿼리스트링 갱신 (`app.js?v=scroll-spotlight-v1-20260930`)

---

## 3. 수정 결과 및 기술적 의의
1. **스크롤 안정성**:
   - 실시간으로 Firebase에서 데이터가 갱신되어 `render()`가 재호출되더라도, 사용자가 읽거나 작성 중이던 스크롤 위치와 컨테이너 스크롤이 단일 프레임 내에 즉시 복원되어 스크롤이 맨 위로 튀는 현상이 근본적으로 차단되었습니다.
   - 포커스 복원 시 `{preventScroll: true}`를 적용하여 브라우저의 기본 포커스 스크롤 이동과의 충돌을 방지했습니다.
2. **발표 화면 댓글 탐색**:
   - 스포트라이트 화면에서 각 질문의 `답글 N개 ▾/▴` 토글 버튼을 통해 발표 중에도 질문에 달린 친구들의 답글을 자연스럽게 펼쳐보고 다시 접을 수 있도록 복원되었습니다.
3. **깜빡임 완화**:
   - 교사 화면에서 매 렌더마다 비동기 마이크로태스크로 실행되던 컨트롤 배치를 동기화하고, QR 코드 Data URL을 캐싱하여 재렌더링 시 발생하는 레이아웃 시프트 및 깜빡임을 크게 줄였습니다.
