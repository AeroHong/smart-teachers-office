"""선택과목 분반 배정 솔버 (OR-Tools CP-SAT).

문제
- 학생마다 선택 과목이 여러 개(예: 5개) 있고, 각 과목은 여러 분반으로 열린다.
- 분반은 타임(A~E 등) 하나에 놓인다. 학생의 과목들은 서로 다른 타임에 들어가야 한다.
- 하드 제약: 미배정 0, 분반 수 고정, 타임당 교실 수 상한, (과목별 옵션) 같은 과목 분반은 서로 다른 타임,
  고정된 분반 타임·학생 배정 유지.
- 목표: 과목 안에서 분반 인원의 최대-최소 차이를 줄인다(최악 과목 우선, 다음 합계). 재탐색 때는 이전 배정과의 차이도 줄인다.

모델
- 같은 과목 조합을 고른 학생을 한 그룹으로 묶는다(고정이 걸린 학생은 따로 한 명짜리 그룹).
- y[g,s,k,t] = 그룹 g에서 과목 s의 k분반(타임 t)에 들어가는 학생 수. 분반 k가 타임 t에 있을 때만 0보다 클 수 있다.
- 그룹 g의 (과목 × 타임) 인원 행렬은 행 합 = 그룹 인원, 열 합 ≤ 그룹 인원.
  이 조건이면 쾨니그 정리에 따라 학생 한 명 한 명이 서로 다른 타임으로 들어가는 배치로 분해할 수 있다(decompose_group).

입력/출력 형식은 solve()의 docstring 참고. Firebase에 의존하지 않아 로컬에서도 바로 돌릴 수 있다.
"""

import time
from collections import defaultdict
from itertools import permutations

from ortools.sat.python import cp_model

BALANCE_WEIGHT_WORST = 10_000   # 최악 과목의 최대-최소 차이
BALANCE_WEIGHT_SUM = 100        # 과목별 차이 합
SIZE_LIMIT_WEIGHT = 10_000      # 분반 최대·최소 인원을 '가능하면 지킴'일 때, 넘거나 모자란 학생 1명당 벌점
CHANGE_WEIGHT = 1               # 이전 배정과 달라진 학생-과목 수
UNASSIGNED_WEIGHT = 1_000_000   # 진단 모드: 미배정 학생 1명당 벌점


def _norm_rooms(rooms, n_slots):
    if rooms is None:
        return [None] * n_slots
    if isinstance(rooms, (int, float)):
        return [int(rooms)] * n_slots
    return [None if r in (None, "") else int(r) for r in rooms]


def _build_groups(students, locked, subject_index, single=frozenset()):
    """학생 → 그룹. 고정 학생·분리 규칙 학생(single)은 한 명짜리 그룹, 나머지는 과목 조합별로 묶는다."""
    groups = []  # {subjects: [s...], members: [id...], locked: {s: k} | None}
    by_combo = {}
    for st in students:
        sid = str(st["id"])
        subs = sorted({subject_index[name] for name in st["subjects"]})
        if not subs:
            continue
        lock = locked.get(sid)
        if lock or sid in single:
            lk = {subject_index[name]: int(k) for name, k in (lock or {}).items() if name in subject_index}
            groups.append({"subjects": subs, "members": [sid], "locked": lk or None})
            continue
        key = tuple(subs)
        if key not in by_combo:
            by_combo[key] = len(groups)
            groups.append({"subjects": subs, "members": [], "locked": None})
        groups[by_combo[key]]["members"].append(sid)
    return groups


def _emit(log, kind, text, **extra):
    if log:
        try:
            log({"type": kind, "text": text, **extra})
        except Exception:
            pass


class _SolutionLogger(cp_model.CpSolverSolutionCallback):
    """해를 찾을 때마다(점점 좋아지는 해) 진행 로그로 알린다."""

    def __init__(self, log, worst, spreads, t0):
        super().__init__()
        self._log = log
        self._worst = worst
        self._spreads = spreads
        self._t0 = t0
        self.count = 0

    def on_solution_callback(self):
        self.count += 1
        w = self.Value(self._worst)
        total = sum(self.Value(d) for d in self._spreads)
        _emit(self._log, "solution", f"해 #{self.count} 발견 — 분반 편차 최대 {w}명, 편차 합계 {total}",
              n=self.count, worst=w, sum=total, t=round(time.time() - self._t0, 2))


