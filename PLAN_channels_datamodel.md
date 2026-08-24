# 채널 데이터 모델 설계 (P0 산출물)

> 작성일: 2026-08-24
> 상태: **설계안. 코드 변경 없음.** [PLAN_channels.md](./PLAN_channels.md)에서 확정된 결정
> (비공개 채널, 메시지+Canvas, DM=2인 채널, 공지 전용 채널)을 실제 스키마와 보안 규칙으로
> 옮긴 것이다. P1~P7 구현 시 이 문서를 기준으로 삼는다.
> 구현이 끝나면 확정된 내용을 [DB_STRUCTURE.md](./DB_STRUCTURE.md)로 옮긴다.

---

## 1. 가장 큰 제약 — Firestore 보안 규칙은 필터가 아니다

이 문서의 거의 모든 결정이 이 하나에서 나온다.

Firestore는 쿼리를 실행할 때 **"이 쿼리가 읽을 수 없는 문서를 반환할 가능성이 있는가"**를 본다.
가능성이 있으면 **쿼리 전체가 실패한다.** 읽을 수 있는 것만 골라 돌려주지 않는다.

그래서 "이 글이 속한 채널의 멤버인가"를 규칙 안에서 `get()`으로 확인하는 방식은 **목록 쿼리에
쓸 수 없다**:

- `get()`은 문서 접근 횟수 제한이 있다(단일 문서 요청 10회, 쿼리 20회). 글 50건이 서로 다른
  채널 30개에 흩어져 있으면 그 자체로 초과다
- `get()` 호출은 읽기로 과금된다
- 무엇보다, 문서마다 결과가 달라지는 조건은 쿼리 안전성을 증명할 수 없어 쿼리가 거부된다

→ **접근 판정에 필요한 정보를 문서가 스스로 들고 있어야 한다(비정규화).**

이건 새로운 방식이 아니라 **이 프로젝트가 이미 쓰는 패턴**이다. `channels.memberUids`를 조건
(`memberRule`)과 함께 중복 저장하는 이유가 정확히 같다 — "내가 속한 채널"을 `array-contains`로
뽑기 위해서다(`channels.js` 주석 참고).

> ⚠ 위 횟수 제한(10/20)은 구현 시점에 Firebase 공식 문서로 재확인할 것. 숫자가 바뀌어도
> "문서마다 달라지는 조건은 쿼리에 못 쓴다"는 결론 자체는 변하지 않는다.

---

## 2. 실제로 고쳐야 하는 곳은 한 곳뿐이다

비공개 채널이 들어오면 "전부 다시 짜야 한다"고 우려했지만, `requests` 쿼리를 전수 확인한
결과는 그렇지 않았다.

| 위치 | 쿼리 조건 | 비공개 도입 후 |
|---|---|---|
| `useHomeFeed.js:39,54` | `targetUids array-contains me` + kind/status | **안전** — 이미 자기 스코프 |
| `useDesktopNotifications.js:128,150,222` | 동일 | **안전** |
| `RequestList.jsx:40` (내 글) | `createdBy == me` | **안전** |
| `CommandPalette.jsx:81-82` | `createdBy` / `targetUids` 두 쿼리 병합 | **안전** |
| `PostDetail.jsx:68` | 문서 1건 직접 읽기 | **안전** — 단일 읽기는 `get()` 사용 가능 |
| **`useChannels.js:49`** | **조건 없음** | **깨진다** ← 유일한 문제 |
| `RequestList.jsx:50` (전체) | 조건 없음, 관리자 전용 | 관리자 정책 결정에 따름(§9) |

**대상자 기반 쿼리는 이미 전부 자기 스코프다.** 다시 짜야 하는 건 채널 뱃지 계산용 전체
구독 하나뿐이다. 작업량이 예상보다 훨씬 작다.

---

## 3. 접근 제어 — 두 갈래 쿼리

### 3.1 `requests`에 필드 2개 추가

```
requests/{requestId}
  visibility: 'school' | 'members'    // 신규
  visibleUids: string[]               // 신규, visibility=='members'일 때만 채운다
  ... (기존 필드 그대로)
```

