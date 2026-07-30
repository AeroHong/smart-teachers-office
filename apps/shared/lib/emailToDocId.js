// 이메일을 Firestore 문서 ID로 안전하게 변환 (. 와 @ 는 문서 ID에 그대로 쓸 수 없음)
export function emailToDocId(email) {
  return email.toLowerCase().replace(/\./g, '_').replace(/@/g, '__at__')
}
