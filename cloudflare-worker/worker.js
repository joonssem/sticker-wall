const ALLOWED_ORIGINS = new Set([
  'https://joonssem.github.io',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
]);
const TEACHER_UID = 'Z6WEsEFSTBbq6eeIF3E0RaBGoQZ2';
const FIREBASE_PROJECT_ID = 'ques-c126f';
const DEFAULT_DATABASE_URL = 'https://ques-c126f-default-rtdb.asia-southeast1.firebasedatabase.app';
const MODEL = 'solar-pro3';
const MAX_BODY_BYTES = 120000;
const MAX_STUDENT_BODY_BYTES = 4096;
const TEACHER_MODES = new Set(['summary', 'order', 'followup', 'diversity', 'guide', 'safety']);

const PROMPTS = {
  summary: '당신은 초등 교사의 수업 보조자입니다. 익명 담벼락의 주제와 참여 양상을 3문장 이내로 따뜻하게 요약하고, 다음 진행 제안 1가지를 덧붙이세요. 학생을 평가·서열화하지 말고 이름·출석번호·색을 언급하지 마세요.',
  order: '당신은 초등 교사의 수업 보조자입니다. 익명 담벼락에서 발표 후보 3개를 postId와 함께 제안하세요. 질문 수만 따르지 말고 주제 다양성과 아직 다루지 않은 경험을 고려하세요. 각 후보에 한 문장 이유를 붙이고 최종 선택은 교사에게 있다고 덧붙이세요.',
  followup: '당신은 초등 교사의 수업 보조자입니다. selectedPost가 있으면 그 글을 바탕으로, 없으면 활동 전체를 바탕으로 발표 뒤 열린 질문 3개를 만드세요. 경험과 느낌을 듣는 말투로 작성하고 이름·출석번호·색을 언급하지 마세요.',
  diversity: '당신은 초등 교사의 수업 보조자입니다. 질문의 반복되는 표현과 아직 적은 질문 방향을 간단히 살피고, 새로운 질문 방향 3가지를 제안하세요. 학급이나 개인을 점수화하지 마세요.',
  guide: '당신은 초등 교사의 수업 보조자입니다. 현재 활동 단계와 실제 학생 활동에 맞는 따뜻하고 짧은 교사 안내 문구를 1~2문장으로 만드세요. 담벼락 제목·관리 메모에 들어 있는 테스트, 배포, 삭제, 코드, 기능 점검 표현은 수업 안내의 소재로 쓰지 마세요. 활동 정보가 적으면 특정 주제 대신 지금 할 수 있는 질문·경청 행동을 안내하세요. 특정 학생을 지목하거나 경쟁을 유도하지 마세요.',
  safety: '당신은 초등 교사의 수업 보조자입니다. 포스트잇·질문·답글에서 개인정보 노출, 놀림·배제, 자해·위험 신호처럼 교사가 확인할 표현만 postId와 함께 조심스럽게 요약하세요. 애매하면 "교사 확인 권장"이라고 표현하고 자동 삭제를 권하지 마세요. 해당 표현이 없다면 "지금 확인할 표현은 보이지 않음"이라고 답하세요.'
};

const REFINE_PROMPT = `당신은 초등학교 5학년 학생의 질문 코치입니다.
학생 대신 질문을 완성하거나 답을 설명하지 말고, 학생이 자신의 궁금함을 표현하도록 돕습니다.
goal이 clarify이면 원래 궁금함을 유지하며 대상·상황·조건을 떠올릴 힌트 하나를 줍니다.
goal이 explore이면 이유·변화·비교·가정·관점·근거 중 현재 질문과 다른 방향 하나만 제안합니다.
사실 확인 질문과 짧은 질문도 필요한 질문으로 인정합니다. 이미 명확하면 alreadyClear를 true로 합니다.
칭찬, 점수, 등급, 정답, 사실 해설을 쓰지 않습니다. 입력에 없는 고유 사실을 만들지 않습니다.
observation, hint, example은 각각 100자 이내의 쉬운 한국어로 씁니다.
example은 학생이 그대로 제출할 완성 질문이 아니라, ___ 빈칸이 1개 들어간 질문 뼈대입니다. 학생이 빈칸을 자신의 말로 채울 수 있게 합니다.
반드시 {"observation":"...","hint":"...","example":"...","alreadyClear":false} 형태의 JSON 하나만 출력합니다.`;

