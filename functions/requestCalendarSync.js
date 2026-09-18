// 채널 업무 글(요청)의 마감일을 학사일정에 자동 반영한다.
//
// academicCalendar는 firestore.rules상 isSchoolAdmin()만 write 가능하다(일반 교사는
// 직접 못 쓴다) — evaluationPlanSync.js·userClaims.js와 같은 컨벤션으로, 이 서버 트리거가
// Admin SDK로 규칙을 우회해 반영한다.
//
// requests 문서는 PostComposer.jsx(생성·수정)·channelActions.js(복제·참여자 갱신 등)
// 여러 클라이언트 경로에서 직접 쓰인다 — 진입점마다 따로 반영하는 대신, 이 트리거 하나가
// "지금 이 요청 문서가 어떤 상태인가"만 보고 academicCalendar를 그 상태에 맞게 만든다.
//
// 미러 문서 ID를 요청 ID로 고정(`req_{requestId}`)해 조회 없이 upsert/delete할 수 있게 한다.
const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

exports.syncRequestToCalendar = onDocumentWritten(
  { document: 'schools/{schoolId}/requests/{requestId}', region: 'asia-northeast3' },
  async (event) => {
    const { schoolId, requestId } = event.params
    const after = event.data?.after?.exists ? event.data.after.data() : null
    const db = getFirestore()
    const mirrorRef = db.doc(`schools/${schoolId}/academicCalendar/req_${requestId}`)

    // 삭제됐거나, 안내글(kind:'notice', 마감 개념이 없음)이거나, 마감일을 지운 경우 —
    // 학사일정에 있을 이유가 없으니 미러 문서를 지운다(원래 없었으면 조용히 넘어간다).
    const isRequestWithDueDate = after && (after.kind || 'request') === 'request' && after.dueDate
    if (!isRequestWithDueDate) {
      await mirrorRef.delete().catch(() => {})
      return
    }

    // 학사일정에서 이 항목이 어느 채널 것인지 보여주려고 채널명을 스냅샷으로 같이
    // 둔다(targetNames·createdByName과 같은 방식 — 나중에 채널이 지워지거나 이름이
    // 바뀌어도 이 시점 이름이 남는다). 채널 문서를 못 찾으면 이름 없이 진행한다.
    const channelSnap = after.channelId
      ? await db.doc(`schools/${schoolId}/channels/${after.channelId}`).get()
      : null
    const channel = channelSnap?.exists ? channelSnap.data() : null

    // DM(1:1·그룹·나와의 대화) 캔버스는 학사일정에 올리지 않는다(2026-09-18). DM 캔버스는
    // "관리자도 못 본다"로 정한 영역인데, 학사일정은 교직원 전체가 목록으로 구독한다 —
    // 아래 visibleToUids로 대상자에게만 보이게 하려 했지만, 규칙의 "visibleToUids가 없으면
    // 누구나" 조건이 목록 조회에서는 늘 참으로 평가돼 보호가 되지 않는다(에뮬레이터 실측:
    // 단건 조회는 거부, 목록 조회는 개인 할 일 제목까지 내려감). '나와의 대화'를 개인 할 일
    // 목록으로 쓰는 선생님이 있어, 마감일을 단 개인 일정이 전교 학사일정에 뜨고 있었다.
    // 1:1 DM의 ID는 dm_{uid}_{uid}라 채널 문서가 지워졌어도 알아볼 수 있다.
    if (channel?.type === 'dm' || (!channel && after.channelId?.startsWith('dm_'))) {
      await mirrorRef.delete().catch(() => {})
      return
    }
    const channelName = channel?.name || ''

    // 마감(status:'closed')돼도 지우지 않고 closed만 반영한다 — 캘린더에서 취소선으로
    // "끝난 일"임을 보여주기 위함(학사일정에서 완전히 사라지면 언제 마감이었는지 못 본다).
    await mirrorRef.set({
      title: after.title || '(제목 없음)',
      type: '업무',
      date: after.dueDate,
      endDate: null,
      source: 'request',
      requestId,
      channelId: after.channelId || '',
      channelName,
      visibleToUids: after.targetUids || [],
      closed: after.status === 'closed',
      updatedAt: FieldValue.serverTimestamp(),
    })
  },
)