def solve(data, log=None):
    """data:
    {
      "slots": ["A","B","C","D","E"],
      "rooms": 8 | [8,8,8,8,8] | None,          # 타임당 교실 수 상한
      "subjects": [{"name": "기하", "sections": 2, "distinctSlots": true,
                    "sectionSlots": {"0": 1}}],  # 분반 타임 고정(분반 번호 → 타임 번호)
      "students": [{"id": "10101", "subjects": ["기하", ...]}],
      "lockedAssignments": {"10101": {"기하": 0}},   # 학생 분반 고정(과목 → 분반 번호)
      "previous": {"10101": {"기하": 1}},            # 재탐색 기준: 과목 → 이전 타임 번호(선택)
      "timeLimit": 30,
      "allowUnassigned": false                       # true면 미배정 최소화 진단 모드
    }
    반환:
    {
      "status": "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN" | "INVALID",
      "message": str,
      "sections": [{"subject": name, "index": k, "slot": t, "size": n}],
      "assignments": {studentId: {subject: k}},
      "unassigned": [{"id": sid, "subjects": [...]}],   # 진단 모드에서만
      "stats": {"worstSpread": int, "spreadSum": int, "changes": int, "wallTime": float}
    }
    """
    slots = list(data.get("slots") or ["A", "B", "C", "D", "E"])
    T = len(slots)
    rooms = _norm_rooms(data.get("rooms"), T)
    subjects = data["subjects"]
    S = len(subjects)
    subject_index = {s["name"]: i for i, s in enumerate(subjects)}
    K = [int(s.get("sections") or 0) for s in subjects]
    distinct = [bool(s.get("distinctSlots", True)) for s in subjects]
    allow_unassigned = bool(data.get("allowUnassigned"))
    locked = {str(k): v for k, v in (data.get("lockedAssignments") or {}).items()}
    previous = {str(k): v for k, v in (data.get("previous") or {}).items()}

    # ── 입력 검사 ──
    problems = []
    students = []
    for st in data["students"]:
        names = [n for n in st.get("subjects", []) if n]
        unknown = [n for n in names if n not in subject_index]
        if unknown:
            problems.append(f"학생 {st['id']}: 알 수 없는 과목 {unknown}")
        if len(set(names)) > T:
            problems.append(f"학생 {st['id']}: 선택 과목 {len(set(names))}개가 그룹 {T}개보다 많음")
        students.append({"id": str(st["id"]), "subjects": [n for n in names if n in subject_index]})
    demand = [0] * S
    for st in students:
        for n in set(st["subjects"]):
            demand[subject_index[n]] += 1
    for i, s in enumerate(subjects):
        if demand[i] > 0 and K[i] < 1:
            problems.append(f"{s['name']}: 신청자 {demand[i]}명인데 분반 수가 0")
        if distinct[i] and K[i] > T:
            problems.append(f"{s['name']}: 분반 {K[i]}개를 서로 다른 그룹 {T}개에 둘 수 없음(같은 과목 다른 그룹 조건)")
    for i, s in enumerate(subjects):
        if not demand[i] or not K[i]:
            continue
        if data.get("maxMode") == "hard" and s.get("maxSize") and K[i] * int(s["maxSize"]) < demand[i]:
            problems.append(f"{s['name']}: 신청 {demand[i]}명을 {K[i]}분반 × 최대 {s['maxSize']}명에 담을 수 없음(최대 인원 '꼭 지킴')")
        if data.get("minMode") == "hard" and s.get("minSize") and K[i] >= 2 and K[i] * int(s["minSize"]) > demand[i]:
            problems.append(f"{s['name']}: 신청 {demand[i]}명으로 {K[i]}분반 × 최소 {s['minSize']}명을 채울 수 없음(최소 인원 '꼭 지킴')")
    if problems:
        return {"status": "INVALID", "message": "입력 오류", "problems": problems}

    # ── 분리 규칙: 함께 듣는 과목(분반 2개 이상)마다 같은 분반에 최대 1명 ──
    subs_of = {st["id"]: {subject_index[n] for n in st["subjects"]} for st in students}
    sep_rules = []      # [(학생들, [과목...])]
    sep_warn = []
    for ri, rule in enumerate(data.get("separations") or []):
        members = [str(x) for x in rule if str(x) in subs_of]
        if len(members) < 2:
            continue
        shared = set.intersection(*(subs_of[x] for x in members))
        cand = set()
        for sbj in shared:
            pair_cnt = sum(1 for x in members if sbj in subs_of[x])
            if K[sbj] < 2:
                sep_warn.append(f"분리 규칙 {ri + 1}: {subjects[sbj]['name']}은 1분반이라 분리할 수 없음")
                continue
            if pair_cnt > K[sbj]:
                problems_late = f"분리 규칙 {ri + 1}: {pair_cnt}명을 {subjects[sbj]['name']} {K[sbj]}분반에 모두 따로 둘 수 없음"
                return {"status": "INVALID", "message": "입력 오류", "problems": [problems_late]}
            cand.add(sbj)
        # 함께 듣는 과목이 아니어도, 규칙 학생 중 두 명 이상이 듣는 과목은 모두 분리
        for sbj in set().union(*(subs_of[x] for x in members)) - shared:
            takers = [x for x in members if sbj in subs_of[x]]
            if len(takers) >= 2:
                if K[sbj] < 2:
                    sep_warn.append(f"분리 규칙 {ri + 1}: {subjects[sbj]['name']}은 1분반이라 분리할 수 없음")
                elif len(takers) > K[sbj]:
                    return {"status": "INVALID", "message": "입력 오류",
                            "problems": [f"분리 규칙 {ri + 1}: {len(takers)}명을 {subjects[sbj]['name']} {K[sbj]}분반에 모두 따로 둘 수 없음"]}
                else:
                    cand.add(sbj)
        if cand:
            sep_rules.append((members, sorted(cand)))
    for w in sep_warn:
        _emit(log, "warn", w)
    single = frozenset(x for members, _ in sep_rules for x in members)

    groups = _build_groups(students, locked, subject_index, single)
    _emit(log, "info", f"학생 {len(students)}명을 같은 과목 조합끼리 {len(groups)}묶음으로 정리")
    _emit(log, "info", f"분반 {sum(K)}개를 그룹 {T}개({''.join(slots)})에 놓는 모델 만드는 중"
          + (f" · 고정 학생 {len(locked)}명" if locked else ""))

    m = cp_model.CpModel()

    # ── 분반 타임 x[s][k][t] ──
    x = [[[m.NewBoolVar(f"x_{s}_{k}_{t}") for t in range(T)] for k in range(K[s])] for s in range(S)]
    slot_of = [[None] * K[s] for s in range(S)]
    for s in range(S):
        fixed = {int(k): int(t) for k, t in (subjects[s].get("sectionSlots") or {}).items()}
        for k in range(K[s]):
            m.AddExactlyOne(x[s][k])
            sv = m.NewIntVar(0, T - 1, f"slot_{s}_{k}")
            m.Add(sv == sum(t * x[s][k][t] for t in range(T)))
            slot_of[s][k] = sv
            if k in fixed:
                m.Add(x[s][k][fixed[k]] == 1)
        if distinct[s]:
            for t in range(T):
                m.AddAtMostOne(x[s][k][t] for k in range(K[s]))
        # 대칭 깨기: 타임이 고정되지 않은 분반끼리는 타임 순서대로
        free = [k for k in range(K[s]) if k not in fixed]
        for a, b in zip(free, free[1:]):
            if distinct[s]:
                m.Add(slot_of[s][a] < slot_of[s][b])
            else:
                m.Add(slot_of[s][a] <= slot_of[s][b])
    for t in range(T):
        if rooms[t] is not None:
            m.Add(sum(x[s][k][t] for s in range(S) for k in range(K[s])) <= rooms[t])

    # 다른 안: avoid에 든 이전 안들과 (과목, 그룹) 배치가 minDiff곳 이상 달라야 한다
    avoid = data.get("avoid") or []
    if avoid:
        opened = [[None] * T for _ in range(S)]
        for s in range(S):
            for t in range(T):
                b = m.NewBoolVar(f"open_{s}_{t}")
                if K[s]:
                    m.AddMaxEquality(b, [x[s][k][t] for k in range(K[s])])
                else:
                    m.Add(b == 0)
                opened[s][t] = b
        min_diff = int(data.get("minDiff") or 3)
        for prev in avoid:
            pairs = {(subject_index[q["subject"]], int(q["slot"])) for q in prev
                     if q.get("subject") in subject_index and q.get("slot") is not None and 0 <= int(q["slot"]) < T}
            if pairs:
                m.Add(sum(1 - opened[s][t] for s, t in pairs) >= min_diff)

    # ── 그룹 배정 y[g][(s,k,t)] ──
    y = []
    unassigned_vars = []
    size_terms = defaultdict(list)  # (s,k) → [var]
    for gi, g in enumerate(groups):
        n = len(g["members"])
        yg = {}
        for s in g["subjects"]:
            for k in range(K[s]):
                for t in range(T):
                    v = m.NewIntVar(0, n, f"y_{gi}_{s}_{k}_{t}")
                    m.Add(v <= n * x[s][k][t])
                    yg[(s, k, t)] = v
                    size_terms[(s, k)].append(v)
        # 진단 모드: 그룹 안에서 배정되는 학생 수 a (나머지는 미배정)
        if allow_unassigned:
            a = m.NewIntVar(0, n, f"a_{gi}")
            unassigned_vars.append(n - a)
        else:
            a = n
        for s in g["subjects"]:
            m.Add(sum(yg[(s, k, t)] for k in range(K[s]) for t in range(T)) == a)
        for t in range(T):
            m.Add(sum(yg[(s, k, t)] for s in g["subjects"] for k in range(K[s])) <= a)
        if g["locked"]:
            for s, k in g["locked"].items():
                if s in g["subjects"] and 0 <= k < K[s]:
                    m.Add(sum(yg[(s, k, t)] for t in range(T)) == a)
        y.append(yg)

    if sep_rules:
        group_of = {g["members"][0]: gi for gi, g in enumerate(groups) if len(g["members"]) == 1}
        n_cons = 0
        for members, sbjs in sep_rules:
            for sbj in sbjs:
                takers = [group_of[x] for x in members if x in group_of and sbj in groups[group_of[x]]["subjects"]]
                if len(takers) < 2:
                    continue
                for k in range(K[sbj]):
                    m.Add(sum(y[gi][(sbj, k, t)] for gi in takers for t in range(T)) <= 1)
                    n_cons += 1
        _emit(log, "info", f"분리 규칙 {len(sep_rules)}개 — 같은 분반 금지 조건 {n_cons}개")

    # ── 균형: 과목 안의 분반 인원 최대-최소 ──
    spreads = []
    sizes = {}
    for s in range(S):
        if K[s] == 0:
            continue
        for k in range(K[s]):
            sz = m.NewIntVar(0, demand[s], f"size_{s}_{k}")
            m.Add(sz == sum(size_terms[(s, k)]))
            sizes[(s, k)] = sz
        if K[s] == 1:
            continue
        hi = m.NewIntVar(0, demand[s], f"hi_{s}")
        lo = m.NewIntVar(0, demand[s], f"lo_{s}")
        m.AddMaxEquality(hi, [sizes[(s, k)] for k in range(K[s])])
        m.AddMinEquality(lo, [sizes[(s, k)] for k in range(K[s])])
        d = m.NewIntVar(0, demand[s], f"spread_{s}")
        m.Add(d == hi - lo)
        # 이론상 최소값(나머지가 있으면 1)
        m.Add(d >= (1 if demand[s] % K[s] else 0))
        spreads.append(d)
    # ── 분반 최대·최소 인원: hard(꼭 지킴) / soft(가능하면, 벌점) / off ──
    size_penalty = []
    max_mode = data.get("maxMode") or "off"
    min_mode = data.get("minMode") or "off"
    for s in range(S):
        mx = subjects[s].get("maxSize")
        mn = subjects[s].get("minSize")
        for k in range(K[s]):
            sz = sizes.get((s, k))
            if sz is None:
                continue
            if mx and max_mode != "off":
                if max_mode == "hard":
                    m.Add(sz <= int(mx))
                else:
                    over = m.NewIntVar(0, demand[s], f"over_{s}_{k}")
                    m.Add(over >= sz - int(mx))
                    size_penalty.append(over)
            if mn and min_mode != "off" and K[s] >= 2:   # 최소 인원은 분반을 나눌 때만(1분반 과목은 작아도 된다)
                if min_mode == "hard":
                    m.Add(sz >= int(mn))
                else:
                    short = m.NewIntVar(0, int(mn), f"short_{s}_{k}")
                    m.Add(short >= int(mn) - sz)
                    size_penalty.append(short)

    worst = m.NewIntVar(0, max(demand) if demand else 0, "worst")
    if spreads:
        m.AddMaxEquality(worst, spreads)
    else:
        m.Add(worst == 0)

    # ── 이전 배정과의 차이 (재탐색) ──
    # previous는 학생 → {과목: 타임 번호}. 분반 번호는 대칭 깨기로 순서가 바뀔 수 있어 타임으로 비교한다.
    change_terms = []
    if previous:
        prev_count = defaultdict(int)  # (gi, s, t) → 이전에 그 과목을 타임 t에서 듣던 학생 수
        member_group = {sid: gi for gi, g in enumerate(groups) for sid in g["members"]}
        for sid, subs in previous.items():
            gi = member_group.get(sid)
            if gi is None:
                continue
            for name, t in subs.items():
                s = subject_index.get(name)
                if s is not None and s in groups[gi]["subjects"] and t is not None and 0 <= int(t) < T:
                    prev_count[(gi, s, int(t))] += 1
        for (gi, s, t), p in prev_count.items():
            stay = m.NewIntVar(0, p, f"stay_{gi}_{s}_{t}")
            m.Add(stay <= sum(y[gi][(s, k, t)] for k in range(K[s])))
            change_terms.append(p - stay)

    # ── 힌트: 지금 배정을 탐색 출발점으로(나빠지지 않고 개선부터 시작) ──
    hint = data.get("hint") or None
    if hint:
        _apply_hint(m, hint, subjects, subject_index, K, T, x, groups, y, data.get("lockedAssignments") or {})
        _emit(log, "info", "지금 배정을 출발점으로 넘겨 그보다 좋은 해부터 찾습니다")

    objective = BALANCE_WEIGHT_WORST * worst + BALANCE_WEIGHT_SUM * sum(spreads)
    if size_penalty:
        objective += SIZE_LIMIT_WEIGHT * sum(size_penalty)
    if change_terms:
        objective += int(data.get("changeWeight") or CHANGE_WEIGHT) * sum(change_terms)
    if unassigned_vars:
        objective += UNASSIGNED_WEIGHT * sum(unassigned_vars)
    m.Minimize(objective)

    proto = m.Proto()
    _emit(log, "info", f"모델 완성 — 변수 {len(proto.variables):,}개 · 제약 {len(proto.constraints):,}개")

    solver = cp_model.CpSolver()
    limit = float(data.get("timeLimit") or 30)
    solver.parameters.max_time_in_seconds = limit
    solver.parameters.num_search_workers = int(data.get("workers") or 8)
    if data.get("seed") is not None:
        solver.parameters.random_seed = int(data["seed"])
    t0 = time.time()
    if log:
        # CP-SAT 원본 진행 줄(#로 시작)을 0.7초에 한 번꼴로 흘려 보낸다
        solver.parameters.log_search_progress = True
        solver.parameters.log_to_stdout = False
        last = [0.0]

        def _raw(line):
            line = (line or "").strip()
            if not line.startswith("#"):
                return
            now = time.time()
            if line.startswith("#Done") or line.startswith("#Model") or now - last[0] >= 0.7:
                last[0] = now
                _emit(log, "raw", line[:160])

        solver.log_callback = _raw
    _emit(log, "info", f"탐색 시작 — 작업자 {solver.parameters.num_search_workers}개 동시 탐색, 제한 {int(limit)}초")
    cb = _SolutionLogger(log, worst, spreads, t0) if log else None
    code = solver.Solve(m, cb) if cb else solver.Solve(m)
    status = solver.StatusName(code)
    _emit(log, "done" if code in (cp_model.OPTIMAL, cp_model.FEASIBLE) else "warn", {
        "OPTIMAL": f"최적해 확정 ({solver.WallTime():.1f}초) — 더 좋은 배정이 없음을 증명",
        "FEASIBLE": f"제한 시간 도달 ({solver.WallTime():.1f}초) — 찾은 해 중 가장 좋은 것을 사용",
        "INFEASIBLE": f"해가 없음을 증명 ({solver.WallTime():.1f}초)",
        "UNKNOWN": f"제한 시간 안에 해를 찾지 못함 ({solver.WallTime():.1f}초)",
    }.get(status, status), status=status)

    if code not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        msg = {
            "INFEASIBLE": "이 설정으로는 모든 학생을 배정할 수 없습니다(증명됨).",
            "UNKNOWN": "제한 시간 안에 해를 찾지 못했습니다. 시간을 늘려 다시 시도하세요.",
        }.get(status, status)
        return {"status": status, "message": msg, "stats": {"wallTime": solver.WallTime()}}

    # ── 결과 추출 ──
    sec_slot = [[next(t for t in range(T) if solver.Value(x[s][k][t])) for k in range(K[s])] for s in range(S)]
    assignments = {}
    unassigned = []
    for gi, g in enumerate(groups):
        counts = {key: solver.Value(v) for key, v in y[gi].items() if solver.Value(v) > 0}
        placed, left = decompose_group(g["subjects"], g["members"], counts, T)
        for sid, sub_map in placed.items():
            assignments[sid] = {subjects[s]["name"]: k for s, k in sub_map.items()}
        for sid in left:
            unassigned.append({"id": sid, "subjects": [subjects[s]["name"] for s in g["subjects"]]})

    size_val = defaultdict(int)
    for sid, sub_map in assignments.items():
        for name, k in sub_map.items():
            size_val[(subject_index[name], k)] += 1
    sections = [
        {"subject": subjects[s]["name"], "index": k, "slot": sec_slot[s][k], "size": size_val[(s, k)]}
        for s in range(S) for k in range(K[s])
    ]
    changes = 0
    for sid, subs in previous.items():
        cur = assignments.get(sid, {})
        for name, t in subs.items():
            s = subject_index.get(name)
            k = cur.get(name)
            if s is not None and k is not None and t is not None and sec_slot[s][k] != int(t):
                changes += 1

    return {
        "status": status,
        "message": "최적해" if status == "OPTIMAL" else "제한 시간 안의 가장 좋은 해",
        "sections": sections,
        "assignments": assignments,
        "unassigned": unassigned,
        "stats": {
            "worstSpread": solver.Value(worst),
            "spreadSum": sum(solver.Value(d) for d in spreads),
            "changes": changes,
            "wallTime": round(solver.WallTime(), 2),
            "groups": len(groups),
            "solutions": cb.count if cb else None,
        },
    }