function requestOrigin(request) {
  const origin = request.headers.get('origin') || '';
  return ALLOWED_ORIGINS.has(origin) ? origin : 'https://joonssem.github.io';
}

function corsHeaders(origin) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'content-type': 'application/json; charset=utf-8',
    'vary': 'Origin'
  };
}

function json(value, status, origin) {
  return new Response(JSON.stringify(value), { status: status || 200, headers: corsHeaders(origin) });
}

function text(value, max) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function sanitizeQuestion(question) {
  return { id: text(question?.id, 80), text: text(question?.text, 300), answers: Array.isArray(question?.answers) ? question.answers.slice(0, 2).map(answer => ({ text: text(answer?.text, 300) })) : [], followups: Array.isArray(question?.followups) ? question.followups.slice(0, 2).map(item => ({ text: text(item?.text, 300) })) : [] };
}

function sanitizePost(post) {
  return {
    id: text(post?.id, 80),
    text: text(post?.text, 500),
    questions: Array.isArray(post?.questions) ? post.questions.slice(0, 20).map(sanitizeQuestion) : []
  };
}

function sanitizeActivity(activity) {
  return {
    title: text(activity?.title, 120),
    topic: text(activity?.topic, 80),
    keyTerms: Array.isArray(activity?.keyTerms) ? activity.keyTerms.slice(0, 5).map(value => text(value, 32)).filter(Boolean) : [],
    phase: ['join', 'writing', 'voting', 'presenting'].includes(activity?.phase) ? activity.phase : 'join',
    participantCount: Math.max(0, Math.min(100, Number(activity?.participantCount) || 0)),
    postCount: Math.max(0, Math.min(300, Number(activity?.postCount) || 0)),
    questionCount: Math.max(0, Math.min(1000, Number(activity?.questionCount) || 0)),
    selectedPost: activity?.selectedPost ? sanitizePost(activity.selectedPost) : null,
    posts: Array.isArray(activity?.posts) ? activity.posts.slice(0, 100).map(sanitizePost) : []
  };
}

function sanitizeRoomId(value) {
  const roomId = text(value, 24).toUpperCase();
  return /^STICKER-[A-Z0-9]{4,10}$/.test(roomId) ? roomId : '';
}

function sanitizeNodeId(value) {
  const id = text(value, 80);
  return id && !/[.#$\[\]/]/.test(id) ? id : '';
}

function sanitizeRefineInput(body, trustedContext) {
  const goal = body?.goal === 'explore' ? 'explore' : body?.goal === 'clarify' ? 'clarify' : '';
  const question = text(body?.question, 80);
  if (!goal || !question) return null;
  return {
    goal,
    question,
    context: {
      title: text(trustedContext?.title, 40),
      topic: text(trustedContext?.topic, 80),
      keyTerms: Array.isArray(trustedContext?.keyTerms) ? trustedContext.keyTerms.slice(0, 5).map(value => text(value, 32)).filter(Boolean) : [],
      postText: text(trustedContext?.postText, 80)
    }
  };
}

function hasSingleBlank(example) {
  return (String(example).match(/_/g) || []).length === 3 && String(example).includes('___');
}

function fallbackExample(goal) {
  return goal === 'explore'
    ? '만약 ___라면 어떻게 달라질까요?'
    : '___에 대해 더 자세히 알고 싶은 점은 무엇인가요?';
}

function parseRefineResult(content, exampleFallback = '') {
  try {
    const raw = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const value = JSON.parse(raw);
    const result = {
      observation: text(value?.observation, 100),
      hint: text(value?.hint, 100),
      example: text(value?.example, 100),
      alreadyClear: Boolean(value?.alreadyClear)
    };
    if (!hasSingleBlank(result.example) && hasSingleBlank(exampleFallback)) result.example = exampleFallback;
    return result.observation && result.hint && hasSingleBlank(result.example) ? result : null;
  } catch {
    return null;
  }
}

let firebaseKeysPromise;

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(normalized), char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function firebaseKeys() {
  if (!firebaseKeysPromise) {
    firebaseKeysPromise = fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Firebase public keys unavailable')));
  }
  return firebaseKeysPromise;
}

async function verifyFirebase(request) {
  const header = request.headers.get('authorization') || '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!idToken) return null;
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = idToken.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) return null;
    const tokenHeader = JSON.parse(decodeBase64Url(encodedHeader));
    const claims = JSON.parse(decodeBase64Url(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (tokenHeader.alg !== 'RS256' || claims.aud !== FIREBASE_PROJECT_ID || claims.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}` || !claims.sub || !claims.exp || claims.exp <= now || claims.iat > now + 60) return null;
    const keys = await firebaseKeys();
    const jwk = keys.keys?.find(key => key.kid === tokenHeader.kid);
    if (!jwk) return null;
    const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const normalizedSignature = encodedSignature.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encodedSignature.length / 4) * 4, '=');
    const signature = Uint8Array.from(atob(normalizedSignature), char => char.charCodeAt(0));
    const verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`));
    return verified ? { claims, idToken } : null;
  } catch {
    return null;
  }
}

