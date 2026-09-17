/**
 * 북마크(링크 미리보기) — 캔버스 편집기(CanvasEditor.jsx)에서 URL 하나로 Notion 스타일
 * 미리보기 카드를 만들 때 쓴다.
 *
 * 처음엔 og:image 메타 태그만 긁어 썼는데, og:image가 없거나(예: 학교 홈페이지) 작은
 * 로고 하나뿐인 사이트가 많아(예: 네이버 — 초록 사각형 로고만 나옴) "이게 무슨 링크인지"
 * 알아보기 어려웠다(사용자 피드백, 2026-09-03: "실제 웹페이지의 일부 모습을 우측에
 * 보여주는 방식이 좋겠다"). 그래서 헤드리스 브라우저(Puppeteer, generateAsaChecklistPdf가
 * 이미 쓰는 것과 같은 패키지)로 실제 페이지를 열어 화면을 찍어 썸네일로 쓴다. 제목·설명도
 * og 태그 대신 로딩이 끝난 실제 DOM에서 읽는다 — 자바스크립트로 내용을 그리는 사이트도
 * 정확히 잡힌다.
 *
 * 클라이언트가 임의 URL을 서버에 대신 열어보라고 시키는 구조라(SSRF 위험), 사설
 * 대역·루프백 호스트는 처음 주소와 페이지가 불러오는 모든 하위 요청(리다이렉트 포함)
 * 각각에서 막는다(page.setRequestInterception). 스크린샷이 실패해도(느린 사이트·차단·
 * 시간초과) 에러로 막지 않고 호스트명만 담은 카드로 낮춰 돌려준다 — 프리뷰는 있으면
 * 좋은 것이지 실패가 곧 기능 중단이면 안 된다.
 *
 * puppeteer(전체 버전)가 아니라 puppeteer-core + @sparticuz/chromium을 쓴다 — 일반
 * puppeteer는 설치 시 크로미움을 따로 내려받는데, 이 배포 환경(Cloud Functions
 * 빌드)에서는 그 내려받은 실행 파일이 최종 배포물에 실리지 않아 "Could not find
 * Chrome" 오류로 매번 실패했다(실제 배포해서 확인, 2026-09-03). @sparticuz/chromium은
 * 서버리스 환경(Lambda·Cloud Functions/Run)용으로 실행 파일을 패키지 안에 그대로
 * 담아 배포하므로 이 문제가 없다.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { getStorage } = require('firebase-admin/storage')
const chromium = require('@sparticuz/chromium').default
const puppeteer = require('puppeteer-core')
const crypto = require('crypto')

const REGION = 'asia-northeast3'

const PRIVATE_HOST_PATTERN =
  /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?fe80|\[?fc|\[?fd)/i

function isDisallowedUrl(urlString) {
  let u
  try { u = new URL(urlString) } catch { return true }
  return !/^https?:$/.test(u.protocol) || PRIVATE_HOST_PATTERN.test(u.hostname)
}

/**
 * 페이지를 열어 제목·설명·미리보기 이미지·화면 스크린샷을 한 번에 얻는다.
 *
 * schoolId는 스크린샷을 올릴 Storage 경로를 가른다(다른 첨부 파일들과 같은
 * schools/{schoolId}/... 규칙, requestAttachments.js 참고). 실패하면 null을 돌려주고
 * 호출부가 호스트명만으로 카드를 만든다.
 */
async function captureLinkPreview(url, schoolId) {
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: chromium.headless ?? true,
  })
  try {
    const page = await browser.newPage()
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      if (isDisallowedUrl(req.url())) req.abort()
      else req.continue()
    })
    await page.setViewport({ width: 1000, height: 640 })
    // 'networkidle2'(연결 2개 이하로 500ms 유지)로 기다리면 구글 문서·Slack처럼 실시간
    // 협업용 웹소켓/폴링을 계속 띄워 두는 페이지에서는 그 연결이 절대 안 끊겨 거의 매번
    // 타임아웃 근처까지 기다리게 된다(사용자 신고, 2026-09-17 — "북마크 새로고침이
    // 시간이 많이 걸리네"). 제목·설명은 대개 초기 HTML 파싱 직후 바로 자리를 잡으므로
    // DOM만 준비되면 충분하다 — 뒤이어 오는 배경 통신까지 기다리지 않는다. 클라이언트
    // 스크립트가 늦게 제목을 바꿔 다는 사이트를 위해 스크린샷 찍기 전 짧게만 더 쉰다.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await new Promise(resolve => setTimeout(resolve, 700))

    const dom = await page.evaluate(() => {
      const content = (sel) => document.querySelector(sel)?.getAttribute('content') || ''
      return {
        title: content('meta[property="og:title"]') || document.title || '',
        description: content('meta[property="og:description"]') || content('meta[name="description"]') || '',
        image: content('meta[property="og:image"]') || '',
        siteName: content('meta[property="og:site_name"]') || '',
      }
    })
    const finalUrl = page.url()
    if (dom.image) {
      try { dom.image = new URL(dom.image, finalUrl).href } catch { dom.image = '' }
      if (dom.image && isDisallowedUrl(dom.image)) dom.image = ''
    }

    const screenshot = await page.screenshot({ type: 'jpeg', quality: 60 })
    const token = crypto.randomUUID()
    const path = `schools/${schoolId}/linkPreviews/${Date.now()}_${crypto.randomBytes(6).toString('hex')}.jpg`
    const bucket = getStorage().bucket()
    const file = bucket.file(path)
    await file.save(screenshot, {
      metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: token } },
    })
    const shotUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`

    return {
      url: finalUrl,
      title: dom.title || new URL(finalUrl).hostname,
      description: dom.description,
      image: shotUrl || dom.image,
      siteName: dom.siteName || new URL(finalUrl).hostname,
    }
  } finally {
    await browser.close().catch(() => {})
  }
}

exports.fetchLinkPreview = onCall({ region: REGION, timeoutSeconds: 60, memory: '1GiB' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')

  const raw = String(request.data?.url || '').trim()
  const schoolId = String(request.data?.schoolId || '').trim()
  if (!raw) throw new HttpsError('invalid-argument', 'url이 필요합니다.')
  if (!schoolId) throw new HttpsError('invalid-argument', 'schoolId가 필요합니다.')

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  if (isDisallowedUrl(withScheme)) {
    throw new HttpsError('invalid-argument', 'http/https 주소만 지원하며, 내부 주소는 미리보기를 지원하지 않습니다.')
  }

  try {
    return await captureLinkPreview(withScheme, schoolId)
  } catch (err) {
    console.error('[fetchLinkPreview] capture failed', withScheme, err.message)
    const hostname = new URL(withScheme).hostname
    return { url: withScheme, title: hostname, description: '', image: '', siteName: hostname }
  }
})
