/**
 * 오류 경계.
 *
 * 지금까지는 위젯 하나가 예상 못 한 데이터에 걸려 렌더 중 터지면 화면 전체가 하얗게
 * 비었다. 교사 입장에서는 "시스템이 죽었다"로 보이고, 무엇을 해야 할지도 알 수 없다.
 *
 * 위젯 단위로 감싸면 나머지 화면은 살아 있고, 문제가 난 자리만 다시 시도를 권한다.
 */
import { Component } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // 콘솔에는 남겨둔다 — 사용자에게는 요약만 보이지만 원인 추적은 필요하다
    console.error(`[${this.props.label || '화면'}] 렌더 실패:`, error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <Box sx={{ textAlign: 'center', py: 4, px: 2 }}>
        <Typography fontSize="1.6rem" mb={0.5}>⚠️</Typography>
        <Typography fontWeight={700} fontSize="0.92rem">
          {this.props.label || '이 부분'}을 표시하지 못했습니다.
        </Typography>
        <Typography color="text.secondary" fontSize="0.82rem" sx={{ mt: 0.5 }}>
          다른 기능은 그대로 쓸 수 있습니다.
        </Typography>
        <Button size="small" sx={{ mt: 1.5 }} onClick={() => this.setState({ error: null })}>
          다시 시도
        </Button>
      </Box>
    )
  }
}
