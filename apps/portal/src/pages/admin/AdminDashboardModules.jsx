import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, USERS, schoolPath, currentSchoolYear } from '@shared/lib/schema'
import { MODULE_VISIBILITY, mergeModuleSettings } from '@shared/lib/dashboardModules'
import { table } from './adminUi'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Switch from '@mui/material/Switch'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

export default function AdminDashboardModules() {
  const { schoolId } = useAuth()
  const [moduleDocs, setModuleDocs] = useState([])
  const [staff, setStaff] = useState([])
  const [departments, setDepartments] = useState([])

  useEffect(() => {
    if (!schoolId) return
    return onSnapshot(collection(db, ...schoolPath(schoolId, COL.DASHBOARD_MODULES)), snap => {
      setModuleDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [schoolId])

  useEffect(() => {
    if (!schoolId) return
    getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId), where('role', 'in', STAFF_ROLES)))
      .then(snap => setStaff(snap.docs.map(d => ({ uid: d.id, name: d.data().name || d.data().email }))))
      .catch(e => console.error('구성원 조회 실패:', e))

    getDocs(query(collection(db, ...schoolPath(schoolId, COL.TEACHER_ASSIGNMENTS)), where('year', '==', currentSchoolYear())))
      .then(snap => {
        const set = new Set(snap.docs.map(d => d.data().department).filter(Boolean))
        setDepartments([...set].sort())
      })
      .catch(e => console.error('부서 목록 조회 실패:', e))
  }, [schoolId])

  const rows = useMemo(() => mergeModuleSettings(moduleDocs), [moduleDocs])

  const patch = async (key, changes) => {
    try {
      await setDoc(doc(db, ...schoolPath(schoolId, COL.DASHBOARD_MODULES), key), changes, { merge: true })
    } catch (e) {
      console.error('모듈 설정 저장 실패:', e)
    }
  }

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} mb={1}>대시보드 모듈 노출 관리</Typography>
      <Typography color="text.secondary" fontSize="0.9rem" mb={3}>
        미리 만들어둔 대시보드 위젯을 켜고 끄며, 볼 수 있는 교사를 지정합니다.
        꺼진 모듈은 아무에게도 보이지 않습니다. 아래 모듈은 따로 설정하지 않으면 전체 공개로 켜져 있습니다.
      </Typography>

      <table style={table.table}>
        <thead style={table.thead}>
          <tr>
            <th style={table.th}>모듈</th>
            <th style={table.th}>노출</th>
            <th style={table.th}>대상</th>
            <th style={table.th}>대상 지정</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} style={table.tr}>
              <td style={table.td}>{row.emoji} {row.title}</td>
              <td style={table.td}>
                <Switch
                  checked={!!row.enabled}
                  onChange={e => patch(row.key, { enabled: e.target.checked })}
                />
              </td>
              <td style={{ ...table.td, minWidth: 140 }}>
                <FormControl size="small" sx={{ minWidth: 130 }}>
                  <Select
                    value={row.visibility}
                    onChange={e => patch(row.key, { visibility: e.target.value })}
                  >
                    {Object.entries(MODULE_VISIBILITY).map(([value, label]) => (
                      <MenuItem key={value} value={value}>{label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </td>
              <td style={{ ...table.td, minWidth: 260 }}>
                {row.visibility === 'department' && (
                  <Autocomplete
                    multiple
                    size="small"
                    options={departments}
                    value={row.targetDepartments || []}
                    onChange={(_, value) => patch(row.key, { targetDepartments: value })}
                    renderInput={params => <TextField {...params} placeholder="부서 선택" />}
                    sx={{ minWidth: 260 }}
                  />
                )}
                {row.visibility === 'individual' && (
                  <Autocomplete
                    multiple
                    size="small"
                    options={staff}
                    getOptionLabel={o => o.name}
                    isOptionEqualToValue={(a, b) => a.uid === b.uid}
                    value={staff.filter(s => (row.targetTeacherUids || []).includes(s.uid))}
                    onChange={(_, value) => patch(row.key, { targetTeacherUids: value.map(v => v.uid) })}
                    renderInput={params => <TextField {...params} placeholder="교사 선택" />}
                    sx={{ minWidth: 260 }}
                  />
                )}
                {row.visibility === 'all' && (
                  <Typography variant="caption" color="text.secondary">소속 교사 전체</Typography>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  )
}
