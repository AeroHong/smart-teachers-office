# 멀티 학교 지원 작업 계획

> 작성일: 2026-04-08  
> 상태: 미착수 (계획만)  
> 우선순위: 낮음 (선유고 안정화 이후)

---

## 설계 방향

- **시스템 관리자**(본인)가 학교를 직접 등록·관리
- 학교별 승인 관리자(school_admin)도 시스템 관리자가 직접 지정
- 교사/학생은 이메일 도메인을 기준으로 학교 자동 배정
- 기존 Firestore 구조(`/schools/{schoolId}/...`) 그대로 유지 — 경로만 동적화

---

## 역할 구조 (최종)

| 역할 | 설명 |
|------|------|
| `superadmin` | 시스템 관리자. 학교 생성·삭제, school_admin 지정 |
| `school_admin` | 학교별 관리자. 교사 승인, 학생 관리 |
| `teacher` | 일반 교사. 이벤트 생성·출결 관리 |
| `student` | 학생. QR 체크인만 가능 |
| `pending` | 미승인 교사 |

superadmin UID는 Firestore `/system/config` 문서에 배열로 저장  
(코드에 하드코딩 금지)

---

## Firestore 구조 추가

```
/system/config
  - superadminUids: ['uid1', 'uid2']

/schools/{schoolId}
  - name: '선유고등학교'
  - domain: 'seonyoo.hs.kr'        ← 이메일 도메인 (학교 자동 감지용)
  - studentDomain: 'seonyoo.hs.kr' ← 학생 계정 도메인 (학번 판단용)
  - createdAt: Timestamp
```

---

## 변경이 필요한 파일

### 1. `src/contexts/AuthContext.jsx`
- `SCHOOL_DOMAIN`, `SCHOOL_ID` 하드코딩 제거
- 로그인 시 `/schools` 컬렉션에서 `domain == 이메일도메인` 쿼리 → schoolId 동적 결정
- superadmin 여부: `/system/config` 문서의 `superadminUids` 배열 확인

```js
// 변경 전
export const SCHOOL_ID = 'seonyoo-hs'
const SCHOOL_DOMAIN = 'seonyoo.hs.kr'

// 변경 후
const schoolDoc = await getDocs(query(
  collection(db, 'schools'),
  where('domain', '==', emailDomain)
))
const schoolId = schoolDoc.docs[0]?.id ?? null
```

### 2. `src/pages/StudentCheckin.jsx`
- 도메인 오류 메시지에서 `@seonyoo.hs.kr` 하드코딩 제거
- 이벤트 로드 시 schoolId로 학교 문서 조회 → `studentDomain` 가져와서 경고 메시지 동적 생성

### 3. `src/pages/Admin.jsx`
- 현재 역할: 교사 승인 (school_admin용)
- 변경 불필요 — school_admin이 해당 schoolId 범위 내에서만 조회하므로 그대로 사용 가능

### 4. `src/pages/SysAdmin.jsx` (신규)
- superadmin 전용 페이지 (`/sysadmin` 라우트)
- 학교 목록 조회·생성·삭제
- 학교별 school_admin 지정
- 학교 생성 폼: 학교명, schoolId(영문), 도메인

### 5. `src/App.jsx`
- `/sysadmin` 라우트 추가 (superadmin 전용 ProtectedRoute)

### 6. `src/components/ProtectedRoute.jsx`
- `superAdminOnly` prop 추가

### 7. `firestore.rules`
- `/system/config` 읽기: superadmin만
- `/schools` 생성·삭제: superadmin만
- 기존 school 내부 rules는 그대로 유지

---

## 작업 순서 (착수 시)

1. Firestore에 `/system/config` 문서 수동 생성 (superadmin UID 등록)
2. 기존 `seonyoo-hs` 학교 문서에 `domain`, `studentDomain` 필드 추가
3. `AuthContext.jsx` 동적화
4. `StudentCheckin.jsx` 도메인 메시지 동적화
5. `SysAdmin.jsx` 페이지 + 라우트 추가
6. `firestore.rules` 업데이트
7. 전체 테스트 (기존 선유고 동작 유지 확인)

---

## 주의사항

- 작업 중 기존 선유고 서비스 중단 없어야 함
- `schoolId` 없는 상태(도메인 매핑 실패)의 에러 처리 명확히
- superadmin은 Layout 네비에 "시스템 관리" 링크 추가