- 공개 채널의 글, 채널 없는 글 → `visibility: 'school'`
- 비공개 채널의 글 → `visibility: 'members'` + `visibleUids` = 그 채널의 `memberUids` 복사본

### 3.2 규칙

```javascript
match /requests/{requestId} {
  // 학교 관리자는 전체(§10) — 조건이 문서에 의존하지 않으므로 조건 없는 쿼리도 통과한다
  allow read: if isSchoolAdmin(schoolId) || (isTeacher(schoolId) && (
    resource.data.visibility == 'school' ||
    request.auth.uid in resource.data.visibleUids
  ));
  // create/update/delete는 기존 규칙 유지 + visibleUids 위조 방지(§3.5)
}
```

> **`isSuperAdmin()`이 read에서 빠진 것은 의도된 변경이다**(§10). 다른 동사(create/update/
> delete)에서는 유지한다 — 운영상 데이터 정정이 필요할 수 있고, 열람 제한이 이번 결정의
> 취지이기 때문이다.

### 3.3 `useChannels`는 리스너 두 개로 나눈다

```javascript
// A. 공개 글
query(col, where('visibility', '==', 'school'))
// B. 내가 볼 수 있는 비공개 글
query(col, where('visibleUids', 'array-contains', user.uid))
```

두 결과의 합집합이 "내가 볼 수 있는 전부"다. 각 쿼리는 규칙 조건과 정확히 대응하므로
안전성이 증명된다.

**이미 있는 패턴이다** — `CommandPalette.jsx:79-83`이 두 쿼리를 `Map`으로 병합하는 코드를
그대로 쓰고 있다. 새로 발명하는 게 아니라 같은 방식을 한 곳 더 적용하는 것.

### 3.4 공개 채널 글에는 `visibleUids`를 넣지 않는다

넣으면 교직원 50명 uid가 글마다 복제되고, 인사이동 한 번에 **학교 전체 글**을 갱신해야 한다.
비공개 채널은 소수(특수교육·인사 등)로 예상되므로 그쪽만 유지하면 비용이 작다.

### 3.5 `visibleUids` 위조 방지

지금 규칙은 글 작성자가 자기 글의 아무 필드나 고칠 수 있다. 그대로 두면 작성자가
`visibleUids`에 남을 끼워 넣어 비공개 채널 글을 유출할 수 있다.

→ 업데이트 규칙에서 `visibility`·`visibleUids`를 **작성자가 바꿀 수 없는 필드**로 묶는다.
이 두 필드는 사람이 아니라 §4의 Cloud Function과 글 작성 시점 로직만 채운다.

---

## 4. `visibleUids` 유지는 Cloud Function이 한다

비공개 채널의 멤버가 바뀌면 그 채널에 속한 **모든 글**의 `visibleUids`를 갱신해야 한다.
클라이언트 배치 쓰기로 하면 중간에 실패했을 때 일부만 반영된 채로 남는다 — 나간 사람이 계속
읽거나, 새로 들어온 사람이 못 보는 상태가 조용히 유지된다.

→ `channels/{channelId}` 문서 업데이트 트리거로 Cloud Function이 갱신한다.

**8/2의 "Cloud Function을 쓰지 않는다"는 결정과 충돌하지 않는다.** 그때 거부한 것은
**참여자 조건을 푸는 일**이었다 — `targeting.js`가 필요한데 `functions/`는 별도 npm 패키지라
import할 수 없어 조건 엔진을 통째로 복제해야 했고, 두 벌이 어긋나면 대상이 조용히 틀어지기
때문이었다(`channels.js` 주석). 여기서 하는 일은 **이미 확정된 `memberUids`를 글에 복사**하는
것이라 조건 엔진이 필요 없다. 같은 함정에 빠지지 않는다.

---

## 5. 채널 스키마

```
channels/{channelId}
  type:        'channel' | 'dm'          // 신규
  visibility:  'public' | 'private'      // 신규
  postPolicy:  'members' | 'owner'       // 신규 — 'owner'가 공지 전용 채널
  lastMessageAt: timestamp                // 신규 — 안읽음 판정용(§7)

  name, description                       // dm은 빈 문자열
  memberRule, memberRuleText, memberUids, leftUids
  archived, createdBy, createdByName, updatedAt
```

