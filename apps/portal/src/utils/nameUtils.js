/**
 * 구글 계정의 displayName에서 학교 직책/부서명을 제거하고 실제 이름만 반환
 * 예) "교사 홍창기" → "홍창기"
 *     "교무부장홍창기" → "홍창기"
 *     "홍창기 교사" → "홍창기"
 */

// 긴 것부터 먼저 매칭해야 부분 일치 방지 (교무부장 > 교무)
const ROLE_KEYWORDS = [
  '수석교사', '부장교사', '교무부장', '진로부장', '생활부장',
  '학년부장', '연구부장', '정보부장', '체육부장', '과학부장',
  '인문부장', '수학부장', '영어부장', '국어부장', '예체능부장',
  '교장', '교감', '수석', '교무', '교사',
]

export function cleanTeacherName(raw) {
  if (!raw) return raw
  let name = raw.trim()

  for (const kw of ROLE_KEYWORDS) {
    // 접두사 (공백 있거나 없거나)
    if (name.startsWith(kw)) {
      const after = name.slice(kw.length).trimStart()
      if (after) { name = after; break }
    }
    // 접미사 (공백 있거나 없거나)
    if (name.endsWith(kw)) {
      const before = name.slice(0, -kw.length).trimEnd()
      if (before) { name = before; break }
    }
  }

  return name || raw
}
