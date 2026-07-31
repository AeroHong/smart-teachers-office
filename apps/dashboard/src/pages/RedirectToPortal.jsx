import { useEffect } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import { portalLink } from '../lib/portalUrl'

export default function RedirectToPortal({ path }) {
  useEffect(() => {
    window.location.href = portalLink(path)
  }, [path])

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
      <CircularProgress />
    </Box>
  )
}