- `type: 'dm'`은 항상 `visibility: 'private'`, `name: ''`, `memberUids.length == 2`
- `postPolicy: 'owner'` — 부장회의 안내·보안점검처럼 일방 안내만 필요한 채널

### 규칙

```javascript
match /channels/{channelId} {
  allow read: if
    // 학교 관리자 — 단 DM은 제외한다(§10). type 조건이 문서에 의존하므로
    // 관리자가 전체를 훑을 때는 where('type','==','channel')을 함께 걸어야 한다
    (isSchoolAdmin(schoolId) && resource.data.type == 'channel') ||
    (isTeacher(schoolId) && (
      resource.data.visibility == 'public' ||
      request.auth.uid in resource.data.memberUids
    ));
  // create/update/delete는 기존 규칙 유지
}
```

기존 채널 목록 쿼리(`where('memberUids','array-contains', uid)`)는 두 번째 조건을 만족하므로
그대로 안전하다. 공개 채널 둘러보기 화면을 만든다면 `where('visibility','==','public')`을 쓴다.

> **관리자라고 사이드바에 남의 비공개 채널이 뜨는 것은 아니다.** 채널 목록은 여전히
> `memberUids array-contains me`로 뽑으므로 관리자도 자기 채널만 본다. §10의 권한은 "필요할 때
> 접근할 수 있다"는 뜻이지 "항상 보인다"가 아니다. 관리자용 열람 화면을 따로 만들 때만
> `where('type','==','channel')` 쿼리를 쓴다.

> **`.get(field, default)` 패턴을 여기서는 쓰지 않는다.** `leftUids`에서 썼던 것처럼
> 필드 없는 옛 문서를 규칙에서 안전하게 읽는 방법이지만, **쿼리로 거를 때는 통하지 않는다** —
> 필드가 실제로 없는 문서는 `where` 조건에 아예 걸리지 않아 목록에서 조용히 사라진다.
> 그래서 §8처럼 백필을 먼저 하고 직접 접근을 쓴다.

---

## 6. 메시지 — 채널 하위 컬렉션

```
channels/{channelId}/messages/{messageId}
  authorUid, authorName
  body           // 평문
  createdAt
  attachments?   // 파일 첨부(v1 포함 여부는 P2에서 판단)
  refRequestId?  // "쪽지=포인터" — 캔버스를 가리킬 때
```

### 왜 `requests`와 달리 하위 컬렉션인가

**메시지는 항상 채널 하나 안에서만 조회된다.** 그러면 `channelId`가 경로에 고정되므로,
규칙이 `get()`으로 채널 문서를 읽어도 **쿼리 전체에 한 번**이면 된다 — §1의 횟수 제한에
걸리지 않고 안전성도 증명된다. 비정규화가 아예 필요 없다.

```javascript
// channelId가 경로에 고정돼 있으므로 아래 get()들은 쿼리당 1회로 끝난다
function channelDoc(schoolId, channelId) {
  return get(/databases/$(database)/documents/schools/$(schoolId)/channels/$(channelId)).data;
}

match /channels/{channelId}/messages/{messageId} {
  allow read: if isChannelMember(schoolId, channelId) ||
    // 학교 관리자는 업무 채널만 — DM은 제외한다(§10)
    (isSchoolAdmin(schoolId) && channelDoc(schoolId, channelId).type == 'channel');

  allow create: if isChannelMember(schoolId, channelId) &&
    request.resource.data.authorUid == request.auth.uid &&
    canPost(schoolId, channelId);          // postPolicy=='owner'면 채널 주인만

  allow update: if false;                   // 편집 화면 없음 — 댓글과 같은 판단
  allow delete: if isSchoolAdmin(schoolId) ||
    resource.data.authorUid == request.auth.uid;
}
```

