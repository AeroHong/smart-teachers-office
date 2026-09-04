# 상호명·기관명 사전 — 정부 공개데이터 스냅샷

`universityNames.json`, `publicAgencyNames.json`은 "생기부 상호명·기관명 탐지 처리 방침"
(2026-09-04) §4.1 공식 데이터를 받아 만든 정적 스냅샷이다. 매번 실시간으로 API를 호출하지
않고, 빌드에 포함되는 JSON 파일로 둔다(학교마다 매번 외부 API를 부르지 않아도 되고,
정부 사이트가 느리거나 막혀도 점검 기능 자체는 항상 동작한다).

## universityNames.json — 전국대학및전문대학정보표준데이터

- 출처: 공공데이터포털 https://www.data.go.kr/data/15107736/standard.do (제공: 한국대학교육협의회)
- 인증키 불필요. 다만 실제 데이터 다운로드는 문서화된 API가 아니라 사이트 내부 AJAX
  엔드포인트를 그대로 쓴다(2026-09-04 기준):
  1. `GET https://www.data.go.kr/download/columList.json?pk=15107736&ext=CSV`
     (반드시 `Referer: https://www.data.go.kr/data/15107736/standard.do` 헤더 필요 —
     없으면 404) → `totalCount`, `tableVO.svcTableNm`, `tableVO.colNmList` 확인.
  2. `GET https://www.data.go.kr/download/standard.json?publicDataPk=15107736` +
     쿼리파라미터 `colNmList`(컬럼마다 반복), `totalCount`, `svcTableNm`, `perPage`,
     `page`(**1부터 시작** — 0으로 주면 빈 배열이 온다. 이걸 몰라서 한참 헤맴) → 실제 행 데이터.
- 원본은 UNIV_SE_NM이 "대학"/"전문대학"/"대학원" 세 종류로 나뉘어 있고, "대학원"은
  같은 대학의 개별 대학원 과정을 별도 행으로 나열한 것(예: "OO대학교 특수전문대학원")이라
  세특 문장에 그대로 등장할 표현이 아니다 — UNIV_SE_NM이 "대학"·"전문대학"인 행만
  걸러 학교명(SCHL_NM) 기준으로 중복 제거했다(1995행 → 442행 → 고유 418개).
- 이 내부 엔드포인트는 비공식이라 언제든 바뀔 수 있다. 안 되면 data.go.kr의 정식
  Open API 탭으로 전환해야 하고, 그건 인증키(서비스키)가 필요하다.

## publicAgencyNames.json — ALIO 공공기관 현황

- 출처: ALIO 공공기관 경영정보 공개시스템 https://alio.go.kr/guide/publicAgencyStatus.do
- 인증키 불필요. 다운로드 URL:
  `GET https://alio.go.kr/download/statisticsDown.json?f=<파일명>.xlsx&s=<저장파일명>.xlsx`
  (예: `f=일반현황_2026.xlsx`, 둘 다 URL 인코딩 필요) — 매년 갱신되는 페이지라 연도가
  붙은 파일명을 그 해 값으로 바꿔야 한다(사이트에서 "2026년 공공기관 일반현황" 문구로
  현재 연도 확인).
- 엑셀 4행부터 데이터 시작(1~3행은 안내문·2단 헤더), B열=기관명, C열=기관유형,
  D열=주무부처. 357개 기관, 중복 없음.

## 이번에 못 받아온 것

- **공정거래위원회 통신판매사업자정보파일**(일반 상호 대규모 DB, 방침 §4.1-5) —
  data.go.kr 다운로드 페이지에 캡차(CAPTCHA)가 걸려 있어 자동으로 받을 수 없다.
  사람이 브라우저에서 캡차를 풀고 직접 받아야 한다.
- **OpenDART 고유번호**(공시대상기업) — opendart.fss.or.kr 인증키(crtfc_key) 필요.
  회원가입 후 무료 발급.
- **금융위원회 KRX상장종목정보**(상장기업) — data.go.kr의 Open API 방식(URL이
  `openapi.do`로 끝남)이라 서비스키 발급이 필요하다. 참고로 KRX 자체 사이트
  (kind.krx.co.kr)의 무료 공개 다운로드도 시도했으나, 학교 자체 네트워크 필터가
  "투자정보" 카테고리로 분류해 차단하고 있어(선유고 프록시 정책) 이 환경에서는
  접근 자체가 안 됐다 — 인증키 문제와는 별개의 이슈.

## 갱신 방법

매년 정보가 바뀌므로(대학 신설/폐교, 공공기관 지정 변경 등) 주기적으로 다시 받아
`universityNames.json`/`publicAgencyNames.json`을 덮어써야 한다. 위 두 엔드포인트를
그대로 다시 호출해 새로 받은 뒤, 이 폴더의 JSON을 교체하고 빌드·배포하면 된다.
