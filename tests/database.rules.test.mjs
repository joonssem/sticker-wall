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
          title: '보안 담벼락', accessMode: 'members-v1', phase: 'writing',
          colorLocks: { 3: STUDENT_UID },
          posts: {}
        },
        'STICKER-PRIVATE': { title: '다른 보안 담벼락', accessMode: 'members-v1', phase: 'writing' }
      },
      roomInvites: { [secureRoom]: { joinCode: secureRoom, createdAt: 1 } },
      teacherRecords: { [secureRoom]: { participants: { [STUDENT_UID]: { attendance: '7', colorId: 3, joinedAt: 1 } } } }
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
  await assertSucceeds(get(ref(teacher, `teacherRecords/${secureRoom}/participants`)));
  await assertFails(get(ref(student, `teacherRecords/${secureRoom}/participants`)));

  await assertSucceeds(set(ref(student, `roomMembers/${secureRoom}/${STUDENT_UID}`), { joinCode: secureRoom, joinedAt: 2 }));
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

  // roomMembers 읽기는 교사 전용이므로 교사 컨텍스트로 확인합니다.
  const enrolledRoom = await get(ref(teacher, `roomMembers/${secureRoom}/${STUDENT_UID}`));
  assert.equal(enrolledRoom.val().joinCode, secureRoom);
  console.log('규칙 자동 테스트 통과: 17개 접근 제어 시나리오');
} finally {
  await env.cleanup();
}
