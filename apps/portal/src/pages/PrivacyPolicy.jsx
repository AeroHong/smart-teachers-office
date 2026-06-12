import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import { Link } from 'react-router-dom'

const SECTIONS = [
  {
    title: '제1조 (개인정보의 수집 항목 및 수집 방법)',
    content: [
      {
        subtitle: '교사·교직원',
        items: ['이름', '이메일 주소', '프로필 사진 (Google 계정 연동 시)'],
      },
      {
        subtitle: '학생',
        items: ['학번', '이름', '학년·반·번호', '출결 기록 (출석·지각·결석, 체크인 일시, 방법)'],
      },
      {
        subtitle: '수집 방법',
        items: [
          'Google OAuth 로그인 연동 (교사·교직원)',
          '학교 관리자의 명단 일괄 등록 (학생)',
          'QR 코드 체크인 시 자동 기록 (출결)',
        ],
      },
    ],
  },
  {
    title: '제2조 (개인정보의 수집·이용 목적)',
    content: [
      {
        subtitle: '스마트 출결 시스템',
        items: ['QR 코드 기반 학생 출석 확인', '지각·결석 자동 처리 및 통계 제공', '교사의 출결 현황 관리'],
      },
      {
        subtitle: '보강 신청 시스템',
        items: ['교사 결강 및 보강 현황 등록·조회', '보강 담당 교사 배정 관리'],
      },
      {
        subtitle: '연수 서명부 시스템',
        items: ['연수·워크숍 참석 대상자 명단 관리', '디지털 서명 수집 및 보관'],
      },
    ],
  },
  {
    title: '제3조 (개인정보의 보유 및 이용 기간)',
    content: [
      {
        items: [
          '학교 운영 기간 동안 보유하며, 해당 학교의 서비스 종료 또는 회원 탈퇴 시 즉시 파기합니다.',
          '관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 별도 보관합니다.',
        ],
      },
    ],
  },
  {
    title: '제4조 (개인정보의 제3자 제공)',
    content: [
      {
        items: [
          '원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다.',
          '단, 이용자의 동의가 있거나 법령에 의한 경우는 예외로 합니다.',
        ],
      },
    ],
  },
  {
    title: '제4조의2 (개인정보의 안전성 확보조치)',
    content: [
      {
        items: [
          '서비스는 개인정보보호법 제29조 및 「개인정보의 안전성 확보조치 기준」에 따라 개인정보가 분실·도난·유출·위조·변조 또는 훼손되지 않도록 다음과 같은 안전성 확보조치를 이행합니다.',
        ],
      },
      {
        subtitle: '1. 관리적 조치',
        items: [
          '개인정보 접근권한을 담당자에 한하여 최소한으로 부여하며, 퇴직·이동 시 즉시 권한을 회수합니다.',
          '개인정보 처리 직원에 대해 정기적으로 보안 교육을 실시합니다.',
          '개인정보 처리방침을 수립하고 내부 관리계획에 따라 운영합니다.',
        ],
      },
      {
        subtitle: '2. 기술적 조치',
        items: [
          '접근 통제: Firebase Authentication 및 Firebase Security Rules를 통해 인가된 사용자만 데이터에 접근할 수 있도록 제한합니다.',
          '전송 구간 암호화: 모든 데이터는 TLS(HTTPS)로 암호화하여 송수신합니다.',
          '저장 데이터 보호: Cloud Firestore에 저장되는 데이터는 Google의 저장 시 암호화(Encryption at Rest) 정책에 따라 보호됩니다.',
          '접근 로그 관리: Firebase Console을 통해 데이터 접근 및 변경 이력을 기록·관리합니다.',
          '취약점 관리: 사용 중인 라이브러리 및 프레임워크를 최신 보안 패치 버전으로 유지합니다.',
        ],
      },
      {
        subtitle: '3. 물리적 조치',
        items: [
          '개인정보가 저장되는 서버는 Google Cloud Platform 데이터센터에서 운영되며, Google LLC의 물리적 보안 정책에 따라 관리됩니다.',
          '서비스 운영 단말(관리자 PC 등)은 비인가자의 접근을 방지하기 위한 잠금 조치를 적용합니다.',
        ],
      },
    ],
  },
  {
    title: '제5조 (개인정보 처리 위탁)',
    content: [
      {
        subtitle: 'Google Firebase (Google LLC, 미국)',
        items: [
          'Firebase Authentication — 교사 계정 인증',
          'Cloud Firestore — 학생·출결·보강·연수 데이터 저장',
          'Firebase Hosting — 웹 서비스 제공',
          'Cloud Functions — 출결 자동 마감 등 서버 로직 처리',
        ],
      },
      {
        items: [
          'Google Firebase의 개인정보 처리방침: https://firebase.google.com/support/privacy',
        ],
      },
    ],
  },
  {
    title: '제6조 (이용자의 권리 및 행사 방법)',
    content: [
      {
        items: [
          '이용자는 언제든지 자신의 개인정보에 대한 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다.',
          '요청은 아래 개인정보 보호 책임자에게 문의하시면 지체 없이 조치합니다.',
          '만 14세 미만 아동의 경우 법정 대리인이 권리를 행사할 수 있습니다.',
        ],
      },
    ],
  },
  {
    title: '제7조 (개인정보의 파기)',
    content: [
      {
        items: [
          '개인정보 보유 기간이 경과하거나 처리 목적이 달성되면 지체 없이 파기합니다.',
          '전자적 파일 형태의 정보는 복구 불가능한 방법으로 영구 삭제합니다.',
        ],
      },
    ],
  },
  {
    title: '제8조 (개인정보 보호 책임자)',
    content: [
      {
        items: [
          '소속: 선유고등학교',
          '담당: 홍창기',
          '이메일: hckgood@gmail.com',
          '문의: 카카오 오픈채팅 (https://open.kakao.com/o/gviUMYvi, 참여코드 0124)',
        ],
      },
    ],
  },
]

