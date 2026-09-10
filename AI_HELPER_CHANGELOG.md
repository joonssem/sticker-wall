# 스티커 담벼락 AI 도우미 작업 기록

작성일: 2026-09-10

## 목표

기존 교사 컴퓨터의 로컬 Node/PowerShell 서버에 의존하던 Solar AI 도우미를, Firebase 유료 버전 없이 사용할 수 있는 Cloudflare Worker 프록시 구조로 전환했다.

## 문제 분석

- AI 기능이 로컬 서버 실행과 API 키 입력에 의존해 수업 흐름에서 사용하기 어려웠다.
- 브라우저가 직접 Solar API를 호출하면 API 키가 노출될 수 있었다.
- Firebase Realtime Database에 저장된 활동 데이터와 AI 요청 데이터의 형태가 일관되지 않았다.
- 화면을 다시 렌더링할 때 AI 버튼 이벤트와 결과 표시가 사라질 가능성이 있었다.
- 초기 배포 과정에서 `app.js`의 `renderRoomRequired` 중복 선언으로 JavaScript 전체가 실행되지 않아 첫 화면의 대기 문구만 계속 보였다.
- 이후 Worker의 Firebase `accounts:lookup` 검증에 사용한 Web API 키가 서버 요청에서 유효하지 않아, 교사 인증 후에도 Worker가 `교사 인증이 필요합니다`를 반환했다.

## 적용한 구조

1. 교사 화면에서 활동 데이터를 익명화해 AI 요청을 만든다.
2. 브라우저는 Firebase ID 토큰을 `Authorization: Bearer ...`로 Cloudflare Worker에 전달한다.
3. Worker가 Firebase 공개 서명키로 ID 토큰의 서명, 발급자, 프로젝트, 만료 시간, 교사 UID를 검증한다.
4. 검증이 통과하면 Worker만 Solar API를 호출하고 결과를 브라우저에 반환한다.

Firebase Realtime Database는 기존 무료 Spark 요금제를 그대로 사용한다. Solar API 키는 Worker secret에만 보관하며 저장소나 브라우저 코드에 넣지 않는다.

## 주요 변경 파일

- `app.js`
  - Cloudflare Worker 호출 추가
  - 교사 AI 기능 6종 연결: 요약, 발표 순서, 연결 질문, 질문 다양성, 다음 안내, 민감 표현 검토
  - 활동 데이터 익명화 및 결과 표시 상태 관리
  - 초기 로딩 화면과 Firebase 로딩 실패 시 데모 화면 추가
- `index.html`
  - 초기 로딩 화면 추가
  - 캐시 갱신을 위한 앱 번들 버전 변경
- `cloudflare-worker/worker.js`
  - Solar API 프록시
  - CORS와 요청 크기 제한
  - Firebase ID 토큰 공개키 검증
  - 허용된 교사 UID만 AI 사용 가능

배포 Worker 주소: `https://sticker-wall-ai.joon0noh.workers.dev/assist`

## 배포 기록

- `46db521` — Cloudflare Worker 기반 교사 AI 연결
- `ec90b9a` — 초기 화면 로딩 상태 표시
- `598a030` — 앱 번들 캐시 버전 갱신
- `13f0d27` — 중복 `renderRoomRequired` 선언 수정
- `d9438c1` — 인증 수정 후 앱 캐시 버전 재갱신
- `f4524ca` — Worker의 Firebase 교사 토큰 검증 방식 변경

## 검증 결과

- GitHub Pages 첫 화면 정상 표시 확인
- 교사 계정으로 담벼락 입장 확인
- Cloudflare Worker 배포 상태 확인
- 교사 화면에서 `실시간 활동 요약` 실행 후 AI 결과 생성 확인
- 저장소 작업 트리 clean 상태 확인

## 운영 메모

- AI 기능은 교사 UID가 일치하는 계정에서만 동작한다.
- Solar API 키 변경 시 Cloudflare Worker의 `SOLAR_API_KEY` secret만 갱신하면 된다.
- Worker 코드 변경 후 Cloudflare 대시보드에서 새 버전을 배포해야 한다.
- Firebase 유료 요금제 전환은 현재 구조에 필요하지 않다.
- API 키, Firebase 토큰, 학생 이름·출석번호는 이 기록에 저장하지 않는다.
