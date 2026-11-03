// 칸막이별 색 — 그룹 격자 카드와 과목 표에서 같은 색을 쓴다
const PALETTE = [
  { fg: '#1d4ed8', bg: '#eff4ff', border: '#bcd0fb' },
  { fg: '#047857', bg: '#ecfdf5', border: '#a7e3cb' },
  { fg: '#b45309', bg: '#fff7ed', border: '#f6cf9c' },
  { fg: '#7c3aed', bg: '#f5f3ff', border: '#d4c6fb' },
  { fg: '#be123c', bg: '#fff1f2', border: '#f9c0ca' },
  { fg: '#0e7490', bg: '#ecfeff', border: '#a5e4ef' },
]

export function blockColor(block, blocks) {
  const i = Math.max(0, blocks.indexOf(block))
  return PALETTE[i % PALETTE.length]
}