def decompose_group(subs, members, counts, T):
    """그룹의 (과목,분반,타임) 인원을 학생 한 명씩의 시간표로 나눈다.

    counts[(s,k,t)] = 인원. 학생 한 명마다 과목별로 서로 다른 타임을 하나씩 고른다.
    남은 인원 r에 대해 열(타임) 합이 r인 타임은 반드시 이번 학생이 채워야 불변식(열 합 ≤ r)이 유지된다.
    """
    counts = dict(counts)
    placed = {}
    remaining = list(members)
    n_assigned = 0
    if subs:
        n_assigned = sum(v for (s, k, t), v in counts.items() if s == subs[0])
    left = remaining[n_assigned:]
    remaining = remaining[:n_assigned]

    for idx, sid in enumerate(remaining):
        r = len(remaining) - idx
        st = defaultdict(int)  # (s,t) → 인원
        col = defaultdict(int)
        for (s, k, t), v in counts.items():
            if v > 0:
                st[(s, t)] += v
                col[t] += v
        tight = {t for t in range(T) if col[t] == r}
        options = [[t for t in range(T) if st[(s, t)] > 0] for s in subs]
        choice = None
        for perm in _assignments(options):
            if tight <= set(perm):
                choice = perm
                break
        if choice is None:  # 이론상 오지 않음 — 그래도 아무 배치나 고른다
            choice = next(_assignments(options), None)
            if choice is None:
                left.append(sid)
                continue
        sub_map = {}
        for s, t in zip(subs, choice):
            # 같은 과목·같은 타임 분반이 여럿이면 인원이 많이 남은 분반부터
            k = max((k for (ss, k, tt), v in counts.items() if ss == s and tt == t and v > 0),
                    key=lambda kk: counts[(s, kk, t)])
            counts[(s, k, t)] -= 1
            sub_map[s] = k
        placed[sid] = sub_map
    return placed, left


