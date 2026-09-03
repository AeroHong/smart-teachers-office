/**
 * 북마크(링크 미리보기) — 캔버스 편집기(CanvasEditor.jsx)에서 URL 하나로 Notion 스타일
 * 미리보기 카드를 만들 때 쓴다. 클라이언트가 임의 URL을 서버에 대신 가져오라고 시키는
 * 구조라(SSRF 위험), 사설 대역·루프백 호스트는 처음 요청과 리다이렉트 각 단계 모두에서
 * 막는다. og:title 등 메타 태그가 없거나 요청 자체가 실패해도 에러로 막지 않고 호스트명만
 * 담은 카드로 낮춰 돌려준다 — 프리뷰는 있으면 좋은 것이지 실패가 곧 기능 중단이면 안 된다.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https')

const REGION = 'asia-northeast3'

const PRIVATE_HOST_PATTERN =
  /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?fe80|\[?fc|\[?fd)/i

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
}

function pickFirst(html, patterns) {
  for (const re of patterns) {
    const m = re.exec(html)
    if (m && m[1]) return decodeEntities(m[1].trim())
  }
  return ''
}

function ogPatterns(prop) {
  return [
    new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:${prop}["']`, 'i'),
  ]
}

function extractMeta(html, baseUrl) {
  let title = pickFirst(html, ogPatterns('title'))
  if (!title) {
    const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html)
    title = m ? decodeEntities(m[1].trim()) : ''
  }
  let description = pickFirst(html, ogPatterns('description'))
  if (!description) {
    description = pickFirst(html, [
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
      /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
    ])
  }
  let image = pickFirst(html, ogPatterns('image'))
  if (image) {
    try { image = new URL(image, baseUrl).href } catch { image = '' }
  }
  const siteName = pickFirst(html, ogPatterns('site_name'))
  return { title, description, image, siteName }
}

function assertPublicHttpUrl(url) {
  if (!/^https?:$/.test(url.protocol)) {
    throw new HttpsError('invalid-argument', 'http/https 주소만 지원합니다.')
  }
  if (PRIVATE_HOST_PATTERN.test(url.hostname)) {
    throw new HttpsError('invalid-argument', '내부 주소는 미리보기를 지원하지 않습니다.')
  }
}

/** 리다이렉트를 직접 따라가며 매 단계 목적지를 검사한다 — fetch의 redirect:'follow'는
 *  중간에 사설망 주소로 튀어도 검사할 기회가 없다. */
async function fetchHtmlFollowingSafeRedirects(startUrl) {
  let current = startUrl
  for (let hop = 0; hop <= 3; hop++) {
    const res = await fetch(current.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SeonyooLinkPreview/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), current)
      assertPublicHttpUrl(next)
      current = next
      continue
    }
    return { res, finalUrl: current }
  }
  throw new Error('리다이렉트가 너무 많습니다.')
}

exports.fetchLinkPreview = onCall({ region: REGION, timeoutSeconds: 15 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.')

  const raw = String(request.data?.url || '').trim()
  if (!raw) throw new HttpsError('invalid-argument', 'url이 필요합니다.')

  let target
  try {
    target = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    throw new HttpsError('invalid-argument', '올바른 주소가 아닙니다.')
  }
  assertPublicHttpUrl(target)

  const fallback = { url: target.href, title: target.hostname, description: '', image: '', siteName: target.hostname }

  try {
    const { res, finalUrl } = await fetchHtmlFollowingSafeRedirects(target)
    const contentType = res.headers.get('content-type') || ''
    if (!res.ok || !contentType.includes('text/html')) {
      return { ...fallback, url: finalUrl.href, siteName: finalUrl.hostname }
    }
    const html = (await res.text()).slice(0, 300000)
    const meta = extractMeta(html, finalUrl.href)
    return {
      url: finalUrl.href,
      title: meta.title || finalUrl.hostname,
      description: meta.description || '',
      image: meta.image || '',
      siteName: meta.siteName || finalUrl.hostname,
    }
  } catch (err) {
    console.error('[fetchLinkPreview] failed', target.href, err.message)
    return fallback
  }
})
