import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'
import { useRef } from 'react'

export default function QRDisplay({ eventName, checkinUrl }) {
  const svgRef = useRef()
  const canvasRef = useRef()

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

  const handleDownload = () => {
    const canvas = canvasRef.current
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `${eventName}-QR.png`
    a.click()
  }

  return (
    <div style={styles.container}>
      {/* 화면 표시용 SVG */}
      <div ref={svgRef}>
        <QRCodeSVG value={checkinUrl} size={200} level="M" />
      </div>

      {/* 다운로드용 Canvas (숨김) */}
      <QRCodeCanvas ref={canvasRef} value={checkinUrl} size={600} level="M" style={{ display: 'none' }} />

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
  container: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' },
  url: {
    fontSize: '0.75rem', color: '#666',
    wordBreak: 'break-all', textAlign: 'center', maxWidth: '240px',
  },
  actions: { display: 'flex', gap: '0.5rem' },
  copyBtn: {
    padding: '0.4rem 0.9rem', border: '1px solid #1a73e8',
    color: '#1a73e8', backgroundColor: '#fff',
    borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem',
  },
  downloadBtn: {
    padding: '0.4rem 0.9rem', border: '1px solid #43a047',
    color: '#43a047', backgroundColor: '#fff',
    borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem',
  },
  printBtn: {
    padding: '0.4rem 0.9rem', border: 'none',
    backgroundColor: '#1a73e8', color: '#fff',
    borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem',
  },
}
