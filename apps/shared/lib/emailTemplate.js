/**
 * 이메일 발송 — 학교 브랜딩 래핑 템플릿.
 *
 * 요구사항 "텍스트만 입력해도 예쁘게" / "학교에서 보낸 메일임을 표시"를 AI 없이
 * 만족시키는 장치다. 교사가 쓰는 bodyHtml(내용만)은 그대로 두고, 발송 직전에 항상
 * 같은 틀(학교명 헤더 배너 · 흰 카드 본문 · 안내 푸터)로 감싼다.
 *
 * 발신 교사 이름은 헤더에 따로 표시하지 않는다("OOO 드림" 문구가 어색하다는 사용자
 * 피드백, 2026-09-15) — 실제 발신자는 이미 Gmail의 보낸사람 표시(From)에 학교명과
 * 함께 나타나므로 본문에서 중복 표기할 필요가 없다.
 *
 * 이메일 클라이언트는 flexbox/grid를 지원하지 않는 곳이 많아 <table> 기반 레이아웃 +
 * 인라인 스타일로만 작성한다. Cloud Functions(functions/emailSend.js)는 별도 npm
 * 패키지라 이 파일을 import할 수 없어 손으로 복제해 쓴다 — 이 템플릿을 고치면
 * functions/emailSend.js의 buildEmailHtml()도 반드시 함께 고쳐야 한다.
 */

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildEmailHtml(schoolName, bodyHtml) {
  const school = escapeHtml(schoolName || '')

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
          style="max-width:100%;background:#ffffff;border-radius:8px;overflow:hidden;font-family:'Malgun Gothic','맑은 고딕',sans-serif;">
          <tr>
            <td style="background:#1e293b;color:#ffffff;padding:20px 28px;">
              <div style="font-size:18px;font-weight:700;">${school}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:15px;line-height:1.7;color:#1f2937;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#f8fafc;color:#94a3b8;font-size:11px;">
              본 메일은 ${school}에서 발송되었습니다.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