반면 `requests`는 **채널을 가로질러 조회되고**(뱃지 계산·검색), **채널 없는 글도 존재한다.**
그래서 최상위를 유지하고 비정규화(§3)를 쓴다. **이 비대칭은 의도된 설계다.**

### 본문은 평문으로 시작한다

`comments.js`가 같은 이유로 평문이다 — 서식을 허용하면 편집기·정화기·저장 형식이 한 벌 더
늘고, `sanitizeHtml`을 한 군데라도 빠뜨리면 그대로 XSS가 된다. 대화 메시지는 짧으므로 평문으로
시작하고, 필요해지면 그때 올린다.

### 스레드는 v1에 없다

평면 목록으로 시작한다. 스레드를 넣으면 읽음 처리·알림·검색이 전부 두 겹이 된다.
필드 추가는 Firestore에서 나중에도 쉬우므로 미루는 비용이 작다.

---

## 7. 읽음 처리 — 마커 방식

메시지마다 `readBy` 배열을 두면 메시지 한 건당 쓰기가 참여자 수만큼 일어나고 배열이 무한히
자란다. 대신 **사람마다 "마지막으로 읽은 시각" 하나**만 둔다.

```
users/{uid}
  channelReads: { [channelId]: timestamp }
```

안읽음 표시는 이 비교로 끝난다:

```
channel.lastMessageAt > channelReads[channel.id]
```

**추가 읽기가 0회다.** 채널 목록(이미 구독 중)과 내 `users` 문서(이미 읽고 있음)만으로 사이드바
전체 뱃지가 계산된다. 개인화 설정(즐겨찾기·섹션·mute)도 같은 문서에 들어가므로 자리도 일관된다.

정확한 **개수**는 채널을 열 때 `getCountFromServer`로 세거나, v1에서는 점만 찍고 미룬다.

---

## 8. DM 중복 생성 방지 — 결정적 문서 ID

두 uid를 사전순으로 정렬해 이어붙인다.

```
채널 ID = 'dm_' + [uidA, uidB].sort().join('_')
```

양쪽이 같은 ID를 계산하므로 같은 상대와 DM이 두 개 생길 수 없다. 문서 ID만 봐도 DM임을 알 수
있어 디버깅에도 유리하다(기존 채널은 auto-ID라 충돌하지 않는다).

규칙에서도 검증할 수 있다:

```javascript
request.resource.data.type == 'dm' &&
request.resource.data.memberUids.size() == 2 &&
request.auth.uid in request.resource.data.memberUids &&
channelId == 'dm_' + request.resource.data.memberUids[0] + '_' +
                     request.resource.data.memberUids[1]
```

(클라이언트가 `memberUids`를 정렬해 넣는다는 전제. 규칙에는 정렬 함수가 없다.)

---

## 9. 마이그레이션

### 백필 대상

| 컬렉션 | 채울 값 |
|---|---|
| `channels` | `type: 'channel'`, `visibility: 'public'`, `postPolicy: 'members'` |
| `requests` | `visibility: 'school'` |

`functions/migrations/`에 선례가 있다(`migrateStudentsToWorkspaceId.js`).

### ⚠ 순서 — 백필이 규칙 배포보다 먼저다

규칙을 먼저 올리면 필드가 없는 기존 문서가 쿼리에서 통째로 사라진다(§5의 경고 참고).
**백필 완료 확인 → 규칙 배포 → 클라이언트 배포** 순으로 간다.

---

## 10. 관리자 접근 정책 (2026-08-24 확정)

| 주체 | 비공개 **채널** | **DM** | 근거 |
|---|---|---|---|
| **슈퍼 관리자**(시스템 운영자) | **못 봄** | **못 봄** | 학교 밖 사람이다. 다학교 확장 중이라 더욱 그렇다 |
| **학교 관리자**(교감·교장) | **볼 수 있음** | **못 봄** ★ | 학교 운영 책임자라 업무 채널 접근에는 정당성이 있다. 그러나 개인 간 사담까지는 아니다 |
| 일반 교사 | 멤버일 때만 | 당사자일 때만 | |

### ★ DM을 관리자 열람에서 제외하는 이유

