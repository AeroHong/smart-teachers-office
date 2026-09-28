/**
 * 이메일 수신 대상 선택 — 학년/반 필터 + 전체선택/개별 체크박스.
 *
 * 출결 시스템의 studentGroups는 목적이 달라(반복 수업 단위) 재사용하지 않는다. 여기서는
 * students 컬렉션을 한 번에 불러와(AdminStudents.jsx와 동일 패턴) 클라이언트에서
 * 학년→반으로 좁히고, 그 안에서 전체선택/개별 체크를 함께 지원한다.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Checkbox from '@mui/material/Checkbox'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import CircularProgress from '@mui/material/CircularProgress'
import { db } from '@shared/lib/firebase'

export default function RecipientPicker({ schoolId, selected, onChange }) {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [grade, setGrade] = useState('all')
  const [klass, setKlass] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!schoolId) return
    getDocs(collection(db, 'schools', schoolId, 'students')).then(snap => {
      const list = snap.docs
        .map(d => ({ workspaceUserId: d.id, ...d.data() }))
        .filter(s => s.email)
        .sort((a, b) => a.grade - b.grade || a.class - b.class || a.number - b.number)
      setStudents(list)
      setLoading(false)
    })
  }, [schoolId])

  const grades = useMemo(() => [...new Set(students.map(s => s.grade))].sort((a, b) => a - b), [students])
  const classes = useMemo(() => {
    const inGrade = grade === 'all' ? students : students.filter(s => s.grade === grade)
    return [...new Set(inGrade.map(s => s.class))].sort((a, b) => a - b)
  }, [students, grade])

  const filtered = useMemo(() => {
    const kw = search.trim()
    return students.filter(s => {
      if (grade !== 'all' && s.grade !== grade) return false
      if (klass !== 'all' && s.class !== klass) return false
      if (kw && !s.name?.includes(kw) && !s.studentId?.includes(kw)) return false
      return true
    })
  }, [students, grade, klass, search])

  const selectedSet = useMemo(() => new Set(selected.map(s => s.workspaceUserId)), [selected])
  const allFilteredSelected = filtered.length > 0 && filtered.every(s => selectedSet.has(s.workspaceUserId))

  const pick = ({ workspaceUserId, studentId, email, name, grade, class: klass, number }) =>
    ({ workspaceUserId, studentId, email, name, grade, class: klass, number })

  const toggleOne = (student) => {
    const exists = selectedSet.has(student.workspaceUserId)
    onChange(exists
      ? selected.filter(s => s.workspaceUserId !== student.workspaceUserId)
      : [...selected, pick(student)])
  }

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filtered.map(s => s.workspaceUserId))
      onChange(selected.filter(s => !filteredIds.has(s.workspaceUserId)))
    } else {
      const merged = new Map(selected.map(s => [s.workspaceUserId, s]))
      filtered.forEach(s => merged.set(s.workspaceUserId, pick(s)))
      onChange([...merged.values()])
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <FormControl size="small" sx={{ minWidth: 110 }}>
          <InputLabel>학년</InputLabel>
          <Select value={grade} label="학년" onChange={e => { setGrade(e.target.value); setKlass('all') }}>
            <MenuItem value="all">전체 학년</MenuItem>
            {grades.map(g => <MenuItem key={g} value={g}>{g}학년</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>반</InputLabel>
          <Select value={klass} label="반" onChange={e => setKlass(e.target.value)}>
            <MenuItem value="all">전체 반</MenuItem>
            {classes.map(c => <MenuItem key={c} value={c}>{c}반</MenuItem>)}
          </Select>
        </FormControl>
        <TextField
          size="small" placeholder="이름·학번 검색" value={search}
          onChange={e => setSearch(e.target.value)}
          sx={{ minWidth: 160 }}
        />
        <Chip
          label={`총 ${selectedSet.size}명 선택됨`}
          color={selectedSet.size > 0 ? 'primary' : 'default'}
          sx={{ ml: 'auto', fontWeight: 700 }}
        />
      </Box>

      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <ListItemButton onMouseDown={e => e.preventDefault()} onClick={toggleAllFiltered} dense
          sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}>
          <Checkbox size="small" checked={allFilteredSelected} indeterminate={!allFilteredSelected && filtered.some(s => selectedSet.has(s.workspaceUserId))} />
          <ListItemText primary={`현재 필터 전체 선택 (${filtered.length}명)`} primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }} />
        </ListItemButton>

        <List dense sx={{ maxHeight: 280, overflowY: 'auto', py: 0 }}>
          {filtered.length === 0 ? (
            <Typography sx={{ p: 2, color: 'text.secondary', fontSize: '0.85rem' }}>대상 학생이 없습니다.</Typography>
          ) : filtered.map(s => (
            <ListItem key={s.workspaceUserId} disablePadding>
              <ListItemButton onMouseDown={e => e.preventDefault()} onClick={() => toggleOne(s)} dense>
                <Checkbox size="small" checked={selectedSet.has(s.workspaceUserId)} />
                <ListItemText
                  primary={`${s.grade}학년 ${s.class}반 ${s.number}번 ${s.name}`}
                  secondary={s.email}
                  primaryTypographyProps={{ fontSize: '0.85rem' }}
                  secondaryTypographyProps={{ fontSize: '0.75rem' }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>
    </Box>
  )
}
