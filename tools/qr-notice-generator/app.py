import zipfile
from io import BytesIO

import streamlit as st

from qr_pipeline import build_student_docx, find_template_placeholders, merge_docx_bytes_list, parse_source_pdf, student_filename

st.set_page_config(page_title="QR 안내문 생성기", page_icon="\U0001F4C4")
st.title("QR 개인별 안내문 생성기")
st.caption("QR 그리드 PDF와 안내문 양식(docx)을 업로드하면 학생별 안내문을 자동 생성합니다.")

KNOWN_FIELDS = {"이름", "학번", "반", "번호"}

pdf_file = st.file_uploader("① QR 그리드 PDF 업로드", type=["pdf"])
template_file = st.file_uploader("② 안내문 양식 업로드 (.docx)", type=["docx"])

students = None
if pdf_file is not None:
    try:
        students, issues = parse_source_pdf(pdf_file.getvalue())
    except Exception as e:
        st.error(f"PDF 파싱 실패: {e}")

if students is not None:
    st.success(f"학생 {len(students)}명 인식 완료")
    preview_rows = [
        {"학년": s["grade"], "학번": s["id"], "반": s["cls"], "번호": s["num"], "이름": s["name"]}
        for s in students[:5]
    ]
    st.dataframe(preview_rows, hide_index=True)
    if len(students) > 5:
        st.caption(f"...외 {len(students) - 5}명")

    if issues:
        st.warning(
            f"{len(issues)}건은 이름을 인식하지 못해 생성 대상에서 제외됩니다. "
            "원본 PDF를 확인해 이름을 채운 뒤 다시 업로드해주세요."
        )
        st.dataframe(
            [{"페이지": it["page"], "학번": it["id"] or "?", "사유": it["reason"]} for it in issues],
            hide_index=True,
        )

template_bytes = None
if template_file is not None:
    template_bytes = template_file.getvalue()
    try:
        fields = find_template_placeholders(template_bytes)
        unknown = [f for f in fields if f not in KNOWN_FIELDS]
        st.write("템플릿에서 발견된 자동 입력 필드:", ", ".join(f"{{{{{f}}}}}" for f in fields) if fields else "없음")
        if unknown:
            st.warning(f"알 수 없는 필드가 있습니다 (오타 가능성): {', '.join(unknown)}. 지원 필드: {', '.join(KNOWN_FIELDS)}")
    except Exception as e:
        st.error(f"템플릿 확인 실패: {e}")
        template_bytes = None

if students is not None and template_bytes is not None:
    if st.button("전체 문서 생성", type="primary"):
        progress = st.progress(0.0, text="생성 중...")
        docx_list = []
        zip_buf = BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for i, s in enumerate(students):
                try:
                    docx_bytes = build_student_docx(template_bytes, s)
                except Exception as e:
                    st.error(f"{s['id']}_{s['name']} 생성 실패: {e}")
                    st.stop()
                docx_list.append(docx_bytes)
                zf.writestr(student_filename(s, "docx"), docx_bytes)
                progress.progress((i + 1) / len(students), text=f"{i + 1}/{len(students)} 생성 중...")

        merged_bytes = merge_docx_bytes_list(docx_list)
        progress.progress(1.0, text="완료")

        grades = sorted({s["grade"] for s in students})
        grade_label = ",".join(str(g) for g in grades)

        # 다운로드 버튼 클릭 시 스크립트가 재실행되므로, 결과를 session_state에 남겨
        # 버튼이 사라지지 않고 계속 다운로드 가능하도록 유지한다.
        st.session_state["result"] = {
            "count": len(students),
            "zip_bytes": zip_buf.getvalue(),
            "merged_bytes": merged_bytes,
            "grade_label": grade_label,
        }

    result = st.session_state.get("result")
    if result is not None:
        st.success(f"{result['count']}명분 문서 생성 완료")
        col1, col2 = st.columns(2)
        with col1:
            st.download_button(
                "개인별 파일 ZIP 다운로드",
                data=result["zip_bytes"],
                file_name=f"개인별_안내문({result['grade_label']}학년).zip",
                mime="application/zip",
            )
        with col2:
            st.download_button(
                "인쇄용 통합 docx 다운로드",
                data=result["merged_bytes"],
                file_name=f"전체_안내문_통합({result['grade_label']}학년).docx",
                mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )

st.divider()
st.caption(
    "⚠️ QR코드는 학생 개인별 인증 링크입니다. 생성된 파일과 이 화면은 외부에 공유하지 마세요."
)
