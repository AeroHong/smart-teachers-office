const { initializeApp } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { setGlobalOptions } = require('firebase-functions/v2')

initializeApp()
setGlobalOptions({ region: 'asia-northeast3', maxInstances: 10 })

/**
 * 5분마다 실행 — 종료 시간이 지난 이벤트의 미출석 학생을 자동 결석 처리
 *
 * 처리 조건:
 *  - 단일 이벤트: endTime 경과
 *  - 반복 이벤트: 오늘이 반복 요일 + 오늘 recurringTimeEnd 경과 + recurringEndDate 이내
 *
 * 중복 방지: attendLogId / absentLogId 가 이미 존재하면 skip
 * liveOpenedAt 이 설정된 이벤트는 autoManageLiveSessions 에서 처리하므로 skip
 */
exports.autoCloseAttendance = onSchedule(
  { schedule: 'every 5 minutes', region: 'asia-northeast3' },
  async () => {
    const db = getFirestore()
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)   // "2026-04-08"
    const todayDay = now.getDay()                      // 0=일 ... 6=토

    const schoolsSnap = await db.collection('schools').get()

    for (const schoolDoc of schoolsSnap.docs) {
      const schoolId = schoolDoc.id
      const eventsSnap = await db
        .collection('schools').doc(schoolId)
        .collection('events').get()

      for (const eventDoc of eventsSnap.docs) {
        const ev = eventDoc.data()

        // 보관함 이벤트 / 그룹 없는 이벤트 제외
        if (ev.archived) continue
        if (!ev.studentGroupId) continue

        // 라이브 세션이 열린 이벤트는 autoManageLiveSessions 에서 처리
        if (ev.liveOpenedAt) continue

        // ── 종료 여부 판단 ──────────────────────────────────────
        let isEnded = false
        let logDatePrefix = null   // 반복 이벤트는 날짜 prefix 사용

        if (ev.isRecurring) {
          // 오늘이 반복 요일인지
          if (!ev.recurringDays?.includes(todayDay)) continue

          // 반복 종료일 지났는지
          const recurEnd = ev.recurringEndDate?.toDate?.() ?? new Date(ev.recurringEndDate)
          if (now > recurEnd) continue

          // 오늘 종료 시간 지났는지
          const [endH, endM] = ev.recurringTimeEnd.split(':').map(Number)
          const todayEnd = new Date(now)
          todayEnd.setHours(endH, endM, 0, 0)

          if (now > todayEnd) {
            isEnded = true
            logDatePrefix = todayStr
          }
        } else {
          const end = ev.endTime?.toDate?.() ?? new Date(ev.endTime)
          if (now > end) isEnded = true
        }

        if (!isEnded) continue

        // ── 학생 그룹 로드 ─────────────────────────────────────
        const groupDoc = await db
          .collection('schools').doc(schoolId)
          .collection('studentGroups').doc(ev.studentGroupId).get()
        if (!groupDoc.exists) continue

        const { studentIds } = groupDoc.data()
        if (!studentIds?.length) continue

        // ── 기존 출결 로그 조회 ────────────────────────────────
        const logsSnap = await db
          .collection('schools').doc(schoolId)
          .collection('events').doc(eventDoc.id)
          .collection('attendanceLogs').get()
        const existingIds = new Set(logsSnap.docs.map(d => d.id))

        // ── 학생 정보 맵 ───────────────────────────────────────
        const studentsSnap = await db
          .collection('schools').doc(schoolId)
          .collection('students').get()
        const studentsMap = {}
        studentsSnap.docs.forEach(d => {
          studentsMap[d.data().studentId] = d.data()
        })

        // ── 미출석자 일괄 결석 처리 ────────────────────────────
        const batch = db.batch()
        let count = 0

        for (const studentId of studentIds) {
          const attendLogId = logDatePrefix
            ? `${logDatePrefix}-${studentId}`
            : studentId
          const absentLogId = logDatePrefix
            ? `${logDatePrefix}-${studentId}-absent`
            : `${studentId}-absent`

          // 이미 출석 or 결석 로그가 있으면 skip
          if (existingIds.has(attendLogId) || existingIds.has(absentLogId)) continue

          const student = studentsMap[studentId]
          if (!student) continue

          const ref = db
            .collection('schools').doc(schoolId)
            .collection('events').doc(eventDoc.id)
            .collection('attendanceLogs').doc(absentLogId)

          batch.set(ref, {
            studentId,
            studentName: student.name,
            grade: student.grade,
            class: student.class,
            number: student.number,
            method: 'absent',
            reason: '미출석 자동처리',
            recordedAt: Timestamp.now(),
            qrToken: ev.qrToken,
          })
          count++
        }

        if (count > 0) {
          await batch.commit()
          console.log(
            `[${schoolId}] 자동결석 ${count}명 처리 — 이벤트: ${eventDoc.id}` +
            (logDatePrefix ? ` (${logDatePrefix})` : '')
          )
        }
      }
    }
  }
)

