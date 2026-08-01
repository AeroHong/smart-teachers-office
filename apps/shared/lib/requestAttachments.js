/**
 * 업무 요청 첨부 파일.
 *
 * 학교에서 배포하는 양식은 한글(.hwp)이 주력이고 그다음이 엑셀이다. 그래서 링크만으로는
 * 부족하고 실제 업로드가 필요하다. "첨부파일이 지워졌어요"·"양식 다시 주세요"가 사라지는
 * 것이 이 기능의 목적이므로, 파일은 메시지가 아니라 요청 문서에 계속 붙어 있어야 한다.
 *
 * 저장 경로: schools/{schoolId}/requests/{requestId}/{timestamp}_{파일명}
 *
 * 주의 — getDownloadURL이 주는 토큰 URL은 Storage 보안 규칙을 우회한다. 링크를 가진
 * 사람은 로그인 없이도 열 수 있으므로 고사 원안처럼 민감한 파일은 올리지 않는다.
 * (storage.rules 상단 주석에도 같은 내용을 적어뒀다)
 */
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from './firebase'

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

/** 본문에 끼워 넣는 이미지. 첨부 목록에는 안 뜨고 글 안에 그림으로 들어간다. */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']

export function isImageFile(file) {
  if (file?.type?.startsWith('image/')) return true
  const ext = (file?.name || '').split('.').pop()?.toLowerCase() || ''
  return IMAGE_EXTENSIONS.includes(ext)
}

/** 확장자별 표시용 아이콘. 한글 파일이 주력이라 눈에 바로 띄게 구분한다. */
export function fileKind(name = '') {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['hwp', 'hwpx'].includes(ext)) return { label: '한글', emoji: '📄' }
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { label: '엑셀', emoji: '📊' }
  if (['doc', 'docx'].includes(ext)) return { label: '워드', emoji: '📝' }
  if (['ppt', 'pptx'].includes(ext)) return { label: '슬라이드', emoji: '📽️' }
  if (ext === 'pdf') return { label: 'PDF', emoji: '📕' }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return { label: '이미지', emoji: '🖼️' }
  return { label: ext.toUpperCase() || '파일', emoji: '📎' }
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

/**
 * 파일명에서 저장 경로로 못 쓰는 문자를 정리한다.
 * 한글은 그대로 둔다 — 선생님들이 받았을 때 원래 이름이 보여야 한다.
 */
function safeFileName(name = '') {
  return name.replace(/[/\\?%*:|"<>#]/g, '_').slice(0, 120) || 'file'
}

/**
 * 파일 한 개 업로드.
 * @returns {Promise<{name, size, path, url, uploadedAt}>} 요청 문서 attachments에 넣을 항목
 */
export async function uploadAttachment({ schoolId, requestId, file }) {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`파일이 너무 큽니다. ${formatBytes(MAX_ATTACHMENT_BYTES)}까지 올릴 수 있습니다.`)
  }

  // 같은 이름을 여러 번 올려도 덮어쓰지 않도록 시각을 앞에 붙인다
  const path = `schools/${schoolId}/requests/${requestId}/${Date.now()}_${safeFileName(file.name)}`
  const objectRef = ref(storage, path)

  // 본문에 끼우는 이미지에는 Content-Disposition을 붙이지 않는다. attachment가 걸리면
  // 브라우저가 <img>로 그리지 않고 내려받으려 해서 글 안에서 그림이 안 보인다.
  // 한글·엑셀 첨부는 반대로 원래 이름 그대로 내려받아야 하므로 그때만 붙인다.
  const metadata = { contentType: file.type || 'application/octet-stream' }
  if (!isImageFile(file)) {
    metadata.contentDisposition = `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`
  }

  await uploadBytes(objectRef, file, metadata)

  return {
    name: file.name,
    size: file.size,
    path,
    url: await getDownloadURL(objectRef),
    uploadedAt: Date.now(),
  }
}

/** 첨부 삭제. 이미 지워진 파일은 조용히 넘어간다 (문서에서 빼는 게 목적이므로). */
export async function deleteAttachment(attachment) {
  if (!attachment?.path) return
  try {
    await deleteObject(ref(storage, attachment.path))
  } catch (e) {
    if (e?.code !== 'storage/object-not-found') throw e
  }
}