def _assignments(options):
    """과목마다 서로 다른 타임 하나씩 고르는 모든 경우(백트래킹)."""
    n = len(options)
    order = sorted(range(n), key=lambda i: len(options[i]))
    chosen = [None] * n
    used = set()

    def rec(i):
        if i == n:
            yield list(chosen)
            return
        j = order[i]
        for t in options[j]:
            if t not in used:
                used.add(t)
                chosen[j] = t
                yield from rec(i + 1)
                used.discard(t)

    yield from rec(0)


def check_separations(data, result):
    """분리 규칙 위반: 같은 과목·같은 분반에 규칙 학생 둘 이상"""
    errs = []
    for ri, rule in enumerate(data.get("separations") or []):
        seen = {}
        for sid in rule:
            for name, k in (result.get("assignments", {}).get(str(sid)) or {}).items():
                key = (name, k)
                if key in seen:
                    errs.append(f"규칙 {ri + 1}: {seen[key]}·{sid} 같은 {name} 분반")
                seen.setdefault(key, sid)
    return errs


def check_solution(data, result):
    """결과 검증(테스트·로그용): 미배정, 시간 충돌, 교실 수, 같은 과목 다른 타임."""
    T = len(data.get("slots") or "ABCDE")
    subj = {s["name"]: s for s in data["subjects"]}
    slot = {(sec["subject"], sec["index"]): sec["slot"] for sec in result["sections"]}
    errors = []
    for st in data["students"]:
        sid = str(st["id"])
        a = result["assignments"].get(sid, {})
        if set(a) != set(n for n in st["subjects"] if n):
            errors.append(f"{sid}: 배정 과목 불일치")
            continue
        ts = [slot[(n, k)] for n, k in a.items()]
        if len(ts) != len(set(ts)):
            errors.append(f"{sid}: 시간 충돌")
    rooms = _norm_rooms(data.get("rooms"), T)
    for t in range(T):
        used = sum(1 for v in slot.values() if v == t)
        if rooms[t] is not None and used > rooms[t]:
            errors.append(f"타임 {t}: 분반 {used}개 > 교실 {rooms[t]}")
    for name, s in subj.items():
        if s.get("distinctSlots", True):
            ts = [v for (n, k), v in slot.items() if n == name]
            if len(ts) != len(set(ts)):
                errors.append(f"{name}: 같은 타임에 분반 2개 이상")
    return errors


