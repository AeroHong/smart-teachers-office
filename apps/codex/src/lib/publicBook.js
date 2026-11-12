/**
 * 외부 공개(학교 홈페이지 링크) — 로그인 없이 읽는 공개 사본.
 *
 * 학교 데이터(/schools/{schoolId}/regulations…)는 열지 않고, 관리자가 「외부 공개」로 고른 규정의 현행본만
 * 최상위 publicRegulationBooks/{schoolId}(목차) · /regulations/{regId}(본문) · /search/{i}(색인)로 복사한다.
 * 규칙은 이 경로만 read: true(publicCanvases와 같은 방식). 목차 설정 저장·개정 확정 때 다시 복사한다.
 */
import { useEffect, useState } from 'react'
import { collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { buildSearchEntries, packIndex } from '@shared/lib/regulationSearch'
import { getCurrentNodes, getVersion } from './data'

export const PUBLIC_COL = 'publicRegulationBooks'
const pubBook = (schoolId) => doc(db, PUBLIC_COL, schoolId)
const pubReg = (schoolId, regId) => doc(db, PUBLIC_COL, schoolId, 'regulations', regId)
const pubSearch = (schoolId, i) => doc(db, PUBLIC_COL, schoolId, 'search', String(i))

export const publicUrl = (schoolId) => `${window.location.origin}/public/${schoolId}`

/** 공개 사본 다시 쓰기 — 공개 규정 수를 돌려준다. 공개가 하나도 없고 예전 사본도 없으면 아무것도 안 쓴다 */
export async function publishPublicBook(schoolId, book, user) {
  const regs = book.regulations.filter((r) => r.public && r.status !== 'repealed')
  const existing = await getDocs(collection(db, PUBLIC_COL, schoolId, 'regulations'))
  const existed = (await getDoc(pubBook(schoolId))).exists()
  if (!regs.length && !existed) return 0
  const ids = new Set(regs.map((r) => r.id))
  const batch = writeBatch(db)
  const entries = []
  for (const r of regs) {
    const nodes = await getCurrentNodes(schoolId, book, r.id)
    const v = await getVersion(schoolId, r.id, r.currentVersionId)
    batch.set(pubReg(schoolId, r.id), { title: r.title, nodes: nodes || [], effectiveDate: v?.effectiveDate || '', kind: v?.kind || '', updatedAt: serverTimestamp() })
    entries.push(...buildSearchEntries(r.id, nodes || []))
  }
  for (const d of existing.docs) if (!regs.some((r) => r.id === d.id)) batch.delete(d.ref)
  const parts = packIndex(entries)
  const oldParts = existed ? (await getDoc(pubBook(schoolId))).data().searchParts || 0 : 0
  parts.forEach((e, i) => batch.set(pubSearch(schoolId, i), { entries: e }))
  for (let i = parts.length; i < oldParts; i++) batch.delete(pubSearch(schoolId, i))
  batch.set(pubBook(schoolId), {
    title: book.title || '', effectiveDate: book.effectiveDate || '',
    // 체계도 함께 — 상위·근거 규정은 공개된 것만 남긴다(법령 근거는 그대로)
    regulations: regs.map(({ id, title, no, reference, category, order, currentVersionId, effectiveDate, articleCount, toc, level, parentId, basis }) => ({
      id, title, no, reference, category, order, currentVersionId, effectiveDate, articleCount, toc, public: true,
      level: level || 'regulation', parentId: parentId && ids.has(parentId) ? parentId : null,
      basis: (basis || []).filter((b) => b.kind === 'law' || ids.has(b.regId)),
    })),
    citations: Object.fromEntries(Object.entries(book.citations || {})
      .filter(([k]) => ids.has(k.split('/')[0]))
      .map(([k, v]) => [k, v.filter((x) => ids.has(x.split('/')[0]))])
      .filter(([, v]) => v.length)),
    recent: (book.recent || []).filter((r) => ids.has(r.regId)),
    searchParts: parts.length, searchStamp: Date.now().toString(36),
    updatedAt: serverTimestamp(), updatedByName: user?.name || '',
  })
  await batch.commit()
  return regs.length
}

// ── 공개 화면 읽기(로그인 없음) ────────────────────────────────────

export function usePublicBook(schoolId) {
  const [state, setState] = useState({ book: null, loading: true, error: null })
  useEffect(() => {
    if (!schoolId) return undefined
    return onSnapshot(pubBook(schoolId),
      (s) => setState({ book: s.exists() ? { id: s.id, publicSchoolId: schoolId, ...s.data() } : null, loading: false, error: null }),
      (e) => setState({ book: null, loading: false, error: e }))
  }, [schoolId])
  return state
}

const regCache = new Map()
export function getPublicRegulation(schoolId, regId) {
  const k = `${schoolId}/${regId}`
  if (!regCache.has(k)) regCache.set(k, getDoc(pubReg(schoolId, regId)).then((s) => (s.exists() ? { id: s.id, ...s.data() } : null)).catch((e) => { regCache.delete(k); throw e }))
  return regCache.get(k)
}

export async function loadPublicSearch(schoolId, book) {
  const parts = await Promise.all(Array.from({ length: book.searchParts || 0 }, (_, i) => getDoc(pubSearch(schoolId, i))))
  return parts.flatMap((s) => (s.exists() ? s.data().entries || [] : []))
}