export default function PrivacyPolicy() {
  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', px: { xs: 3, md: 6 }, py: 6 }}>
      {/* 헤더 */}
      <Box sx={{ mb: 4 }}>
        <Box
          component={Link}
          to="/"
          sx={{ fontSize: '0.82rem', color: '#94a3b8', textDecoration: 'none', '&:hover': { color: '#4f46e5' } }}
        >
          ← 홈으로
        </Box>
        <Typography variant="h4" fontWeight={800} mt={2} mb={0.5} color="#1e293b">
          개인정보처리방침
        </Typography>
        <Typography variant="body2" color="text.secondary">
          스마트 교무실 (smart-school-kr.web.app)
        </Typography>
        <Typography variant="body2" color="text.secondary" mt={0.5}>
          시행일: 2026년 6월 10일
        </Typography>
      </Box>

      <Divider sx={{ mb: 4 }} />

      {/* 개요 */}
      <Box sx={{ mb: 4, p: 2.5, bgcolor: '#f8fafc', borderRadius: 2, borderLeft: '4px solid #4f46e5' }}>
        <Typography variant="body2" color="text.secondary" lineHeight={1.9}>
          선유고등학교 스마트 교무실(이하 "서비스")은 개인정보보호법 및 관련 법령에 따라 이용자의 개인정보를 보호하고,
          이와 관련한 고충을 신속하고 원활하게 처리하기 위하여 다음과 같이 개인정보처리방침을 수립·공개합니다.
        </Typography>
      </Box>

      {/* 본문 섹션들 */}
      {SECTIONS.map((section, si) => (
        <Box key={si} sx={{ mb: 4 }}>
          <Typography variant="h6" fontWeight={700} mb={2} color="#1e293b" sx={{ fontSize: '1rem' }}>
            {section.title}
          </Typography>
          {section.content.map((block, bi) => (
            <Box key={bi} sx={{ mb: 2, pl: block.subtitle ? 0 : 1 }}>
              {block.subtitle && (
                <Typography sx={{ fontSize: '0.88rem', fontWeight: 600, color: '#475569', mb: 0.75 }}>
                  ▸ {block.subtitle}
                </Typography>
              )}
              <Box sx={{ pl: block.subtitle ? 2 : 0 }}>
                {block.items.map((item, ii) => (
                  <Typography key={ii} sx={{ fontSize: '0.88rem', color: '#64748b', lineHeight: 2, display: 'flex', gap: 1 }}>
                    <span style={{ color: '#cbd5e1', flexShrink: 0 }}>·</span>
                    <span>{item}</span>
                  </Typography>
                ))}
              </Box>
            </Box>
          ))}
          {si < SECTIONS.length - 1 && <Divider sx={{ mt: 3 }} />}
        </Box>
      ))}

      {/* 하단 */}
      <Box sx={{ mt: 6, pt: 3, borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
        <Typography fontSize="0.78rem" color="text.disabled">
          본 방침은 2026년 6월 10일부터 시행됩니다.
        </Typography>
        <Typography fontSize="0.78rem" color="text.disabled" mt={0.5}>
          Designed &amp; Built by{' '}
          <Box
            component="a"
            href="https://github.com/AeroHong"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: '#7c3aed', textDecoration: 'none', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}
          >
            @AeroHong
          </Box>
          {' '}· 선유고등학교
        </Typography>
      </Box>
    </Box>
  )
}
