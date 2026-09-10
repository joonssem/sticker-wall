const ALLOWED_ORIGIN = 'https://joonssem.github.io';
const TEACHER_UID = 'Z6WEsEFSTBbq6eeIF3E0RaBGoQZ2';
const MODEL = 'solar-pro3';
const MAX_BODY_BYTES = 120000;
const MODES = new Set(['summary', 'order', 'followup', 'diversity', 'guide', 'safety']);

const PROMPTS = {
  summary: '당신은 초등 교사의 수업 보조자입니다. 익명 담벼락의 주제와 참여 양상을 3문장 이내로 따뜻하게 요약하고, 다음 진행 제안 1가지를 덧붙이세요. 학생을 평가·서열화하지 말고 이름·출석번호·색을 언급하지 마세요.',
  order: '당신은 초등 교사의 수업 보조자입니다. 익명 담벼락에서 발표 후보 3개를 postId와 함께 제안하세요. 질문 수만 따르지 말고 주제 다양성과 아직 다루지 않은 경험을 고려하세요. 각 후보에 한 문장 이유를 붙이고 최종 선택은 교사에게 있다고 덧붙이세요.',
  followup: '당신은 초등 교사의 수업 보조자입니다. selectedPost가 있으면 그 글을 바탕으로, 없으면 활동 전체를 바탕으로 발표 뒤 열린 질문 3개를 만드세요. 경험과 느낌을 듣는 말투로 작성하고 이름·출석번호·색을 언급하지 마세요.',
  diversity: '당신은 초등 교사의 수업 보조자입니다. 질문의 반복되는 표현과 아직 적은 질문 방향을 간단히 살피고, 새로운 질문 방향 3가지를 제안하세요. 학급이나 개인을 점수화하지 마세요.',
  guide: '당신은 초등 교사의 수업 보조자입니다. 현재 활동 단계에 맞는 따뜻하고 짧은 교사 안내 문구를 1~2문장으로 만드세요. 특정 학생을 지목하거나 경쟁을 유도하지 마세요.',
  safety: '당신은 초등 교사의 수업 보조자입니다. 포스트잇·질문·답글에서 개인정보 노출, 놀림·배제, 자해·위험 신호처럼 교사가 확인할 표현만 postId와 함께 조심스럽게 요약하세요. 애매하면 "교사 확인 권장"이라고 표현하고 자동 삭제를 권하지 마세요. 해당 표현이 없다면 "지금 확인할 표현은 보이지 않음"이라고 답하세요.'
};

function corsHeaders() {
  return {
    'access-control-allow-origin': ALLOWED_ORIGIN,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'content-type': 'application/json; charset=utf-8',
    'vary': 'Origin'
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: corsHeaders() });
}

function text(value, max) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
}

function sanitizeQuestion(question) {
  return { id: text(question?.id, 80), text: text(question?.text, 300), answers: Array.isArray(question?.answers) ? question.answers.slice(0, 2).map(answer => ({ text: text(answer?.text, 300) })) : [] };
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
    phase: ['join', 'writing', 'voting', 'presenting'].includes(activity?.phase) ? activity.phase : 'join',
    participantCount: Math.max(0, Math.min(100, Number(activity?.participantCount) || 0)),
    postCount: Math.max(0, Math.min(300, Number(activity?.postCount) || 0)),
    questionCount: Math.max(0, Math.min(1000, Number(activity?.questionCount) || 0)),
    selectedPost: activity?.selectedPost ? sanitizePost(activity.selectedPost) : null,
    posts: Array.isArray(activity?.posts) ? activity.posts.slice(0, 100).map(sanitizePost) : []
  };
}

async function verifyTeacher(request, env) {
  const header = request.headers.get('authorization') || '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!idToken || !env.FIREBASE_WEB_API_KEY) return false;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  if (!response.ok) return false;
  const data = await response.json();
  return data.users?.[0]?.localId === TEACHER_UID;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    if (origin && origin !== ALLOWED_ORIGIN) return json({ error: '허용되지 않은 웹사이트입니다.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/assist') return json({ error: '없는 요청입니다.' }, 404);
    if (!(await verifyTeacher(request, env))) return json({ error: '교사 인증이 필요합니다.' }, 401);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json({ error: '요청이 너무 큽니다.' }, 413);
    let body;
    try { body = JSON.parse(raw || '{}'); } catch { return json({ error: 'JSON 형식이 아닙니다.' }, 400); }
    if (!MODES.has(body.mode)) return json({ error: '지원하지 않는 AI 기능입니다.' }, 400);
    if (!env.SOLAR_API_KEY) return json({ error: 'Solar API 키가 Worker에 설정되지 않았습니다.' }, 500);
    const activity = sanitizeActivity(body.activity || {});
    const response = await fetch('https://api.upstage.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.SOLAR_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: `${PROMPTS[body.mode]} 출력은 한국어 일반 텍스트로만 작성하고 Markdown 표·제목 기호는 사용하지 마세요.` },
          { role: 'user', content: JSON.stringify(activity) }
        ],
        max_tokens: 700,
        stream: false
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: data?.error?.message || 'Solar API 요청에 실패했습니다.' }, response.status >= 500 ? 502 : 400);
    return json({ result: data.choices?.[0]?.message?.content || 'AI 결과를 읽지 못했습니다.' });
  }
};
