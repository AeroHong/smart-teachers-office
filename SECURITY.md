# 스마트 교무실 — 보안 설계 및 운영 가이드

> 작성일: 2026-05-21  
> compact 재시작 후 참조용

---

## 1. 확정된 인증 설계 방향

### 핵심 원칙
- **도메인 = 보안 게이트 아님, UX 편의 필터**
- **보안 게이트 = 학교 관리자 승인 (pending 흐름)**
- **누구나 가입 신청 가능, 관리자가 승인해야 진입**

### 제거하기로 결정한 것
| 항목 | 이유 |
|------|------|
| `userEmailMap` 컬렉션 | 관리자 직접 배정 → 불필요 |
| 도메인 자동 배정 (`schoolDomains` → schoolId) | 보안 게이트 역할 종료 |
| `schoolDomains` 컬렉션 | `schools.domains[]` 쿼리로 대체 |
| SuperAdmin 이메일 직접 배정 섹션 | 불필요 |

### 유지하는 것
| 항목 | 역할 |
|------|------|
| `schools.domains[]` 필드 | SchoolSetup 추천 필터 (UX) |
| `preApproved` 서브컬렉션 | 학교 관리자 사전 초대 |
| `pending` → 관리자 승인 흐름 | 핵심 보안 게이트 |
| 게스트 모드 (`guest_*`) | 부담 없는 체험용 |

---

## 2. 확정된 워크플로우

```
어떤 구글 계정이든 로그인
        ↓
processUser 실행
  ├─ 슈퍼어드민 → /super-admin
  ├─ user doc 있고 실제 학교(non-guest) → 바로 진입
  └─ user doc 없음 or guest_ schoolId → SchoolSetup
        ↓
SchoolSetup 화면
  ├─ [내 도메인 학교] 상단 추천 표시 (schools.domains[] 쿼리)
  ├─ 전체 학교 검색
  ├─ 새 학교 등록 → school_admin으로 즉시 시작
  └─ 게스트 모드 → 개인 체험 학교(guest_*) 생성
        ↓
학교 선택 → pending → 학교 관리자 승인
        ↓
진입
```

### 도메인별 동작
| 도메인 유형 | SchoolSetup 내 표시 |
|-------------|-------------------|
| 전용 도메인 (`@sunyu.hs.kr`) | 해당 학교 1개 추천 표시 |
| 공유 도메인 (`@senedu.kr`) | 해당 도메인 사용 학교 전체 추천 표시 |
| 미등록 도메인 (`@gmail.com` 등) | 추천 없음, 전체 검색만 |

---

## 3. 기술 구현 계획 (compact 후 작업 예정)

### AuthContext.jsx 변경
- `lookupSchoolByEmail()` 함수 제거
- `lookupSchoolByDomain()` 제거 (SchoolSetup으로 이동)
- `processUser` 단순화:
  ```
  슈퍼어드민 → /super-admin
  user doc 있고 non-guest schoolId → fetchSchoolData → 진입
  나머지 → needsSchoolSetup = true
  ```
- `completeSchoolSetup(schoolId, role)` 함수 추가
  - Firestore 쓰기 없이 React 상태만 직접 세팅
  - SchoolSetup의 모든 액션(가입/생성/게스트)이 이 함수 사용
- `reloadUser` SchoolSetup에서 더 이상 사용 안 함 (순환 루프 방지)
- `enterGuestSchool` 제거 (completeSchoolSetup으로 통합)

### SchoolSetup.jsx 변경
- 도메인 기반 학교 추천: `where('domains', 'array-contains', domain)` 쿼리
- useEffect로 상태 감지 후 자동 navigate (타이밍 이슈 해결)
  ```js
  useEffect(() => {
    if (!loading && user && !needsSchoolSetup && role !== null && schoolId) {
      navigate('/', { replace: true })
    }
  }, [loading, user, needsSchoolSetup, role, schoolId])
  ```
- 모든 핸들러에서 `completeSchoolSetup` 호출 후 navigate 제거

