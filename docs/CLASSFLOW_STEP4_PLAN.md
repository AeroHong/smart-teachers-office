# 분반 배정(smart-class-flow) 4단계 — 내보내기·스마트교무실 연동 계획

> 상태: **계획만 수립(2026-11-03)**, 개발은 추후. 지금 4단계 탭에는 파일 내보내기 4종만 있다.
> 관련 코드: `apps/classflow/src/components/ExportStep.jsx`, `apps/shared/lib/sectioning.js`, `apps/shared/lib/subjectData.js`

## 목표

분반 배정 결과(학생 × 과목 → 분반 기호)를 **엑셀로 옮겨 적지 않고** 스마트교무실 학생 정보에 바로 반영한다.
반영된 값은 출결(선택과목 그룹)·StudentHub 명렬표·고사 좌석 등 `students.electiveSubjects`를 읽는 모든 곳이 그대로 쓴다.

## 전제 — 진급 작업과의 순서

배정 작업은 보통 **진급 전**(예: 2026년 11월, 1학년 학번 `10101`)에 하고, 결과는 **다음 학년도**(2027학년도 2학년)에 쓰인다.

```
[11월] 수강신청 → 분반 배정(1~3단계, 학번 = 지금 학번)
[2월]  StudentHub 반편성 등록 → students.nextPlacement = {year: 2027, grade: 2, class, number}
[2~3월] StudentHub 학년도 전환(진급) → studentId·grade·class·number 갱신, placements[2026]에 이전 자리 보관
[이후] 4단계 반영 — 언제 하든 학생 문서(문서 ID)로 연결되므로 진급 전·후 모두 가능해야 한다
```

## 학생 연결(매칭) 규칙

작업의 학번은 **배정 당시 학년도**(`project.year - 1`, 2학년 과목이면 지금 1학년) 학번이다. 학생 문서를 이렇게 찾는다.

1. `placements[배정 당시 학년도]`의 grade·class·number로 만든 학번이 같은 학생(진급 뒤)
2. 아직 진급 전이면 `year == 배정 당시 학년도`이고 `studentId`가 같은 학생
3. 못 찾은 학생(전출·자퇴·학번 변경)은 목록으로 보여 주고 직접 지정하거나 건너뛴다
4. 동명이인·중복 매칭은 반영을 막는다

연결 결과(학번 → 학생 문서 ID)는 프로젝트 문서에 `studentLinks`로 저장해서, 다시 반영할 때 재사용한다.

## 반영 형식 — `students.electiveSubjects`

`subjectData.js`의 `normalizeElective()` 표준형에 맞춘다.

| 필드 | 값 |
|---|---|
| `subjectId` | `subjects` 컬렉션(입학년도 `entryYear` 범위)에서 과목명으로 찾은 ID, 못 찾으면 `''` |
| `subjectName` | 과목명 |
| `classNo` | 분반 기호 — 그룹 글자(`A`~`E`, 같은 그룹 2분반이면 `A1`·`A2`). `electiveLabel()`이 "화학 (B)"로 표시한다 |
| `semester` | 작업의 학기(1·2) |
| `year`·`grade` | 작업의 학년도·학년(예: 2027·2) |

- **같은 학년도·학기 항목만 통째로 바꾼다.** 다른 학기·지난 학년도 항목은 그대로 둔다(누적 규칙).
- `electiveSubjectsUpdatedAt` 갱신, `electiveImports`에 반영 기록(파일명 대신 `classflow:{projectId}`)을 남긴다.

## 화면(4단계) 흐름

1. **준비 점검** — StudentHub 학년도 전환 여부, 과목명 ↔ `subjects` 매칭 결과(못 찾은 과목 목록)
2. **학생 연결** — 자동 매칭 결과, 못 찾은 학생 직접 지정
3. **미리보기** — 학생별 반영될 과목·분반, 지금 값과 다른 학생 수, 덮어쓰게 될 항목
4. **반영** — 한 번에 쓰기, 결과 요약(반영 n명, 건너뜀 n명). 반영 후 배정을 고치면 "다시 반영 필요" 표시

## 권한·보안

- 쓰기 주체는 StudentHub 선택과목 담당자(`studentHubManagers.roles`의 `elective`)와 관리자. 규칙은 이미
  `electiveSubjects*` 필드만 바꾸는 쓰기를 허용하고 있으므로, classflow도 같은 필드만 건드린다(`firestore.rules` 확인 필요).
- 학생 수가 많아 클라이언트 batch(500건 한도)로 나눠 쓰거나, Cloud Function 하나로 묶는 안을 비교한다.
  기록·롤백을 생각하면 **함수 + 반영 스냅숏 저장**이 낫다.

## 정해야 할 것

- ~~분반 기호를 그룹 글자로 둘지 번호로 바꿀지~~ → **그룹명(`A`~`E`)으로 확정**(2026-11-03)
- 반영을 되돌리는 기능(직전 스냅숏으로 복원)이 필요한지
- 나이스 일괄등록 양식의 정확한 형식(지금은 받은 파일 헤더를 그대로 되돌림) — 실제 업로드 양식 확인
