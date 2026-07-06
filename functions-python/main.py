import json
import zipfile
from io import BytesIO
from urllib.parse import quote

from firebase_admin import initialize_app
from firebase_admin import auth as fb_auth
from firebase_functions import https_fn, options

from qr_pipeline import (
    build_student_docx,
    find_template_placeholders,
    merge_docx_bytes_list,
    parse_source_pdf,
    student_filename,
)

initialize_app()

KNOWN_FIELDS = {"이름", "학번", "반", "번호"}

# 학교별 데이터를 다루지 않는 순수 파일 변환 기능이라 역할/학교 체크 없이
# 로그인 여부만 확인한다. IAM은 공개 호출 가능 상태로 배포하고 이 토큰 검증이 실질적인 게이트다.
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "3600",
}


def _json_response(data, status=200):
    return https_fn.Response(
        json.dumps(data, ensure_ascii=False),
        status=status,
        headers={**CORS_HEADERS, "Content-Type": "application/json; charset=utf-8"},
    )


def _verify_auth(req):
    header = req.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    try:
        return fb_auth.verify_id_token(header[len("Bearer "):])
    except Exception:
        return None


@https_fn.on_request(region="asia-northeast3", memory=options.MemoryOption.MB_512, timeout_sec=60)
def qr_notice_parse(req: https_fn.Request) -> https_fn.Response:
    """PDF와/또는 양식 파일 중 온 것만 검사해서 미리보기 정보를 돌려준다."""
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=CORS_HEADERS)
    if req.method != "POST":
        return _json_response({"error": "허용되지 않은 메서드입니다."}, status=405)
    if _verify_auth(req) is None:
        return _json_response({"error": "로그인이 필요합니다."}, status=401)

    pdf_file = req.files.get("pdf")
    template_file = req.files.get("template")
    if pdf_file is None and template_file is None:
        return _json_response({"error": "pdf 또는 template 파일이 필요합니다."}, status=400)

    result = {}

    if pdf_file is not None:
        try:
            students, issues = parse_source_pdf(pdf_file.read())
        except Exception as e:
            return _json_response({"error": f"PDF 파싱 실패: {e}"}, status=400)
        result["students"] = {
            "count": len(students),
            "preview": [
                {"grade": s["grade"], "id": s["id"], "cls": s["cls"], "num": s["num"], "name": s["name"]}
                for s in students[:5]
            ],
            "issues": issues,
        }

    if template_file is not None:
        try:
            fields = find_template_placeholders(template_file.read())
        except Exception as e:
            return _json_response({"error": f"템플릿 확인 실패: {e}"}, status=400)
        result["template"] = {
            "fields": fields,
            "unknown": [f for f in fields if f not in KNOWN_FIELDS],
        }

    return _json_response(result)


@https_fn.on_request(region="asia-northeast3", memory=options.MemoryOption.GB_1, timeout_sec=300, max_instances=3)
def qr_notice_generate(req: https_fn.Request) -> https_fn.Response:
    """학생별 안내문 docx를 생성해 zip(개별 파일 + 통합 docx) 하나로 반환한다."""
    if req.method == "OPTIONS":
        return https_fn.Response("", status=204, headers=CORS_HEADERS)
    if req.method != "POST":
        return _json_response({"error": "허용되지 않은 메서드입니다."}, status=405)
    if _verify_auth(req) is None:
        return _json_response({"error": "로그인이 필요합니다."}, status=401)

    pdf_file = req.files.get("pdf")
    template_file = req.files.get("template")
    if pdf_file is None or template_file is None:
        return _json_response({"error": "PDF와 양식 파일이 모두 필요합니다."}, status=400)

    template_bytes = template_file.read()

    try:
        students, issues = parse_source_pdf(pdf_file.read())
    except Exception as e:
        return _json_response({"error": f"PDF 파싱 실패: {e}"}, status=400)

    if not students:
        return _json_response({"error": "인식된 학생이 없습니다."}, status=400)

    docx_list = []
    zip_buf = BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for s in students:
            try:
                docx_bytes = build_student_docx(template_bytes, s)
            except Exception as e:
                return _json_response({"error": f"{s['id']}_{s['name']} 생성 실패: {e}"}, status=400)
            docx_list.append(docx_bytes)
            zf.writestr(student_filename(s, "docx"), docx_bytes)

        merged_bytes = merge_docx_bytes_list(docx_list)
        grades = sorted({s["grade"] for s in students})
        grade_label = ",".join(str(g) for g in grades)
        zf.writestr(f"전체_안내문_통합({grade_label}학년).docx", merged_bytes)

    filename = f"개인별_안내문({grade_label}학년).zip"

    return https_fn.Response(
        zip_buf.getvalue(),
        status=200,
        headers={
            **CORS_HEADERS,
            "Content-Type": "application/zip",
            "Access-Control-Expose-Headers": "X-File-Name",
            "X-File-Name": quote(filename),
        },
    )
