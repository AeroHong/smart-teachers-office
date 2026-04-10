import { QRCodeSVG } from 'qrcode.react'
import { useRef } from 'react'

export default function QRDisplay({ eventName, checkinUrl }) {
  const svgRef = useRef()

  const handlePrint = () => {
    const win = window.open('', '_blank')
    win.document.write(`
      <html><head><title>${eventName} - 출석 QR</title>
      <style>
        body { font-family: sans-serif; text-align: center; padding: 3rem; }
        h2 { font-size: 1.8rem; margin-bottom: 0.5rem; }
        p { color: #666; font-size: 1rem; margin-bottom: 2rem; }
        svg { width: 300px; height: 300px; }
      </style></head>
      <body>
        <h2>${eventName}</h2>
        <p>QR 코드를 스캔하여 출석을 확인하세요.</p>
        ${svgRef.current?.innerHTML}
      </body></html>
    `)
    win.document.close()
    win.print()
  }

  // 표시 중인 SVG를 그대로 고해상도 PNG로 변환
  const handleDownload = () => {
    const svgEl = svgRef.current?.querySelector('svg')
    if (!svgEl) return

    const exportSize = 800
    // style 속성 제거 후 명시적 크기 설정 (width:100% 이슈 방지)
    const cloned = svgEl.cloneNode(true)
    cloned.removeAttribute('style')
    cloned.setAttribute('width', exportSize)
    cloned.setAttribute('height', exportSize)

    const svgData = new XMLSerializer().serializeToString(cloned)
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = exportSize
      canvas.height = exportSize
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, exportSize, exportSize)
      ctx.drawImage(img, 0, 0, exportSize, exportSize)
      URL.revokeObjectURL(url)

      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `${eventName}-QR.png`
      a.click()
    }
    img.src = url
  }

  return (
    <div style={styles.container}>
      {/* SVG를 컨테이너 너비에 맞게 100% 채움 */}
      <div ref={svgRef} style={styles.qrWrapper}>
        <QRCodeSVG
          value={checkinUrl}
          size={800}
          level="M"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </div>

      <p style={styles.url}>{checkinUrl}</p>
      <div style={styles.actions}>
        <button onClick={() => navigator.clipboard.writeText(checkinUrl)} style={styles.copyBtn}>
          링크 복사
        </button>
        <button onClick={handleDownload} style={styles.downloadBtn}>
          다운로드
        </button>
        <button onClick={handlePrint} style={styles.printBtn}>
          인쇄
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', width: '100%' },
  qrWrapper: { width: '100%' },
  url: {
    fontSize: '0.72rem', color: '#888',
    wordBreak: 'break-all', textAlign: 'center', width: '100%',
  },
  actions: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' },
  copyBtn: {
    padding: '0.4rem 0.75rem', border: '1px solid #1a73e8',
    color: '#1a73e8', backgroundColor: '#fff',
    borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem',
  },
  downloadBtn: {
    padding: '0.4rem 0.75rem', border: '1px solid #43a047',
    color: '#43a047', backgroundColor: '#fff',
    borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem',
  },
  printBtn: {
    padding: '0.4rem 0.75rem', border: 'none',
    backgroundColor: '#1a73e8', color: '#fff',
    borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem',
  },
}