async function firebaseRead(env, path, idToken) {
  const base = String(env.FIREBASE_DATABASE_URL || DEFAULT_DATABASE_URL).replace(/\/$/, '');
  const response = await fetch(`${base}/${path}.json?auth=${encodeURIComponent(idToken)}`, { headers: { accept: 'application/json' } });
  if (!response.ok) return undefined;
  return response.json();
}

async function trustedStudentContext(env, roomId, postId, auth) {
  const roomKey = encodeURIComponent(roomId), uidKey = encodeURIComponent(auth.claims.sub), postKey = encodeURIComponent(postId);
  const member = await firebaseRead(env, `roomMembers/${roomKey}/${uidKey}`, auth.idToken);
  if (!member || member.joinCode !== roomId) return { error: '이 담벼락의 참여 정보를 확인하지 못했어요.', status: 403 };
  const [phase, enabled, title, topic, keyTerms, postText] = await Promise.all([
    firebaseRead(env, `rooms/${roomKey}/phase`, auth.idToken),
    firebaseRead(env, `rooms/${roomKey}/questionCoachEnabled`, auth.idToken),
    firebaseRead(env, `rooms/${roomKey}/title`, auth.idToken),
    firebaseRead(env, `rooms/${roomKey}/topic`, auth.idToken),
    firebaseRead(env, `rooms/${roomKey}/keyTerms`, auth.idToken),
    firebaseRead(env, `rooms/${roomKey}/posts/${postKey}/text`, auth.idToken)
  ]);
  if (phase !== 'voting') return { error: '지금은 질문을 다듬는 시간이 아니에요.', status: 409 };
  if (enabled !== true) return { error: '선생님이 질문 코치를 열지 않았어요.', status: 403 };
  if (typeof postText !== 'string') return { error: '질문할 포스트잇을 찾지 못했어요.', status: 404 };
  return { context: { title, topic, keyTerms: Array.isArray(keyTerms) ? keyTerms : Object.values(keyTerms || {}), postText } };
}

async function enforceStudentLimit(env, studentKey, roomKey = studentKey) {
  if (!env.AI_BURST_LIMITER || !env.AI_ROOM_LIMITER) {
    return { error: '질문 코치의 사용량 제한 설정을 확인하고 있어요. 직접 질문은 등록할 수 있어요.', status: 503 };
  }
  const [burst, room] = await Promise.all([
    env.AI_BURST_LIMITER.limit({ key: studentKey }),
    env.AI_ROOM_LIMITER.limit({ key: roomKey })
  ]);
  return burst.success && room.success ? null : { error: '이번 담벼락에서 질문 코치 도움을 모두 사용했어요. 직접 질문을 이어서 쓸 수 있어요.', status: 429 };
}

