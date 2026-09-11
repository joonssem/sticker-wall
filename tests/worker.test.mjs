import assert from 'node:assert/strict';
import {
  PROMPTS,
  REFINE_PROMPT,
  enforceStudentLimit,
  parseRefineResult,
  sanitizeNodeId,
  sanitizeRefineInput,
  sanitizeRoomId
} from '../cloudflare-worker/worker.js';

assert.match(REFINE_PROMPT, /완성 질문/);
assert.match(REFINE_PROMPT, /___ 빈칸/);
assert.match(PROMPTS.guide, /테스트, 배포, 삭제, 코드, 기능 점검/);

assert.equal(sanitizeRoomId('sticker-ab12'), 'STICKER-AB12');
assert.equal(sanitizeRoomId('wrong-room'), '');
assert.equal(sanitizeNodeId('post-123'), 'post-123');
assert.equal(sanitizeNodeId('bad/post'), '');

const input = sanitizeRefineInput({
  goal: 'clarify',
  question: '왜 식물이 안 자라요?',
  context: { postText: '클라이언트가 보낸 문장은 사용하지 않음' }
}, {
  title: '과학 발표',
  topic: '식물의 성장',
  keyTerms: ['햇빛', '물'],
  postText: '창가와 서랍 속 강낭콩의 자람을 관찰했습니다.'
});

assert.deepEqual(input, {
  goal: 'clarify',
  question: '왜 식물이 안 자라요?',
  context: {
    title: '과학 발표',
    topic: '식물의 성장',
    keyTerms: ['햇빛', '물'],
    postText: '창가와 서랍 속 강낭콩의 자람을 관찰했습니다.'
  }
});
assert.equal(sanitizeRefineInput({ goal: 'score', question: '질문' }, {}), null);
assert.equal(sanitizeRefineInput({ goal: 'clarify', question: '' }, {}), null);

assert.deepEqual(parseRefineResult('{"observation":"이유를 궁금해하고 있어요.","hint":"대상과 장소를 떠올려 보세요.","example":"어떤 장소에서 관찰했나요?","alreadyClear":false}'), {
  observation: '이유를 궁금해하고 있어요.',
  hint: '대상과 장소를 떠올려 보세요.',
  example: '어떤 장소에서 관찰했나요?',
  alreadyClear: false
});
assert.equal(parseRefineResult('JSON이 아닌 답변'), null);
assert.equal(parseRefineResult('{"observation":"관찰","hint":""}'), null);

assert.equal((await enforceStudentLimit({}, 'room:student')).status, 503);
assert.equal(await enforceStudentLimit({
  AI_BURST_LIMITER: { limit: async () => ({ success: true }) },
  AI_ROOM_LIMITER: { limit: async () => ({ success: true }) }
}, 'room:student'), null);
assert.equal((await enforceStudentLimit({
  AI_BURST_LIMITER: { limit: async () => ({ success: false }) },
  AI_ROOM_LIMITER: { limit: async () => ({ success: true }) }
}, 'room:student')).status, 429);

console.log('Worker 질문 다듬기 입력·응답 검증 통과');
