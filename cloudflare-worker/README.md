# 스티커 담벼락 AI Worker 배포 안내

`worker.js`는 교사용 수업 도움과 학생용 `question-refine` 요청을 Solar API에 연결한다. 이 파일이 Worker의 기준 소스다.

## 배포 전 확인

1. `npm run test:worker`로 입력 정리·응답 형식·질문 코치 프롬프트 규칙을 확인한다.
2. `npm run test:rules`로 Firebase Realtime Database 규칙을 확인한다.
3. Firebase 규칙을 실제 프로젝트에 게시한다.
4. Cloudflare Worker에 아래 바인딩이 있는지 확인한다.

- 비밀 값 `SOLAR_API_KEY`
- 선택 값 `FIREBASE_DATABASE_URL`
- rate limiter `AI_BURST_LIMITER`: 같은 학생의 연속 요청 제한
- rate limiter `AI_ROOM_LIMITER`: 담벼락별 학생 요청 제한

rate limiter가 없으면 학생용 질문 다듬기는 `503`으로 안전하게 실패하며, 학생은 직접 질문을 등록할 수 있다.

## Cloudflare 배포

Cloudflare Dashboard의 Quick Edit 또는 인증된 Wrangler 환경에서 다음 명령으로 배포한다.

```powershell
npx wrangler deploy cloudflare-worker/worker.js --name sticker-wall-ai --compatibility-date 2026-09-11
```

배포 뒤에는 다음을 확인한다.

1. `OPTIONS /assist`가 GitHub Pages Origin에 CORS 헤더와 함께 `204`를 반환한다.
2. 인증 없는 `question-refine` 요청이 `401`로 거부된다.
3. 교사 화면의 수업 도움 요청이 Solar 응답을 정상 표시한다.
4. 실제 학생 기기에서 질문 단계의 `질문 다듬기`가 힌트·빈칸형 예시만 보여 주고, 질문을 자동 등록하지 않는다.

## 운영 원칙

- Worker는 클라이언트가 보낸 제목·주제·포스트잇 본문을 신뢰하지 않고 Firebase에서 다시 읽는다.
- 학생 요청은 Firebase ID 토큰, 담벼락 참여 상태, 질문 코치 허용 상태, 질문 단계, 대상 포스트잇을 모두 확인한다.
- Solar 응답은 길이가 제한된 JSON만 허용한다. 형식을 읽지 못하면 학생이 직접 질문을 등록하도록 안내한다.
- `guide` 응답은 테스트·배포·삭제 같은 관리용 제목 문구를 수업 안내로 사용하지 않는다.
- `example`은 학생이 그대로 제출할 답안이 아니라, 학생이 채우는 빈칸형 질문 뼈대여야 한다.
