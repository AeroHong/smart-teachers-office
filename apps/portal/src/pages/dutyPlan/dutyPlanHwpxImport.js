// 한글(hwpx) 업무분장표 읽기 — 브라우저에서 JSZip으로 풀고 DOMParser로 표만 뽑는다.
// 표 해석(어느 칸이 부서·성명·업무인지)은 순수 함수 interpretDutyTables(apps/shared/lib/dutyPlan.js)가 한다 —
// 여기서는 셀 주소(colAddr)·병합(rowSpan·colSpan)·글자만 원본 그대로 넘긴다. 표 안의 표는 건너뛴다.
import JSZip from 'jszip'
import { interpretDutyTables } from '@shared/lib/dutyPlan'

const HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph'

/** 가장 가까운 조상 표가 자기 자신이 아닌(=안쪽 표) 요소인지 */
function insideOtherTable(el, table) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p === table) return false
    if (p.localName === 'tbl') return true
  }
  return false
}

function cellText(tc) {
  const paras = [...tc.getElementsByTagNameNS(HP, 'p')].filter((p) => !insideOtherTable(p, tc))
  return paras.map((p) => [...p.getElementsByTagNameNS(HP, 't')].map((t) => t.textContent).join('')).join('\n')
}

function tablesOf(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const all = [...doc.getElementsByTagNameNS(HP, 'tbl')]
  const top = all.filter((t) => !all.some((o) => o !== t && o.contains(t)))
  return top.map((tbl) => ({
    rows: [...tbl.children].filter((c) => c.localName === 'tr').map((tr) =>
      [...tr.children].filter((c) => c.localName === 'tc').map((tc) => {
        const addr = [...tc.children].find((c) => c.localName === 'cellAddr')
        const span = [...tc.children].find((c) => c.localName === 'cellSpan')
        return {
          col: Number(addr?.getAttribute('colAddr') || 0),
          rowSpan: Number(span?.getAttribute('rowSpan') || 1),
          colSpan: Number(span?.getAttribute('colSpan') || 1),
          text: cellText(tc),
        }
      })),
  }))
}

/** 표 밖 첫 문단(제목) — '2026학년도 부서별 업무분장 (2026.3.1.)' */
function titleOf(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  for (const p of doc.getElementsByTagNameNS(HP, 'p')) {
    let inTable = false
    for (let a = p.parentElement; a; a = a.parentElement) if (a.localName === 'tbl') { inTable = true; break }
    if (inTable) continue
    const t = [...p.getElementsByTagNameNS(HP, 't')].map((x) => x.textContent).join('').trim()
    if (t) return t
  }
  return ''
}

/**
 * @param {File|Blob} file .hwpx
 * @returns {Promise<ReturnType<typeof interpretDutyTables>>}
 */
export async function readDutyHwpx(file) {
  let zip
  try { zip = await JSZip.loadAsync(file) } catch { throw new Error('한글(hwpx) 파일이 아닙니다. 한글에서 "다른 이름으로 저장 → hwpx"로 저장해 주세요.') }
  const sections = Object.keys(zip.files)
    .filter((n) => /^Contents\/section\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
  if (!sections.length) throw new Error('hwpx 안에 본문(section)이 없습니다.')
  const xmls = await Promise.all(sections.map((n) => zip.file(n).async('string')))
  const tables = xmls.flatMap(tablesOf)
  return interpretDutyTables(tables, { title: titleOf(xmls[0]) })
}
