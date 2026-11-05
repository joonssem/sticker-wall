import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, set, update } from 'firebase/database';

const TEACHER_UID = 'Z6WEsEFSTBbq6eeIF3E0RaBGoQZ2';
const STUDENT_UID = 'student-security-test-001';
const OTHER_STUDENT_UID = 'student-security-test-002';
const secureRoom = 'STICKER-SECURE';
const legacyRoom = 'STICKER-LEGACY';
const rules = await readFile(new URL('../database.rules.json', import.meta.url), 'utf8');

const env = await initializeTestEnvironment({
  projectId: 'demo-sticker-wall',
  database: { host: '127.0.0.1', port: 9000, rules }
});

try {
  await env.withSecurityRulesDisabled(async context => {
    await set(ref(context.database()), {
      rooms: {
        [legacyRoom]: { title: '기존 담벼락', phase: 'writing' },
        [secureRoom]: {
          title: '보안 담벼락', topic: '방학 경험', keyTerms: ['경험'], questionCoachEnabled: true, accessMode: 'members-v1', phase: 'writing',
          colorLocks: { 3: STUDENT_UID },
          posts: {}
        },
        'STICKER-PRIVATE': { title: '다른 보안 담벼락', accessMode: 'members-v1', phase: 'writing' }
      },
      roomInvites: { [secureRoom]: { joinCode: secureRoom, createdAt: 1 } }
    });
  });

  const teacher = env.authenticatedContext(TEACHER_UID).database();
  const student = env.authenticatedContext(STUDENT_UID).database();
  const otherStudent = env.authenticatedContext(OTHER_STUDENT_UID).database();
  const guest = env.unauthenticatedContext().database();

  await assertFails(get(ref(guest, `rooms/${legacyRoom}`)));
  // P0: accessMode 없는 레거시 담벼락도 참여코드 등록 없이는 접근할 수 없어야 함
  await assertFails(get(ref(student, `rooms/${legacyRoom}`)));
  await assertFails(set(ref(student, `roomMembers/${legacyRoom}/${STUDENT_UID}`), { joinCode: legacyRoom, joinedAt: 2 }));
  await assertSucceeds(get(ref(teacher, `rooms/${legacyRoom}`)));
  await assertFails(get(ref(student, `rooms/${secureRoom}`)));
  // 출석번호·참여 기록 노드는 더 이상 존재하지 않으며 교사도 앱 계정으로 쓸 수 없어야 함
  await assertFails(set(ref(student, `teacherRecords/${secureRoom}/participants/${STUDENT_UID}`), { attendance: '7', colorId: 3, joinedAt: 1 }));
  await assertFails(set(ref(teacher, `teacherRecords/${secureRoom}/participants/${STUDENT_UID}`), { attendance: '7', colorId: 3, joinedAt: 1 }));

  await assertSucceeds(set(ref(student, `roomMembers/${secureRoom}/${STUDENT_UID}`), { joinCode: secureRoom, joinedAt: 2 }));
  await assertSucceeds(get(ref(student, `roomMembers/${secureRoom}/${STUDENT_UID}`)));
  await assertFails(get(ref(otherStudent, `roomMembers/${secureRoom}/${STUDENT_UID}`)));
  await assertSucceeds(get(ref(student, `rooms/${secureRoom}`)));
  await assertFails(get(ref(otherStudent, `rooms/${secureRoom}`)));
  await assertFails(set(ref(otherStudent, `roomMembers/${secureRoom}/${OTHER_STUDENT_UID}`), { joinCode: 'WRONG-CODE', joinedAt: 2 }));

  const postId = 'student-post-1';
  await assertSucceeds(set(ref(student, `rooms/${secureRoom}/posts/${postId}`), {
    authorId: STUDENT_UID, authorColorId: 3, text: '방학 이야기를 적어요.', createdAt: 3
  }));
  await assertFails(set(ref(otherStudent, `rooms/${secureRoom}/posts/student-post-2`), {
    authorId: OTHER_STUDENT_UID, authorColorId: 4, text: '회원이 아닌 학생 글', createdAt: 3
  }));
  // P0: '수정' 버튼이 저장하는 {text, editedAt} 동시 쓰기가 실제로 허용되는지 확인
  // (editedAt에 권한 규칙이 없으면 update() 전체가 조용히 permission-denied 됨)
  await assertSucceeds(update(ref(student, `rooms/${secureRoom}/posts/${postId}`), {
    text: '수정된 이야기', editedAt: 3.5
  }));
  await assertFails(update(ref(otherStudent, `rooms/${secureRoom}/posts/${postId}`), {
    text: '남의 글 수정 시도', editedAt: 3.6
  }));
  await assertSucceeds(set(ref(teacher, `rooms/${secureRoom}/phase`), 'voting'));
  await assertFails(set(ref(student, `rooms/${secureRoom}/posts/student-post-3`), {
    authorId: STUDENT_UID, authorColorId: 3, text: '질문 시간의 새 글', createdAt: 4
  }));

  const questionId = 'student-question-1';
  await assertSucceeds(set(ref(student, `rooms/${secureRoom}/posts/${postId}/questions/${questionId}`), {
    authorId: STUDENT_UID, text: '가장 기억에 남은 순간은 언제인가요?', createdAt: 5
  }));
  const secondQuestionId = 'student-question-2';
  await assertSucceeds(set(ref(student, `rooms/${secureRoom}/posts/${postId}/questions/${secondQuestionId}`), {
    authorId: STUDENT_UID, text: '답을 들으면 무엇이 더 궁금해질까요?', createdAt: 5.1
  }));
  // 학생별 활동 기록(studentLearning, usageEvents)은 더 이상 허용하지 않음
  await assertFails(set(ref(student, `studentLearning/${secureRoom}/${STUDENT_UID}/questions/${questionId}`), {
    postId, helpUsed: 'starter', refineGoal: 'none', createdAt: 5
  }));
  await assertFails(set(ref(student, `usageEvents/${secureRoom}/${STUDENT_UID}/${postId}/starter-open`), { createdAt: 6 }));

  // 개인정보 패턴 차단 (전화번호·이메일). 일반 숫자·연도·수식은 허용.
  const blockedTexts = ['연락처는 010-1234-5678 입니다', '01012345678로 연락 주세요', '+82 10 1234 5678', '02-123-4567', 'abc.def@example.com', '메일은\nme@example.com'];
  for (const [index, text] of blockedTexts.entries()) {
    await assertFails(set(ref(student, `rooms/${secureRoom}/posts/${postId}/questions/pii-${index}`), { authorId: STUDENT_UID, text, createdAt: 5.2 }));
  }
  await assertFails(update(ref(student, `rooms/${secureRoom}/posts/${postId}`), { text: '메일은\nme@example.com', editedAt: 5.3 }));
  const allowedTexts = ['20101234567890 이라는 긴 숫자', '1592년에 임진왜란이 일어났어요', '3 + 4 = 7 이 맞나요?', '1234567 이라는 숫자', '2023-05-17에 있었던 일'];
  for (const [index, text] of allowedTexts.entries()) {
    await assertSucceeds(set(ref(student, `rooms/${secureRoom}/posts/${postId}/questions/ok-${index}`), { authorId: STUDENT_UID, text, createdAt: 5.2 }));
  }
  await assertSucceeds(set(ref(teacher, `rooms/${secureRoom}/posts/${postId}/questions/ok-0`), null));

  await assertSucceeds(update(ref(teacher, `rooms/${secureRoom}`), { phase: 'presenting', followupOpen: true }));
  await assertSucceeds(set(ref(student, `rooms/${secureRoom}/posts/${postId}/questions/${questionId}/followups/${STUDENT_UID}`), {
    text: '다음에는 빛의 세기도 비교하면 어떻게 될까요?', authorId: STUDENT_UID, createdAt: 7
  }));
  // 다시 보고 싶은 질문: 학생 uid가 아니라 질문 ID 아래에 저장, 질문 작성자와 교사만 읽기
  await assertSucceeds(set(ref(student, `reflections/${secureRoom}/${postId}/${questionId}`), {
    reason: '답을 듣고 다음 질문이 생겼기 때문입니다.', createdAt: 7
  }));
  await assertFails(set(ref(student, `reflections/${secureRoom}/${postId}/${questionId}`), { reason: '덮어쓰기 시도', createdAt: 7 }));
  await assertFails(set(ref(student, `reflections/${secureRoom}/${postId}/${secondQuestionId}`), {
    reason: '연락처 010-1234-5678', createdAt: 7
  }));
  await assertFails(set(ref(student, `reflections/${secureRoom}/${postId}/${secondQuestionId}`), {
    reason: '허용하지 않은 필드', createdAt: 7, postId
  }));
  await assertFails(set(ref(otherStudent, `reflections/${secureRoom}/${postId}/${secondQuestionId}`), {
    reason: '다른 학생 질문 선택 시도', createdAt: 7
  }));
  await assertSucceeds(get(ref(student, `reflections/${secureRoom}/${postId}/${questionId}`)));
  await assertFails(get(ref(otherStudent, `reflections/${secureRoom}/${postId}/${questionId}`)));
  await assertFails(get(ref(student, `reflections/${secureRoom}`)));
  await assertSucceeds(get(ref(teacher, `reflections/${secureRoom}`)));
  await assertFails(set(ref(otherStudent, `rooms/${secureRoom}/posts/${postId}/questions/${questionId}/followups/${OTHER_STUDENT_UID}`), {
    text: '다른 학생의 질문에 이어 쓰기', authorId: OTHER_STUDENT_UID, createdAt: 7
  }));
  await assertFails(set(ref(student, `rooms/${secureRoom}/posts/${postId}/questions/${secondQuestionId}/followups/${STUDENT_UID}`), {
    text: '허용하지 않은 필드가 있는 이어 쓰기', authorId: STUDENT_UID, createdAt: 7, score: 10
  }));
  await assertSucceeds(set(ref(teacher, `rooms/${secureRoom}/followupOpen`), false));
  await assertFails(set(ref(student, `rooms/${secureRoom}/posts/${postId}/questions/${secondQuestionId}/followups/${STUDENT_UID}`), {
    text: '닫힌 뒤 이어 쓰기', authorId: STUDENT_UID, createdAt: 8
  }));

  // 학생은 자신의 참여 정보만, 교사는 전체 참여 정보를 확인할 수 있습니다.
  const enrolledRoom = await get(ref(teacher, `roomMembers/${secureRoom}/${STUDENT_UID}`));
  assert.equal(enrolledRoom.val().joinCode, secureRoom);
  console.log('규칙 자동 테스트 통과: 출석번호·학생별 활동 기록 제거, 개인정보 패턴 차단, 익명 reflections 포함');
} finally {
  await env.cleanup();
}