/**
 * 1분마다 실행 — 라이브 세션 자동 관리
 *
 * liveLateCutoff 도달 시:
 *   - liveToken null (QR 마감)
 *   - lateWindowProcessed: true
 *   - 미출석 학생 → absent 로그 생성 (reason: '1/3 이상 지각 자동처리')
 *
 * liveClosesAt 도달 시:
 *   - 미복귀 외출 자동 마감 (returnAt 기록, 1/3 초과 시 outingOverLimit 기록)
 *   - 세션 필드 전체 초기화 (liveToken, liveOpenedAt, liveLateCutoff, liveClosesAt, lateWindowProcessed)
 */
exports.autoManageLiveSessions = onSchedule(
  { schedule: 'every 1 minutes', region: 'asia-northeast3' },
  async () => {
    const db = getFirestore()
    const now = new Date()

    const schoolsSnap = await db.collection('schools').get()

    for (const schoolDoc of schoolsSnap.docs) {
      const schoolId = schoolDoc.id
      const eventsSnap = await db
        .collection('schools').doc(schoolId)
        .collection('events').get()

      for (const eventDoc of eventsSnap.docs) {
        const ev = eventDoc.data()
        if (ev.archived || !ev.liveOpenedAt) continue

        const liveLateCutoff = ev.liveLateCutoff?.toDate?.()
        const liveClosesAt = ev.liveClosesAt?.toDate?.()

        // 1/3 지점 자동 처리 (미처리 + 시간 경과)
        if (!ev.lateWindowProcessed && liveLateCutoff && now >= liveLateCutoff) {
          await processLateCutoff(db, schoolId, eventDoc.id, ev)
        }

        // 수업 종료 처리
        if (liveClosesAt && now >= liveClosesAt) {
          await processSessionClose(db, schoolId, eventDoc.id, ev)
        }
      }
    }
  }
)