### SuperAdmin.jsx 변경
- 이메일 직접 배정 섹션 제거
- `loadEmailMap`, `handleAddEmailMap`, `handleDeleteEmailMap` 제거
- 게스트 학교 섹션 유지

### Firestore Rules 변경
- `userEmailMap` 관련 규칙 제거
- 나머지 유지

---

## 4. 보안 분석

### 기술적 강점
| 항목 | 근거 |
|------|------|
| 학교 간 데이터 완전 격리 | Firestore Rules가 `schoolId` 단위로 차단 (코드 아닌 DB 레벨) |
| 인증 위임 | Google OAuth — 비밀번호 없음, Google 2FA 그대로 적용 |
| pending 게이트 | 관리자 승인 전 데이터 접근 0 |
| 게스트 완전 격리 | `guest_*` 학교는 실제 학교 데이터와 완전히 분리 |

### 실제 위험 요소 및 대응
| 위험 | 가능성 | 대응 |
|------|--------|------|
| 관리자가 모르는 사람 실수 승인 | 중간 | 승인 화면에 전체 이메일 + 신청일 명확히 표시 |
| 퇴직 교사 계정 미회수 | 높음 | 관리자가 직접 비활성화해야 함 (수동), 가이드 필요 |
| 관리자 구글 계정 탈취 | 낮음 | Google 계정 보안(2FA)에 위임, 시스템 범위 밖 |
| 악의적 대량 가입 신청 | 낮음 | pending 상태라 데이터 접근 없음, 스팸성 불편만 존재 |

---

## 5. 학교 관리자 안내문 (초안)

```
✅ 선생님들이 처음 로그인하면 "승인 대기" 상태가 됩니다.
   관리자 페이지에서 확인하고 승인해주세요.

✅ 승인 전에는 어떤 학교 데이터도 볼 수 없습니다.
   이메일 주소를 꼭 확인하고 승인하세요.

✅ 이메일 목록을 미리 등록하면 (사전 승인),
   해당 선생님은 로그인 즉시 자동 진입됩니다.

✅ 퇴직·전출 교사는 관리자 페이지에서
   직접 비활성화 처리해 주세요.

✅ 로그인은 구글 계정(학교 또는 개인)으로만 가능합니다.
   아이디/비밀번호 관리는 구글이 담당합니다.
```

---

## 6. 보안 질문 대응 Q&A

**Q. 우리 학교 자료를 다른 학교 선생님이 볼 수 있나요?**
> 불가능합니다. 학교별로 데이터가 완전히 분리되어 있고, 데이터베이스 규칙 수준에서 다른 학교 접근을 차단합니다.

**Q. 아무나 우리 학교에 가입할 수 있나요?**
> 가입 신청은 누구나 할 수 있지만, 관리자가 승인하기 전까지는 아무것도 볼 수 없습니다. 반드시 이메일 주소를 확인하고 승인해 주세요.

**Q. 퇴직한 선생님이 계속 접근할 수 있나요?**
> 퇴직 시 관리자가 직접 비활성화해야 합니다. 자동 처리는 되지 않으므로 인사 이동 시 함께 처리해 주세요.

**Q. 구글 계정이 해킹되면 어떻게 되나요?**
> 구글 계정 보안은 구글이 담당합니다. 학교 구글 계정은 2단계 인증을 설정하시면 안전합니다. 특히 관리자 계정은 필수입니다.

**Q. 개인 정보가 구글 서버에 저장되나요?**
> 로그인 인증만 구글을 사용하고, 출결·연수 등 학교 데이터는 별도 데이터베이스(Firebase)에 저장됩니다.

---

## 7. 보완 필요 기능 (compact 후 작업 예정)

1. **홈 화면 "승인 대기 N명" 배지** — 관리자가 놓치지 않도록
2. **preApproved 이메일 일괄 업로드** — 초기 도입 시 교사 명부 한 번에 등록
3. **퇴직 처리 기능** — 관리자가 특정 계정을 비활성화(rejected)할 수 있는 UI
4. **승인/거절 이메일 알림** — Cloud Functions 활용 (선택사항)
