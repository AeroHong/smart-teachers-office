import { useState } from 'react'
import { useAuth } from '@shared/contexts/AuthContext'
import { currentSchoolYear } from '@shared/lib/schema'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import AdminStaffBasic from './AdminStaffBasic'
import AdminStaffSubjects from './AdminStaffSubjects'

export default function AdminStaff() {
  const { schoolId } = useAuth()
  const [tab, setTab] = useState('basic')
  const [assignmentYear, setAssignmentYear] = useState(currentSchoolYear())

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} mb={3}>
        교직원 관리
      </Typography>

      {/* 학년도 선택 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <FormControl sx={{ minWidth: 120 }}>
          <InputLabel>학년도</InputLabel>
          <Select
            value={assignmentYear}
            label="학년도"
            onChange={e => setAssignmentYear(Number(e.target.value))}
          >
            {Array.from({ length: 5 }, (_, i) => currentSchoolYear() - 2 + i).map(y => (
              <MenuItem key={y} value={y}>{y}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* 탭 */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(e, v) => setTab(v)}>
          <Tab label="기본 배정" value="basic" />
          <Tab label="과목 배정" value="subjects" />
        </Tabs>
      </Box>

      {/* 탭 컨텐츠 */}
      {tab === 'basic' && (
        <AdminStaffBasic schoolId={schoolId} assignmentYear={assignmentYear} />
      )}
      {tab === 'subjects' && (
        <AdminStaffSubjects schoolId={schoolId} assignmentYear={assignmentYear} />
      )}
    </Box>
  )
}
