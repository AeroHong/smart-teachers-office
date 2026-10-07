/**
 * Workspace 동기화가 기존 학생 문서에 쓸 값 — Firestore에 의존하지 않는 순수 함수(테스트 대상).
 *
 * 학적의 기준은 StudentHub다(2026-10). 같은 학년도 안의 반 변경·번호 조정은 StudentHub가
 * 학생 문서에 직접 쓰고, 동기화는 그것을 되돌리지 않는다. 학년·반·번호(=학번)는
 * 계정 이메일의 연도가 문서보다 새로울 때만 — 즉 학년도 전환(진급·반편성)으로 관리자가
 * 계정 이메일을 바꿨을 때만 — 이메일 학번을 따른다.
 *
 * @param {object} existing 기존 students 문서
 * @param {{ workspaceUserId: string, studentId: string, fullStudentId: string, email: string,
 *           name: string, year: number, grade: number, classNo: number, number: number }} incoming
 * @returns {{ data: object, changed: boolean }} data는 updatedAt 없이 merge로 쓸 필드
 */
function mergeSyncedStudent(existing, incoming) {
  const { workspaceUserId, email, name, year } = incoming

  // 이메일 이력 업데이트 (진급으로 이메일이 바뀐 경우)
  const emailHistory = [...(existing.emailHistory || [{ email: existing.email, year: existing.year }])]
  const lastHistory = emailHistory[emailHistory.length - 1]
  if (lastHistory.email !== email) {
    emailHistory.push({ email, year })
  }

  // 이름은 관리자가 수동으로 고칠 수 있음 — 그 경우 동기화가 되돌리지 않도록 제외
  const syncedName = existing.nameEditedManually ? existing.name : name

  // admissionYear는 첫 등록 시 설정되고 이후 불변
  const admissionYear = existing.admissionYear || existing.year || year

  // 학년도 전환일 때만 배치(학년·반·번호)를 이메일 학번으로 — 그 밖에는 StudentHub 값 유지
  const newYear = !existing.year || year > Number(existing.year)
  const placement = newYear
    ? {
        studentId: incoming.studentId,
        fullStudentId: incoming.fullStudentId,
        grade: incoming.grade,
        class: incoming.classNo,
        number: incoming.number,
        year,
      }
    : {}

  const data = {
    workspaceUserId,
    email,
    name: syncedName,
    admissionYear,
    emailHistory,
    source: 'workspaceSync',
    ...placement,
  }

  const changed = ['workspaceUserId', 'email', 'name', ...Object.keys(placement)]
    .some(k => existing[k] !== data[k]) ||
    JSON.stringify(existing.emailHistory) !== JSON.stringify(emailHistory)

  return { data, changed }
}

module.exports = { mergeSyncedStudent }