def suggest(data, base_time=8, focus=None, log=None, max_found=5, budget=150):
    """해가 없을 때 한 가지씩 완화해 보고 풀리는 대안을 돌려준다.

    시험 순서: 분반 평균 인원(신청 ÷ 분반)이 많은 과목부터 분반 +1 → (focus 과목) 같은 그룹 분반 허용 → 그룹 교실 +1.
    분반이 붐비는 과목을 먼저 늘리는 쪽이 학급 운영에도 자연스럽기 때문. 대안을 max_found개 찾거나 budget초가 지나면 멈춘다.
    focus: 진단에서 남은 학생들의 과목 이름 집합(같은 그룹 허용 시험 대상).
    """
    T = len(data.get("slots") or "ABCDE")
    slots = list(data.get("slots") or "ABCDE")
    demand = defaultdict(int)
    for st in data["students"]:
        for n in set(st.get("subjects") or []):
            demand[n] += 1

    trials = []
    by_avg = sorted(
        [(i, s) for i, s in enumerate(data["subjects"]) if demand[s["name"]] and int(s.get("sections") or 0) > 0],
        key=lambda x: -demand[x[1]["name"]] / int(x[1]["sections"]),
    )
    for i, s in by_avg:
        k = int(s.get("sections") or 0)
        if s.get("distinctSlots", True) and k + 1 > T:
            continue
        if data.get("minMode") == "hard" and s.get("minSize") and (k + 1) * int(s["minSize"]) > demand[s["name"]]:
            continue
        before = round(demand[s["name"]] / k, 1)
        after = round(demand[s["name"]] / (k + 1), 1)
        trials.append((f"{s['name']} 분반 {k}→{k + 1}", {"subject": s["name"], "sections": k + 1},
                       _with_subject(data, i, sections=k + 1), {"avgBefore": before, "avgAfter": after}))
    for i, s in by_avg:
        k = int(s.get("sections") or 0)
        if s.get("distinctSlots", True) and k > 1 and (focus is None or s["name"] in focus):
            trials.append((f"{s['name']} 같은 그룹 분반 허용", {"subject": s["name"], "distinctSlots": False},
                           _with_subject(data, i, distinctSlots=False), {}))
    for ri, rule in enumerate(data.get("separations") or []):
        rest = [r for j, r in enumerate(data["separations"]) if j != ri]
        trials.append((f"분리 규칙 {ri + 1}({', '.join(map(str, rule))}) 잠시 빼기", {"dropSeparation": ri},
                       {**data, "separations": rest}, {}))
    if data.get("maxMode") == "hard":
        trials.append(("분반 최대 인원을 '가능하면 지킴'으로", {"maxMode": "soft"}, {**data, "maxMode": "soft"}, {}))
    if data.get("minMode") == "hard":
        trials.append(("분반 최소 인원을 '가능하면 지킴'으로", {"minMode": "soft"}, {**data, "minMode": "soft"}, {}))
    rooms = data.get("rooms")
    if isinstance(rooms, (int, float)):
        trials.append((f"그룹당 교실 {int(rooms)}→{int(rooms) + 1}", {"rooms": int(rooms) + 1},
                       {**data, "rooms": int(rooms) + 1}, {}))
    elif isinstance(rooms, list):
        for t, r in enumerate(rooms):
            if r is None or r == "":
                continue
            new_rooms = list(rooms)
            new_rooms[t] = int(r) + 1
            trials.append((f"{slots[t]}그룹 교실 {int(r)}→{int(r) + 1}", {"rooms": new_rooms}, {**data, "rooms": new_rooms}, {}))

    out = []
    t0 = time.time()
    _emit(log, "info", f"대안 {len(trials)}가지 — 분반 평균 인원이 많은 과목부터 시험합니다")
    for i, (label, change, d, extra) in enumerate(trials):
        if len(out) >= max_found or time.time() - t0 > budget:
            _emit(log, "info", f"대안 {len(out)}개를 찾아 시험을 마칩니다")
            break
        avg = f" (평균 {extra['avgBefore']}→{extra['avgAfter']}명)" if extra else ""
        r = solve({**d, "timeLimit": base_time, "previous": None, "allowUnassigned": False})
        if r["status"] in ("OPTIMAL", "FEASIBLE"):
            out.append({"label": label, "change": change, "worstSpread": r["stats"]["worstSpread"],
                        "spreadSum": r["stats"]["spreadSum"], **extra})
            _emit(log, "solution", f"[{i + 1}/{len(trials)}] {label}{avg} → 가능! 분반 편차 최대 {r['stats']['worstSpread']}명")
        else:
            _emit(log, "raw", f"[{i + 1}/{len(trials)}] {label}{avg} → 안 됨")
    return out