async function callSolar(env, messages, maxTokens) {
  if (!env.SOLAR_API_KEY) return { error: 'Solar API 키가 Worker에 설정되지 않았습니다.', status: 500 };
  const response = await fetch('https://api.upstage.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.SOLAR_API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, stream: false })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { error: data?.error?.message || 'Solar API 요청에 실패했습니다.', status: response.status >= 500 ? 502 : 400 };
  return { content: data.choices?.[0]?.message?.content || '' };
}

async function handleTeacher(env, mode, body, origin) {
  const activity = sanitizeActivity(body.activity || {});
  const solar = await callSolar(env, [
    { role: 'system', content: `${PROMPTS[mode]} 출력은 한국어 일반 텍스트로만 작성하고 Markdown 표·제목 기호는 사용하지 마세요.` },
    { role: 'user', content: JSON.stringify(activity) }
  ], 700);
  if (solar.error) return json({ error: solar.error }, solar.status, origin);
  return json({ result: solar.content || 'AI 결과를 읽지 못했습니다.' }, 200, origin);
}

async function handleStudentRefine(env, body, auth, origin) {
  const roomId = sanitizeRoomId(body.roomId), postId = sanitizeNodeId(body.postId);
  if (!roomId || !postId) return json({ error: '담벼락 또는 포스트잇 정보를 확인해 주세요.' }, 400, origin);
  const trusted = await trustedStudentContext(env, roomId, postId, auth);
  if (trusted.error) return json({ error: trusted.error }, trusted.status, origin);
  const input = sanitizeRefineInput(body, trusted.context);
  if (!input) return json({ error: '질문과 도움 방향을 확인해 주세요.' }, 400, origin);
  const limited = await enforceStudentLimit(env, `${roomId}:${auth.claims.sub}`, roomId);
  if (limited) return json({ error: limited.error }, limited.status, origin);
  let solar = await callSolar(env, [
    { role: 'system', content: REFINE_PROMPT },
    { role: 'user', content: JSON.stringify(input) }
  ], 300);
  if (solar.error) return json({ error: '질문 도움을 만들지 못했어요. 직접 질문은 등록할 수 있어요.' }, solar.status, origin);
  const exampleFallback = fallbackExample(input.goal);
  let result = parseRefineResult(solar.content, exampleFallback);
  if (!result) {
    solar = await callSolar(env, [
      { role: 'system', content: REFINE_PROMPT },
      { role: 'user', content: JSON.stringify(input) },
      { role: 'assistant', content: solar.content },
      { role: 'user', content: '위 내용을 지정된 JSON 형식으로만 다시 작성하세요.' }
    ], 300);
    result = solar.error ? null : parseRefineResult(solar.content, exampleFallback);
  }
  if (!result) return json({ error: '질문 도움의 형식을 읽지 못했어요. 직접 질문은 등록할 수 있어요.' }, 502, origin);
  return json({ result }, 200, origin);
}

export default {
  async fetch(request, env) {
    const originHeader = request.headers.get('origin') || '';
    const origin = requestOrigin(request);
    if (originHeader && !ALLOWED_ORIGINS.has(originHeader)) return json({ error: '허용되지 않은 웹사이트입니다.' }, 403, origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/assist') return json({ error: '없는 요청입니다.' }, 404, origin);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json({ error: '요청이 너무 큽니다.' }, 413, origin);
    let body;
    try { body = JSON.parse(raw || '{}'); } catch { return json({ error: 'JSON 형식이 아닙니다.' }, 400, origin); }
    const auth = await verifyFirebase(request);
    if (!auth) return json({ error: '로그인 정보를 확인하지 못했습니다.' }, 401, origin);
    if (body.mode === 'question-refine') {
      if (new TextEncoder().encode(raw).length > MAX_STUDENT_BODY_BYTES) return json({ error: '질문 도움 요청이 너무 큽니다.' }, 413, origin);
      return handleStudentRefine(env, body, auth, origin);
    }
    if (!TEACHER_MODES.has(body.mode)) return json({ error: '지원하지 않는 AI 기능입니다.' }, 400, origin);
    if (auth.claims.sub !== TEACHER_UID) return json({ error: '교사 인증이 필요합니다.' }, 401, origin);
    return handleTeacher(env, body.mode, body, origin);
  }
};

export { PROMPTS, REFINE_PROMPT, enforceStudentLimit, parseRefineResult, sanitizeNodeId, sanitizeRefineInput, sanitizeRoomId };
