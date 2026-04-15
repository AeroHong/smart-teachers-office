const SHEET_NOTICE = '보강공지';
const SHEET_TEACHER = '교사명단';

const headerMap = {
  '보강ID': 'id', '날짜': 'date', '반': 'className', '교시': 'period',
  '결강교사': 'absentTeacher', '교과': 'subject', '상태': 'status',
  '신청교사': 'coverTeacher', '신청교사_계정': 'coverTeacherEmail'
};

function doGet(e) {
  if (!e || !e.parameter) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'no parameter' })).setMimeType(ContentService.MimeType.JSON);
  }

  const action = e.parameter.action || null;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NOTICE);
  const dataValues = sheet.getDataRange().getValues();
  const headers = dataValues[0];

  // 보강 등록 (관리자)
  if (action === 'create') {
    const newId = 'COV-' + new Date().getTime();
    sheet.appendRow([newId, e.parameter.date, e.parameter.className, e.parameter.period, e.parameter.absentTeacher, e.parameter.subject, '대기', '', '']);
    return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
  }

  // 보강 신청
  if (action === 'apply') {
    const statusIdx = headers.indexOf('상태');
    let updated = false;
    for (let i = 1; i < dataValues.length; i++) {
      if (dataValues[i][0] == e.parameter.id && dataValues[i][statusIdx] === '대기') {
        sheet.getRange(i + 1, statusIdx + 1).setValue('마감');
        sheet.getRange(i + 1, headers.indexOf('신청교사') + 1).setValue(e.parameter.name);
        sheet.getRange(i + 1, headers.indexOf('신청교사_계정') + 1).setValue(e.parameter.email);
        updated = true; break;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ success: updated })).setMimeType(ContentService.MimeType.JSON);
  }

  // 보강 신청 취소
  if (action === 'cancel') {
    const statusIdx = headers.indexOf('상태');
    const emailIdx = headers.indexOf('신청교사_계정');
    let updated = false;
    for (let i = 1; i < dataValues.length; i++) {
      if (dataValues[i][0] == e.parameter.id && dataValues[i][emailIdx] === e.parameter.email) {
        sheet.getRange(i + 1, statusIdx + 1).setValue('대기');
        sheet.getRange(i + 1, headers.indexOf('신청교사') + 1).setValue('');
        sheet.getRange(i + 1, emailIdx + 1).setValue('');
        updated = true; break;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ success: updated })).setMimeType(ContentService.MimeType.JSON);
  }

  // 권한 확인 및 자동 가입
  if (action === 'getRole') {
    const tSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TEACHER);
    const tData = tSheet.getDataRange().getValues();
    let role = '일반';
    let isExist = false;

    for (let i = 1; i < tData.length; i++) {
      if (tData[i][1] === e.parameter.email) {
        role = tData[i][2];
        isExist = true;
        break;
      }
    }

    if (!isExist && e.parameter.email && e.parameter.name) {
      const lastRow = tSheet.getLastRow();
      const lastCol = tSheet.getLastColumn();
      tSheet.appendRow([e.parameter.name, e.parameter.email, '일반']);
      if (lastRow > 1 && lastCol > 3) {
        const prevFormulaRange = tSheet.getRange(lastRow, 4, 1, lastCol - 3);
        const newFormulaRange = tSheet.getRange(lastRow + 1, 4, 1, lastCol - 3);
        prevFormulaRange.copyTo(newFormulaRange, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ role: role })).setMimeType(ContentService.MimeType.JSON);
  }

  // 교사명단 통계 (명예의 전당용)
  if (action === 'getStats') {
    const tSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TEACHER);
    const tData = tSheet.getDataRange().getDisplayValues();
    const rawHeaders = tData[0];
    const trimHeaders = rawHeaders.map(h => h.trim());

    const nameIdx  = trimHeaders.indexOf('교사명');
    const emailIdx = trimHeaders.indexOf('이메일');
    const monthIdx = trimHeaders.indexOf('이번달_보강횟수');
    const totalIdx = trimHeaders.indexOf('누적_보강횟수');

    const stats = [];
    for (let i = 1; i < tData.length; i++) {
      const name       = nameIdx  >= 0 ? (tData[i][nameIdx]?.trim()  || '') : '';
      const email      = emailIdx >= 0 ? (tData[i][emailIdx]?.trim() || '') : '';
      const totalCount = totalIdx >= 0 ? (parseInt(tData[i][totalIdx]) || 0) : 0;
      const monthCount = monthIdx >= 0 ? (parseInt(tData[i][monthIdx]) || 0) : 0;
      if (email && totalCount > 0) {
        stats.push({ name, email, totalCount, monthCount });
      }
    }
    stats.sort((a, b) => b.totalCount - a.totalCount);

    return ContentService.createTextOutput(JSON.stringify({
      stats,
      _debug: { headers: rawHeaders, indices: { nameIdx, emailIdx, totalIdx, monthIdx } }
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // 읽기 모드 (기본 — 보강 목록 반환)
  const displayData = sheet.getDataRange().getDisplayValues();
  const rows = displayData.slice(1);
  const result = rows.map(row => {
    let obj = {};
    displayData[0].forEach((header, index) => {
      const key = headerMap[header] || header;
      obj[key] = row[index] !== "" ? row[index] : "";
    });
    return obj;
  });

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
