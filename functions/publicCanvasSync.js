// 캔버스 공개 링크 사본 동기화 (apps/shared/lib/publicCanvas.js 참고).
//
// 원본 글(requests)의 publicShare.token이 있으면 publicCanvases/{token}에 "보여줄 것만"
// 담은 사본을 만든다(제목·본문·표지·자료·글쓴이 이름). 대상자 명단·완료 기록 같은 교내
// 정보는 옮기지 않는다. 토큰이 바뀌거나 꺼지거나 글이 지워지면 옛 사본을 지워 링크를 막는다.
//
// publicCanvases는 firestore.rules상 클라이언트 쓰기가 전면 금지라 이 트리거만 쓴다 —
// 그래서 공개 페이지에 무엇이 나가는지는 여기 필드 목록이 전부다.
const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

exports.syncPublicCanvas = onDocumentWritten(
  { document: 'schools/{schoolId}/requests/{requestId}', region: 'asia-northeast3' },
  async (event) => {
    const { schoolId, requestId } = event.params
    const before = event.data?.before?.exists ? event.data.before.data() : null
    const after = event.data?.after?.exists ? event.data.after.data() : null
    const db = getFirestore()

    const oldToken = before?.publicShare?.token || null
    const newToken = after?.publicShare?.token || null

    if (oldToken && oldToken !== newToken) {
      await db.doc(`publicCanvases/${oldToken}`).delete().catch(() => {})
    }
    if (!newToken) return

    const schoolSnap = await db.doc(`schools/${schoolId}`).get()
    await db.doc(`publicCanvases/${newToken}`).set({
      schoolId,
      requestId,
      schoolName: schoolSnap.exists ? (schoolSnap.data().name || '') : '',
      title: after.title || '',
      bodyHtml: after.bodyHtml || '',
      description: after.bodyHtml ? '' : (after.description || ''),
      coverImageUrl: after.coverImageUrl || null,
      coverImagePosition: after.coverImagePosition ?? 50,
      attachments: (after.attachments || []).map((a) => ({ name: a.name || '', url: a.url || '', size: a.size || 0 })),
      links: (after.links || []).map((l) => ({ url: l.url || '', label: l.label || '' })),
      createdByName: after.createdByName || '',
      updatedAt: after.updatedAt || FieldValue.serverTimestamp(),
      syncedAt: FieldValue.serverTimestamp(),
    })
  },
)