// ── 1/3 지점 자동 처리 ────────────────────────────────────────────────────────
async function processLateCutoff(db, schoolId, eventId, ev) {
  console.log(`[${schoolId}] 1/3 자동처리 시작 — 이벤트: ${eventId}`)

  // QR 마감 + 1/3 처리 완료 표시
  await db.collection('schools').doc(schoolId)
    .collection('events').doc(eventId)
    .update({ liveToken: null, lateWindowProcessed: true })

  if (!ev.studentGroupId) return

  // 학생 그룹 조회
  const groupDoc = await db.collection('schools').doc(schoolId)
    .collection('studentGroups').doc(ev.studentGroupId).get()
  if (!groupDoc.exists) return

  const { studentIds } = groupDoc.data()
  if (!studentIds?.length) return

  // 현재 출결 로그 조회
  const logsSnap = await db.collection('schools').doc(schoolId)
    .collection('events').doc(eventId)
    .collection('attendanceLogs').get()

  const existingIds = new Set(logsSnap.docs.map(d => d.id))
  const checkedStudentIds = new Set(
    logsSnap.docs
      .filter(d => d.data().method === 'QR' || d.data().method === 'manual')
      .map(d => d.data().studentId)
  )

  // 학생 정보 맵
  const studentsSnap = await db.collection('schools').doc(schoolId)
    .collection('students').get()
  const studentsMap = {}
  studentsSnap.docs.forEach(d => {
    studentsMap[d.data().studentId] = d.data()
  })

  // 반복 이벤트는 오늘 날짜 prefix 사용
  const todayStr = new Date().toISOString().slice(0, 10)
  const isRecurring = ev.isRecurring || false

  const batch = db.batch()
  let count = 0

  for (const studentId of studentIds) {
    if (checkedStudentIds.has(studentId)) continue

    const attendLogId = isRecurring ? `${todayStr}-${studentId}` : studentId
    const absentLogId = isRecurring ? `${todayStr}-${studentId}-absent` : `${studentId}-absent`

    if (existingIds.has(attendLogId) || existingIds.has(absentLogId)) continue

    const student = studentsMap[studentId]
    if (!student) continue

    const ref = db.collection('schools').doc(schoolId)
      .collection('events').doc(eventId)
      .collection('attendanceLogs').doc(absentLogId)

    batch.set(ref, {
      studentId,
      studentName: student.name,
      grade: student.grade,
      class: student.class,
      number: student.number,
      method: 'absent',
      reason: '1/3 이상 지각 자동처리',
      recordedAt: Timestamp.now(),
      qrToken: ev.qrToken,
      lateAutoProcessed: true,
    })
    count++
  }

  if (count > 0) {
    await batch.commit()
    console.log(`[${schoolId}] 1/3 지각 자동결석 ${count}명 처리 — 이벤트: ${eventId}`)
  }
}

// ── 수업 종료 처리 ────────────────────────────────────────────────────────────
async function processSessionClose(db, schoolId, eventId, ev) {
  console.log(`[${schoolId}] 세션 종료 처리 시작 — 이벤트: ${eventId}`)

  const closeAt = Timestamp.now()
  const closeDate = closeAt.toDate()
  const classDuration = ev.classDuration || 50

  // 미복귀 외출 자동 마감
  const logsSnap = await db.collection('schools').doc(schoolId)
    .collection('events').doc(eventId)
    .collection('attendanceLogs').get()

  const batch = db.batch()

  for (const logDoc of logsSnap.docs) {
    const logData = logDoc.data()
    if (logData.method !== 'QR' && logData.method !== 'manual') continue
    if (!logData.outings?.length) continue

    const hasOpenOuting = logData.outings.some(o => !o.returnAt)
    if (!hasOpenOuting) continue

    const updatedOutings = logData.outings.map(o => {
      if (o.returnAt) return o
      return { ...o, returnAt: closeAt }
    })

    // 1/3 초과 여부 계산
    const totalMs = updatedOutings.reduce((sum, o) => {
      const exit = o.exitAt?.toDate?.() ?? new Date(o.exitAt)
      const ret = o.returnAt?.toDate?.() ?? closeDate
      return sum + Math.max(0, ret - exit)
    }, 0)
    const isOver = totalMs > classDuration * 60000 / 3

    const updateData = { outings: updatedOutings }
    if (isOver && !logData.outingOverLimit) {
      updateData.outingOverLimit = true
      updateData.outingWarnedAt = closeAt
    }

    batch.update(logDoc.ref, updateData)
  }

  await batch.commit()

  // 세션 필드 전체 초기화
  await db.collection('schools').doc(schoolId)
    .collection('events').doc(eventId)
    .update({
      liveToken: null,
      liveOpenedAt: null,
      liveLateCutoff: null,
      liveClosesAt: null,
      lateWindowProcessed: null,
    })

  console.log(`[${schoolId}] 세션 종료 완료 — 이벤트: ${eventId}`)
}
