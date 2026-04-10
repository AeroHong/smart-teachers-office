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