def diagnose(data, time_limit=30, log=None):
    """해가 없을 때: 미배정을 최소로 하는 배치(누가 문제인지)와 완화 제안을 함께 돌려준다."""
    _emit(log, "info", "원인 찾기 — 미배정 학생 수를 최소로 하는 배치를 찾습니다")
    r = solve({**data, "allowUnassigned": True, "timeLimit": time_limit})
    unassigned = r.get("unassigned", [])
    for u in unassigned:
        _emit(log, "warn", f"남는 학생 {u['id']}: {', '.join(u['subjects'])}")
    focus = {name for u in unassigned for name in u["subjects"]} or None
    return {
        "status": r["status"],
        "minUnassigned": len(unassigned) if r["status"] in ("OPTIMAL", "FEASIBLE") else None,
        "unassigned": unassigned,
        "suggestions": suggest(data, focus=focus, log=log),
    }


def _with_subject(data, i, **changes):
    subs = [dict(s) for s in data["subjects"]]
    subs[i].update(changes)
    return {**data, "subjects": subs}


def alternatives(data, count=3, log=None, min_diff=3):
    """같은 설정에서 그룹 배치가 서로 다른 안을 여러 개 만든다(앞 안과 minDiff곳 이상 다르게)."""
    out = []
    avoid = []
    per = float(data.get("timeLimit") or 20)
    for i in range(count):
        _emit(log, "info", f"── 안 {i + 1}/{count} 만들기" + (f" (앞 안들과 그룹 배치 {min_diff}곳 이상 다르게)" if avoid else ""))
        r = solve({**data, "avoid": avoid, "minDiff": min_diff, "timeLimit": per, "previous": None}, log=log)
        if r["status"] not in ("OPTIMAL", "FEASIBLE"):
            _emit(log, "warn", f"안 {i + 1}: 더 다른 배치를 찾지 못했습니다")
            break
        out.append(r)
        avoid.append([{"subject": sec["subject"], "slot": sec["slot"]} for sec in r["sections"]])
    return {"status": "OK" if out else "NONE", "alternatives": out}


