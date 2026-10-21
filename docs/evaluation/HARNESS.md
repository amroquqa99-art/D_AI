# A/B Comparison Harness — D_AI 0.1

This harness compares a **baseline arm** (host tools only, no D_AI definitions)
against a **system arm** (host tools + D_AI agents/skills/commands + the D_AI
MCP server) on the SAME task text with the SAME model under comparable,
isolated conditions. Quality scoring is performed by an independent, blinded
reviewer (ab_score.py); the harness itself (ab_compare.py) collects facts only
and never claims the system is better or worse.

## Files you own

- `scripts/ab_compare.py` — runs both arms and writes the run directory
  (task.md, baseline-<n>.json, system-<n>.json, blind-map.json, run.json,
  COMPARISON.md). Do not modify.
- `scripts/ab_score.py` — the independent blind reviewer (this directory).
- `tests/test_ab_harness.py` — real tests, no network, no host run.
- `docs/evaluation/HARNESS.md` — this document.

## Exact commands (run from the repository root)

Activate the project venv first, e.g. `source /path/to/venv/bin/activate`, then:

### 1) Run both arms and collect evidence

```bash
PYTHONPATH=src python scripts/ab_compare.py \
    --task docs/evaluation/REFERENCE_TASK_SCI.md \
    --model opencode/<model-id> \
    --out docs/evaluation/runs/<stamp> \
    --timeout 900
```

The run directory is `docs/evaluation/runs/<stamp>` by default. It contains:
`task.md`, `run.json`, `blind-map.json`, `baseline-1.json`, `system-1.json`
and `COMPARISON.md`.

### 2) Score blindly with the independent reviewer

```bash
PYTHONPATH=src python scripts/ab_score.py \
    --run docs/evaluation/runs/<stamp> \
    --model opencode/<reviewer-model-id> \
    --timeout 900
```

This writes `scores.json` and `SCORES.md` into the run directory, unblinds
the labels **only after** scoring, and publishes per-criterion differences
(score(system) − score(baseline)), including negative and zero differences.

### Dry-run (no host invoked)

```bash
# Build sandboxes and print the plan without running the host
PYTHONPATH=src python scripts/ab_compare.py --task ... --model ... --dry-run

# Build the scoring plan without invoking the reviewer host
PYTHONPATH=src python scripts/ab_score.py --run <run dir> --model ... --dry-run
```

The reviewer runs through the OpenCode CLI
(`~/.opencode/bin/opencode`) in its own isolated sandbox.

## What is held fixed

- **Task text:** read verbatim (byte for byte) from
  `docs/evaluation/REFERENCE_TASK_SCI.md`; identical for both arms.
- **Model:** the same `provider/model` identifier in both arms; the harness
  never chooses a model.
- **Workspace:** a fresh empty folder per arm, same content.
- **Budget:** identical time ceiling per arm (`--timeout`, default 900 s).
- **No external skill in either arm:** the baseline arm has no agent/skill/
  command content and no MCP entry; the system arm has the D_AI definitions
  and the `dai` MCP server only. No other external skill is installed.

## What is measured

Per arm: status, exit code, duration, assistant character count, tool calls,
event counts, and (for the system arm) data-root record counts. The reviewer
scores each output on the seven criteria below, applies the six hard gates,
and computes a weighted score (0–100). The report then publishes
score(system) − score(baseline) for every criterion.

## Isolation method and how it is proven

Each arm runs with its own isolated host configuration:

- `XDG_CONFIG_HOME` = a per-arm empty directory
- `OPENCODE_CONFIG_DIR` = that directory's `opencode/`
- `HOME` is **never** touched (provider credentials stay under the real HOME)
- `XDG_DATA_HOME` and `XDG_CACHE_HOME` are deliberately left unchanged

The isolation is proven per arm with the host's own agent catalog:

```bash
OPENCODE_CONFIG_DIR=<arm-config>/opencode opencode debug agents
```

With an isolated config dir, `opencode debug agents` lists only the default
build agent — no D_AI agent and no external skill. If a D_AI agent or an
external skill leaked into the baseline arm, it would appear here. This
catalog is recorded in each arm's `isolation.loaded_agents` in the run.

## Limits (read before drawing conclusions)

1. **One pair of sessions is not an experiment.** One baseline arm and one
   system arm describe this round only, not the system. Repeat at least three
   times before claiming anything.
2. **The difference may come from the tool context, not from the system.**
   Both arms use the same model but different context (available tools,
   memory, files); the harness compares capability-contexts, not "system vs
   nothing".
3. **The reviewer is a model reading a text, not a domain expert.** Its
   judgements are indicative, not authoritative.

## The seven criteria

C1 — مصدر الدعم (source support)
C2 — سلامة الاستنتاج (inference integrity)
C3 — قابلية الاختبار (testability)
C4 — الجدة (novelty)
C5 — قابلية الاستئناف (reproducibility / resumability)
C6 — الالتزام بالقيد (constraint adherence)
C7 — الإيجاز المفيد (conciseness)

Each criterion is scored 0–4 with a mandatory evidence line. Standard weight
= (Σ score × weight) / (Σ weight × 4) × 100, with weights
C1=5, C2=5, C3=4, C4=4, C5=3, C6=3, C7=2.

## The six gates

Each gate is a hard fail that zeroes its criterion's contribution:

- G1 — مصدر مختلق (fabricated source)
- G2 — ادعاء بلا سند (claim without evidence)
- G3 — فرضية معروضة نتيجةً (hypothesis presented as result)
- G4 — نتيجة أو تجربة مختلقة (fabricated result or experiment)
- G5 — تجاوز النطاق بصمت (silent scope overreach)
- G6 — إخفاء الفشل (hiding failure)

A gate failed by the system but passed by the baseline is more serious than a
positive average difference.

## How to read the reports

- **COMPARISON.md** — raw facts only (durations, outputs, tools, artifacts),
  no quality scores, plus the per-arm isolation proof. Arabic.
- **SCORES.md** — per-criterion table with evidence, the gates, the weighted
  scores, the computed differences, the unblinded label→arm mapping, gate
  failures per arm, and the limits section.
- **scores.json** — machine-readable raw scores plus reviewer metadata and
  the per-criterion differences. On a failed scoring run it contains
  `{"status": "SCORING_FAILED", "raw": "..."}` and no labels are unblinded.

Negative differences are published as-is; none are hidden. A zero difference
is stated explicitly ("no effect in this criterion"). The tool never claims
the system is better; it reports numbers.


## قيدٌ يجب معرفته: `PWD` يحدّد موقع المضيف

المضيف (OpenCode) يحدّد «موقعه» (المجلد الذي يقرأ منه تعريفات الوكلاء
والمهارات) من المتغيّر `PWD`، لا من `getcwd()`. إذا ورثت العملية `PWD`
قديمةً، يقرأ المضيف كتالوج الوكلاء من المجلد الخطأ، فيُبلّغ عن وكيل **موجود**
بأنه غير موجود (`Agent not found`).

لذلك يضبط الـharness `PWD` صراحةً لكل ذراع. أي تكامل جديد يجب أن يحافظ على
هذا الشرط، وإلا فإن الذراعين سيقارنان إعدادات مختلفة بصمت.
