# 스마트 교무실 보안 점검 보고서

- **대상 시스템**: 스마트 교무실 (https://smart-school-kr.web.app)
- **점검 일시**: 2026-06-10
- **점검 범위**: 프론트엔드 번들 분석, Firestore Security Rules 검토, HTTP 보안 헤더, 라우트 접근 제어

---

## 목차

1. [종합 평가](#1-종합-평가)
2. [Critical — 즉시 수정](#2-critical--즉시-수정)
3. [High — 조속히 수정](#3-high--조속히-수정)
4. [Medium — 개선 권고](#4-medium--개선-권고)
5. [양호한 항목](#5-양호한-항목)
6. [수정 코드 예시](#6-수정-코드-예시)

---

## 1. 종합 평가

| 등급 | 항목 수 | 비고 |
|------|---------|------|
| 🔴 Critical | 1 | 즉시 조치 필요 |
| 🟠 High | 3 | 조속히 수정 |
| 🟡 Medium | 4 | 배포 전 처리 권고 |
| ✅ 양호 | 6 | 유지 |

> 별도 백엔드 API 서버 없이 Firebase 단일 구조를 사용하고 있어 공격 면적 자체는 작은 편입니다.
> 다만 Firestore Rules 일부 허점과 보안 헤더 미설정이 보완이 필요한 상태입니다.

---

## 2. Critical — 즉시 수정

### C-1. `isSuperAdmin()` 이메일 하드코딩

**위치**: `firestore.rules` > `isSuperAdmin()`

```js
// 현재 (취약)
function isSuperAdmin() {
  return isSignedIn() && request.auth.token.email == 'hckgood@gmail.com';
}
```

**문제점**
- 이메일은 Firebase Auth에서 변경 가능한 값
- 구글 계정 탈취 시 슈퍼관리자 권한 전체 노출
- 소스 번들에 관리자 이메일 주소가 평문으로 노출됨

**개선 방향**: Firebase Admin SDK의 Custom Claims 사용

```js
// 개선 (firestore.rules)
function isSuperAdmin() {
  return isSignedIn() && request.auth.token.superAdmin == true;
}
```

```js
// 서버(Cloud Functions 또는 Admin SDK)에서 1회 설정
const admin = require('firebase-admin');
await admin.auth().setCustomUserClaims(uid, { superAdmin: true });
```

---

## 3. High — 조속히 수정

### H-1. `/schools` — 로그인만 하면 전체 학교 데이터 읽기 가능

**위치**: `firestore.rules` > `match /schools/{schoolId}`

```js
// 현재 (취약)
allow read: if isSuperAdmin() || isTeacher(schoolId) || isSignedIn();
//                                                      ^^^^^^^^^
//                               isSignedIn() 조건이 OR로 걸려 모든 학교 데이터 노출
```

**문제점**
- 로그인한 사람이면 누구나 모든 학교 문서를 읽을 수 있음
- A학교 교사가 B학교 학생 명단, 보강 현황 등 조회 가능

```js
// 개선
allow get: if isSuperAdmin()
  || isTeacher(schoolId)
  || (isSignedIn() && !exists(/databases/$(database)/documents/users/$(request.auth.uid)));
  // schoolSetup 미완료 사용자만 학교 검색 허용 (필요 시)
allow list: if isSuperAdmin() || isTeacher(schoolId);
```

---

### H-2. `attendanceLogs` — QR 토큰만 있으면 비로그인 쓰기 가능

**위치**: `firestore.rules` > `match /attendanceLogs/{logId}`

```js
// 현재 (취약)
allow write: if isSuperAdmin() || isTeacher(schoolId) ||
  get(...).data.qrToken == request.resource.data.qrToken ||
  get(...).data.liveToken == request.resource.data.qrToken;
// 로그인 없이 qrToken 값만 알면 출결 로그 쓰기 가능
```

**문제점**
- QR 이미지 캡처·공유 시 출결 위조 가능
- 비로그인 상태에서도 출결 기록 생성 가능

```js
// 개선 — isSignedIn() 조건 추가
allow write: if isSuperAdmin() || isTeacher(schoolId) ||
  (isSignedIn() && (
    get(/databases/$(database)/documents/schools/$(schoolId)/events/$(eventId)).data.qrToken
      == request.resource.data.qrToken ||
    get(/databases/$(database)/documents/schools/$(schoolId)/events/$(eventId)).data.liveToken
      == request.resource.data.qrToken
  ));
```

---

### H-3. HTTP 보안 헤더 미설정

**위치**: `firebase.json` > `hosting.headers`

| 헤더 | 현재 상태 | 위험 |
|------|-----------|------|
| `X-Frame-Options` | ❌ 없음 | Clickjacking |
| `X-Content-Type-Options` | ❌ 없음 | MIME Sniffing |
| `Content-Security-Policy` | ❌ 없음 | XSS |
| `Strict-Transport-Security` | ❌ 없음 | HTTPS 강제 미적용 |
| `Referrer-Policy` | ❌ 없음 | 정보 유출 |

```json
// firebase.json 에 추가
{
  "hosting": {
    "headers": [
      {
        "source": "**",
        "headers": [
          { "key": "X-Frame-Options", "value": "DENY" },
          { "key": "X-Content-Type-Options", "value": "nosniff" },
          { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains" },
          { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
          { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
        ]
      }
    ]
  }
}
```

---

## 4. Medium — 개선 권고

### M-1. Firebase API Key 번들 하드코딩

**위치**: `src/firebase.ts` 또는 유사 파일

```js
// 현재 — 번들에 평문 노출
const firebaseConfig = {
  apiKey: "AIzaSyCQCOBsWEGZehWdSTudnxyL6v_AQBdCqIY",
  projectId: "seonyoo-system",
  authDomain: "seonyoo-system.firebaseapp.com",
  // ...
};
```

**참고**: Firebase Web API Key 자체는 클라이언트 노출이 원칙적으로 허용된 구조입니다.
단, Firestore Rules와 Auth 도메인 제한이 정상이어야 안전합니다.

**권장 조치**
1. `.env` 파일로 분리 (`VITE_FIREBASE_API_KEY` 등) — 소스코드/Git 관리 목적
2. Firebase Console → Authentication → 승인된 도메인 목록 확인
3. Firebase Console → API 제한 설정 (HTTP 리퍼러 제한)

---

### M-2. 게스트 학교 전환 시 role 변경 무제한

**위치**: `firestore.rules` > `match /users/{uid}` > `allow update`

```js
// 현재 (취약)
(isSignedIn() && request.auth.uid == uid &&
 resource.data.schoolId.matches('guest_.*'));
// guest_ 소속이면 role을 admin, teacher 등 무엇이든 바꿀 수 있음
```

```js
// 개선 — 전환 허용 role 명시
(isSignedIn() && request.auth.uid == uid &&
 resource.data.schoolId.matches('guest_.*') &&
 request.resource.data.role in ['pending', 'teacher']);
```

---

### M-3. `preApproved` — 사전 등록 이메일 목록 전체 노출

**위치**: `firestore.rules` > `match /preApproved/{emailId}`

```js
// 현재 (취약)
allow read: if isSignedIn();
// 로그인한 누구나 모든 사전 등록 이메일 목록 조회 가능
```

```js
// 개선 — 본인 이메일 문서만 읽기
allow get: if isSignedIn() && emailId == request.auth.token.email;
allow list: if isSuperAdmin();
```

---

### M-4. `getUserData()` 중복 호출 — 비용 및 성능

**위치**: `firestore.rules` > `function getUserData()`

`isAdmin()`, `isTeacher()`, `isStudent()` 등 대부분의 함수에서 `getUserData()`를 호출하고 있어
단일 요청에서 Firestore 읽기가 중복 발생할 수 있습니다.

**권장 조치**: `role`과 `schoolId`를 Custom Claims에 포함시키면
`request.auth.token.role`, `request.auth.token.schoolId`로 직접 읽을 수 있어
DB 읽기 없이 빠르고 비용도 절감됩니다.

```js
// Custom Claims 적용 후 함수 예시
function isTeacher(schoolId) {
  return isSignedIn()
    && request.auth.token.role in ['teacher', 'admin', 'school_admin']
    && request.auth.token.schoolId == schoolId;
}
```

---

## 5. 양호한 항목

| 항목 | 평가 |
|------|------|
| HTTPS 적용 | ✅ |
| 비밀번호 직접 로그인 없음 (Google OAuth 전용) | ✅ |
| `/super-admin` 접근 시 클라이언트 인증 가드 작동 | ✅ |
| `users` 문서 — 본인 외 읽기 차단 | ✅ |
| `trainings` 삭제 — `createdBy` 본인 확인 | ✅ |
| `events` QR 체크인 `allow get: if true` — 의도적 설계, 주석 명시 | ✅ |
| 별도 백엔드 API 서버 없음 (공격 면적 최소화) | ✅ |
| 소스코드 내 비밀번호 하드코딩 없음 | ✅ |

---

## 6. 수정 코드 예시

### 6-1. Firestore Rules 최종 개선본 (변경 부분만)

```js
// [C-1] isSuperAdmin — Custom Claims 방식으로 교체
function isSuperAdmin() {
  return isSignedIn() && request.auth.token.superAdmin == true;
}

// [H-1] /schools read 범위 축소
match /schools/{schoolId} {
  allow get: if isSuperAdmin() || isTeacher(schoolId) || isSignedIn();
  // TODO: SchoolSetup 완료 후 isSignedIn() 조건 제거하고 isTeacher(schoolId)만 남기기
  allow list: if isSuperAdmin() || isTeacher(schoolId);
  allow create: if isSuperAdmin() ||
    (isSignedIn() && schoolId.matches('school-.*') && request.resource.data.createdBy == request.auth.token.email) ||
    (isSignedIn() && schoolId.matches('guest_.*') && request.resource.data.ownerUid == request.auth.uid);
  allow update, delete: if isSuperAdmin();
  // ... (하위 match 동일)
}

// [H-2] attendanceLogs write — isSignedIn() 추가
match /attendanceLogs/{logId} {
  allow read: if isSuperAdmin() || isTeacher(schoolId);
  allow get: if isStudent(schoolId) &&
    (resource == null || resource.data.studentId == getUserData().studentId);
  allow write: if isSuperAdmin() || isTeacher(schoolId) ||
    (isSignedIn() && (
      get(/databases/$(database)/documents/schools/$(schoolId)/events/$(eventId)).data.qrToken
        == request.resource.data.qrToken ||
      get(/databases/$(database)/documents/schools/$(schoolId)/events/$(eventId)).data.liveToken
        == request.resource.data.qrToken
    ));
}

// [M-2] users 게스트 전환 role 제한
allow update: if isSuperAdmin() || isAdmin() ||
  (isSignedIn() && request.auth.uid == uid &&
   request.resource.data.role == resource.data.role &&
   request.resource.data.schoolId == resource.data.schoolId) ||
  (isSignedIn() && request.auth.uid == uid &&
   resource.data.schoolId.matches('guest_.*') &&
   request.resource.data.role in ['pending', 'teacher']);  // admin 제외

// [M-3] preApproved 본인 이메일만 읽기
match /preApproved/{emailId} {
  allow get: if isSignedIn() && emailId == request.auth.token.email;
  allow list: if isSuperAdmin();
  allow write: if isSuperAdmin() || isSchoolAdmin(schoolId);
}
```

### 6-2. firebase.json 보안 헤더 추가

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }],
    "headers": [
      {
        "source": "**",
        "headers": [
          { "key": "X-Frame-Options", "value": "DENY" },
          { "key": "X-Content-Type-Options", "value": "nosniff" },
          { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains" },
          { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
          { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
        ]
      },
      {
        "source": "/assets/**",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
        ]
      }
    ]
  }
}
```

---

*본 보고서는 공개 접근 가능한 범위 내에서 점검한 결과이며, 실제 데이터 접근이나 인증 우회 시도는 수행하지 않았습니다.*