def _apply_hint(m, hint, subjects, subject_index, K, T, x, groups, y, locked):
    """hint = {"sections": {과목: [그룹|None, ...]}, "assignments": {학번: {과목: 분반 번호}}}

    모델은 고정되지 않은 분반을 그룹 순서대로 정렬(대칭 깨기)하므로, 지금 분반 번호를 그 순서로 바꿔서 넣는다.
    """
    sec = hint.get("sections") or {}
    remap = {}  # (s, 옛 k) → 새 k
    slot_hint = {}
    for name, slots in sec.items():
        s = subject_index.get(name)
        if s is None or len(slots) != K[s] or any(t is None for t in slots):
            continue
        fixed = {int(k) for k in (subjects[s].get("sectionSlots") or {}).keys()}
        free_old = sorted([k for k in range(K[s]) if k not in fixed], key=lambda k: (slots[k], k))
        free_new = [k for k in range(K[s]) if k not in fixed]
        for o, n in zip(free_old, free_new):
            remap[(s, o)] = n
        for k in fixed:
            remap[(s, k)] = k
        for o in range(K[s]):
            n = remap[(s, o)]
            slot_hint[(s, n)] = int(slots[o])
    for (s, k), t0 in slot_hint.items():
        for t in range(T):
            m.AddHint(x[s][k][t], 1 if t == t0 else 0)

    # 그룹별 인원 힌트
    asg = hint.get("assignments") or {}
    for gi, g in enumerate(groups):
        cnt = defaultdict(int)
        ok = True
        for sid in g["members"]:
            a = asg.get(sid)
            if not a:
                ok = False
                break
            for s in g["subjects"]:
                k_old = a.get(subjects[s]["name"])
                if k_old is None or (s, int(k_old)) not in remap:
                    ok = False
                    break
                k = remap[(s, int(k_old))]
                cnt[(s, k, slot_hint[(s, k)])] += 1
            if not ok:
                break
        if not ok:
            continue
        for key, v in y[gi].items():
            m.AddHint(v, cnt.get(key, 0))