"DM = 이름 없는 2인 비공개 채널"이라는 통합 설계 덕에 규칙이 한 벌로 끝나지만, **바로 그
때문에 "학교 관리자는 비공개 채널을 볼 수 있다"를 곧이곧대로 적용하면 관리자가 전 교직원의
1:1 대화를 열람할 수 있게 된다.** 이건 의도가 아니다.

현행 쪽지 규칙이 이미 그렇게 정해져 있다는 점도 근거다 — `firestore.rules`의
`personalNotices` read는 `isSuperAdmin() || 당사자(senderUid/recipientUid)`로,
**학교 관리자는 남의 쪽지를 못 읽는다.** DM은 쪽지를 잇는 자리이므로 같은 수준을 유지한다.

→ 규칙에서 `type == 'dm'`을 관리자 예외에서 명시적으로 배제한다(§5·§6).

### 슈퍼 관리자 제외의 한계 — 정직하게 적어둔다

Firestore 보안 규칙은 **Admin SDK와 Firebase 콘솔에는 적용되지 않는다.** 프로젝트 소유자는
규칙과 무관하게 데이터를 볼 수 있다. 따라서 이 변경은 "앱을 통한 접근 경로를 닫고 의도를
명시하는 것"이지 물리적 차단이 아니다. 그래도 의미는 있다 — 실수로 열람하는 경로가 사라지고,
나중에 다른 학교로 확장했을 때 "우리 규칙상 운영자는 못 보게 되어 있다"고 말할 근거가 된다.

### 곁가지 — 기존 쪽지의 슈퍼 관리자 권한

현행 `personalNotices`는 슈퍼 관리자가 읽을 수 있다. 위 결정(슈퍼 관리자는 사적 대화를 못 봄)과
어긋나므로, P7에서 쪽지를 동결할 때 이 권한도 함께 정리하는 것이 일관된다. 우선순위는 낮다.

### `RequestList.jsx:50`(관리자 전용 전체 목록)은 그대로 둬도 된다

학교 관리자가 모든 업무 글을 읽을 수 있으므로 조건 없는 쿼리가 계속 통과한다.
업무 글(`requests`)은 DM에 딸리지 않으므로 §2 표의 미결 항목이 해소됐다.

---

## 11. P1 착수 전 체크리스트

- [x] ~~§10 관리자 접근 정책 결정~~ — 확정(2026-08-24): 슈퍼 관리자 못 봄 / 학교 관리자는
      업무 채널만, DM 제외
- [ ] §1의 `get()` 횟수 제한을 Firebase 공식 문서로 재확인
- [ ] 첨부파일을 메시지 v1에 넣을지 판단(§6)
- [ ] 백필 스크립트 작성 → 실행 → 검증 (§9, 규칙 배포보다 먼저)
- [ ] 비공개 채널 유출 경로 점검 항목 확정 — 목록·직접 URL·검색·알림·관리자 화면

### 규칙 테스트로 반드시 막아야 할 것

`firestore.rules` 변경은 화면으로 검증하기 어렵다(막힌 게 안 보이므로). 아래는 에뮬레이터
규칙 테스트로 확인할 최소 항목이다.

| 시나리오 | 기대 |
|---|---|
| 비멤버 교사가 비공개 채널 문서를 직접 읽기 | 거부 |
| 비멤버 교사가 비공개 채널의 업무 글을 직접 읽기 | 거부 |
| 비멤버 교사가 조건 없는 `requests` 쿼리 | 거부(쿼리 전체 실패) |
| **학교 관리자가 남의 DM 메시지 읽기** | **거부** ★ |
| 학교 관리자가 자기가 속하지 않은 비공개 **업무** 채널 읽기 | 허용 |
| 슈퍼 관리자가 비공개 채널·메시지 읽기 | 거부 |
| 작성자가 자기 글의 `visibleUids`를 수정 | 거부(§3.5) |
| 아무나 `postPolicy: 'owner'` 채널에 메시지 작성 | 채널 주인만 허용 |
| 남의 uid를 넣은 DM 문서 ID로 채널 생성 | 거부(§8) |
