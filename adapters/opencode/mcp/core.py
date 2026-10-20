"""DAI data tools. No model loop: OpenCode exclusively runs all agents."""
from __future__ import annotations

import ast
import csv
import hashlib
import json
import math
import os
import re
import sqlite3
import statistics
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal, localcontext
from pathlib import Path
from typing import Any

SYSTEMS = {"research", "innovation", "teacher", "investor", "assistant", "investigation", "cyber", "strategy", "advisors", "engineer"}
STATUSES = {"PLANNED", "RUNNING", "VERIFYING", "REVIEW", "COMPLETED", "PAUSED", "FAILED", "CANCELLED", "WAITING_FOR_HUMAN", "WAITING_FOR_DATA", "WAITING_FOR_SCHEDULE", "WAITING_FOR_RESOURCES"}
CLAIM_TYPES = {"FACT", "STATEMENT", "ANALYSIS", "INFERENCE", "HYPOTHESIS", "UNKNOWN"}
ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$")

def now() -> str:
    return datetime.now(timezone.utc).isoformat()

def identifier(value: str) -> str:
    if not ID.fullmatch(value):
        raise ValueError("Identifier must contain 1–96 letters, digits, underscores or hyphens")
    return value

def encoded(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True)
    if len(raw.encode()) > 500_000:
        raise ValueError("Record exceeds 500 KB; store artifacts separately")
    return raw

class Store:
    def __init__(self, data_root: Path, allowed_roots: list[Path]):
        self.root = data_root.resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.allowed_roots = [p.resolve() for p in allowed_roots] + [self.root]
        self.db_path = self.root / "evidence.sqlite3"
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS missions(id TEXT PRIMARY KEY, system TEXT NOT NULL,
                    objective TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL,
                    state TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    mission_id TEXT NOT NULL REFERENCES missions(id), kind TEXT NOT NULL,
                    actor TEXT NOT NULL, payload TEXT NOT NULL, created TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS sources(mission_id TEXT NOT NULL REFERENCES missions(id),
                    id TEXT NOT NULL, payload TEXT NOT NULL, sha256 TEXT NOT NULL,
                    PRIMARY KEY(mission_id,id));
                CREATE TABLE IF NOT EXISTS claims(mission_id TEXT NOT NULL REFERENCES missions(id),
                    id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(mission_id,id));
                CREATE TABLE IF NOT EXISTS delegations(id TEXT PRIMARY KEY, digest TEXT NOT NULL,
                    payload TEXT NOT NULL, updated TEXT NOT NULL);
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db_path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=FULL")
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def _event(self, db, mission_id, kind, actor, payload):
        db.execute("INSERT INTO events(mission_id,kind,actor,payload,created) VALUES(?,?,?,?,?)",
                   (mission_id, kind, actor, encoded(payload), now()))

    def mission_create(self, mission_id: str, system: str, objective: str, acceptance: list[str], actor: str = "owner") -> dict:
        identifier(mission_id)
        if system not in SYSTEMS or not objective.strip() or not acceptance:
            raise ValueError("Known system, objective and nonempty acceptance criteria required")
        state = {"acceptance": acceptance, "next_action": "Frame and inspect the mission", "artifacts": [], "receipts": [], "pending_human": [], "hypotheses": [], "dependencies": []}
        with self.connect() as db:
            previous = db.execute("SELECT * FROM missions WHERE id=?", (mission_id,)).fetchone()
            if previous:
                if previous["system"] != system or previous["objective"] != objective or json.loads(previous["state"])["acceptance"] != acceptance:
                    raise ValueError("Mission ID already used for a different contract")
            else:
                db.execute("INSERT INTO missions VALUES(?,?,?,?,?,?,?,?)", (mission_id, system, objective, "PLANNED", 1, encoded(state), now(), now()))
                self._event(db, mission_id, "created", actor, state)
        return self.mission_get(mission_id,include_evidence=False)

    def mission_get(self, mission_id: str, include_evidence: bool = True) -> dict:
        identifier(mission_id)
        with self.connect() as db:
            row = db.execute("SELECT * FROM missions WHERE id=?", (mission_id,)).fetchone()
            if not row:
                raise ValueError("Unknown mission")
            result = dict(row)
            result["state"] = json.loads(result["state"])
            suffix="" if include_evidence else " LIMIT 100"
            result["sources"] = [json.loads(r[0]) for r in db.execute("SELECT payload FROM sources WHERE mission_id=? ORDER BY id"+suffix, (mission_id,))]
            result["claims"] = [json.loads(r[0]) for r in db.execute("SELECT payload FROM claims WHERE mission_id=? ORDER BY id"+suffix, (mission_id,))]
            result["source_count"]=db.execute("SELECT COUNT(*) FROM sources WHERE mission_id=?",(mission_id,)).fetchone()[0]
            result["claim_count"]=db.execute("SELECT COUNT(*) FROM claims WHERE mission_id=?",(mission_id,)).fetchone()[0]
            if not include_evidence:
                result["sources"]=[{**{k:v for k,v in source.items() if k!="content"},"title":source["title"][:500],"locator":source["locator"][:2000]} for source in result["sources"]]
                result["claims"]=[{**claim,"text":claim["text"][:500],"limitations":claim.get("limitations","")[:500],"source_ids":claim["source_ids"][:20],"source_ref_count":len(claim["source_ids"])} for claim in result["claims"]]
                result["evidence_view"]="First 100 metadata/claim summaries; originals remain in SQL and are fetched on demand"
            result["event_count"] = db.execute("SELECT COUNT(*) FROM events WHERE mission_id=?", (mission_id,)).fetchone()[0]
            return result

    def mission_list(self, system: str = "") -> list[dict]:
        if system and system not in SYSTEMS:
            raise ValueError("Unknown system")
        with self.connect() as db:
            rows = db.execute("SELECT id,system,objective,status,version,updated FROM missions WHERE (?='' OR system=?) ORDER BY updated DESC LIMIT 100", (system, system)).fetchall()
            return [dict(r) for r in rows]

    def checkpoint(self, mission_id: str, expected_version: int, status: str, state: dict, actor: str) -> dict:
        identifier(mission_id)
        if status not in STATUSES or not state.get("next_action"):
            raise ValueError("Valid status and next_action required")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM missions WHERE id=?", (mission_id,)).fetchone()
            if not row or row["version"] != expected_version:
                raise ValueError("Stale checkpoint or unknown mission; reread before writing")
            previous = json.loads(row["state"])
            if "acceptance" in state and state["acceptance"] != previous["acceptance"]:
                raise ValueError("Acceptance contract is immutable; create a revised mission")
            merged = {**previous, **state}
            if status == "COMPLETED" and (not merged.get("artifacts") or not merged.get("receipts") or not merged.get("review")):
                raise ValueError("Completion needs artifacts, actual check receipts and review; data are recorded claims, not automatic proof")
            changed=db.execute("UPDATE missions SET status=?,version=version+1,state=?,updated=? WHERE id=? AND version=?", (status, encoded(merged), now(), mission_id, expected_version))
            if changed.rowcount!=1:raise ValueError("Concurrent checkpoint rejected; reread mission")
            self._event(db, mission_id, "checkpoint", actor, {"status": status, "state": merged})
        return self.mission_get(mission_id,include_evidence=False)

    def add_source(self, mission_id: str, source_id: str, title: str, locator: str, content: str, source_kind: str = "provided_text", actor: str = "owner") -> dict:
        identifier(mission_id); identifier(source_id)
        if not title.strip() or not locator.strip() or not content.strip():
            raise ValueError("Source title, locator and original content required")
        if len(title)>500 or len(locator)>4000 or len(source_kind)>128:
            raise ValueError("Bounded source metadata required; long original text belongs in content")
        digest = hashlib.sha256(content.encode()).hexdigest()
        payload = {"id": source_id, "title": title, "locator": locator, "kind": source_kind, "content": content, "sha256": digest, "captured": now(), "actor": actor}
        with self.connect() as db:
            row = db.execute("SELECT sha256,payload FROM sources WHERE mission_id=? AND id=?", (mission_id, source_id)).fetchone()
            if row:
                if row["sha256"] != digest:
                    raise ValueError("Original source immutable; use a new versioned source ID")
                return json.loads(row["payload"])
            db.execute("INSERT INTO sources VALUES(?,?,?,?)", (mission_id, source_id, encoded(payload), digest))
            self._event(db, mission_id, "source_added", actor, {"id": source_id, "sha256": digest, "locator": locator})
        return payload

    def add_claim(self, mission_id: str, claim_id: str, text: str, claim_type: str, source_ids: list[str], limitations: str = "", actor: str = "owner") -> dict:
        identifier(mission_id); identifier(claim_id)
        if claim_type not in CLAIM_TYPES or not text.strip():
            raise ValueError("Valid claim type and text required")
        if len(text)>12000 or len(limitations)>4000 or len(source_ids)>100:
            raise ValueError("Bounded claim required; decompose long reports into claims/artifacts")
        if claim_type in {"FACT", "STATEMENT"} and not source_ids:
            raise ValueError("FACT/STATEMENT needs actual source references")
        payload = {"id": claim_id, "text": text, "type": claim_type, "source_ids": source_ids, "limitations": limitations, "semantic_verification": "NOT_REVIEWED", "actor": actor}
        with self.connect() as db:
            for sid in source_ids:
                if not db.execute("SELECT 1 FROM sources WHERE mission_id=? AND id=?", (mission_id, sid)).fetchone():
                    raise ValueError("Unknown evidence reference: " + sid)
            old = db.execute("SELECT payload FROM claims WHERE mission_id=? AND id=?", (mission_id, claim_id)).fetchone()
            if old:
                if json.loads(old[0]) != payload:
                    raise ValueError("Claim ID immutable; version a changed claim")
                return payload
            db.execute("INSERT INTO claims VALUES(?,?,?)", (mission_id, claim_id, encoded(payload)))
            self._event(db, mission_id, "claim_added", actor, payload)
        return payload

    def safe_path(self, path: str, extra_roots: list[Path] | None = None) -> Path:
        requested = Path(path).expanduser()
        if not requested.is_absolute():
            requested = self.allowed_roots[0] / requested
        p = requested.resolve(strict=True)
        roots=self.allowed_roots+[r.resolve() for r in (extra_roots or [])]
        if not any(p.is_relative_to(root) for root in roots):
            raise ValueError("Outside authorized project/data roots")
        denied = any(part.startswith(".env") or part.lower() in {"secrets", "credentials", ".git", "node_modules"} or any(word in part.lower() for word in ("auth.json", "service.json", "credentials")) for part in p.parts)
        if denied or not p.is_file() or p.stat().st_size > 20_000_000:
            raise ValueError("Secret/unsupported/oversized path blocked")
        return p

    def export(self, mission_id: str) -> dict:
        with self.connect() as db:
            # Serialize projections with writers so an older export cannot replace
            # a newer checkpoint. The database remains the authoritative record.
            db.execute("BEGIN IMMEDIATE")
            data = self.mission_get(mission_id,include_evidence=False)
            directory = self.root / "missions" / identifier(mission_id)
            directory.mkdir(parents=True, exist_ok=True)
            path = directory / "checkpoint.json"
            tmp = directory / ("checkpoint." + os.urandom(6).hex() + ".tmp")
            with tmp.open("w", encoding="utf-8") as f:
                f.write(json.dumps(data,ensure_ascii=False,allow_nan=False,sort_keys=True)); f.flush(); os.fsync(f.fileno())
            os.replace(tmp, path)
        return {"path": str(path), "version": data["version"], "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}

def calculate(expression: str) -> dict:
    if len(expression) > 512:
        raise ValueError("Expression too long")
    tree = ast.parse(expression, mode="eval")
    operations = {ast.Add: lambda a,b:a+b, ast.Sub:lambda a,b:a-b, ast.Mult:lambda a,b:a*b, ast.Div:lambda a,b:a/b, ast.Pow:lambda a,b:a**b}
    def visit(node):
        if isinstance(node, ast.Constant) and type(node.value) in {int, float}:
            val = Decimal(str(node.value))
            if not val.is_finite() or abs(val) > Decimal("1e18"):
                raise ValueError("Nonfinite or oversized number")
            return val
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            return visit(node.operand) * (-1 if isinstance(node.op, ast.USub) else 1)
        if isinstance(node, ast.BinOp) and type(node.op) in operations:
            a,b=visit(node.left),visit(node.right)
            if isinstance(node.op, ast.Pow) and (abs(b)>8 or b!=b.to_integral()):
                raise ValueError("Power must be an integer between -8 and 8")
            return operations[type(node.op)](a,b)
        raise ValueError("Only numbers and + - * / ** are allowed; no code execution")
    with localcontext() as ctx:
        ctx.prec=40
        result=visit(tree.body)
        if not result.is_finite(): raise ValueError("Nonfinite result")
    return {"expression": expression, "result": str(result), "method": "Decimal arithmetic, precision 40"}

def csv_summary(store: Store, path: str, column: str, extra_roots: list[Path] | None = None) -> dict:
    p=store.safe_path(path,extra_roots)
    if p.stat().st_size > 2_000_000: raise ValueError("CSV limited to 2 MB")
    values=[]; missing=0
    with p.open(encoding="utf-8-sig",newline="") as f:
        reader=csv.DictReader(f)
        if column not in (reader.fieldnames or []): raise ValueError("Unknown CSV column")
        for i,row in enumerate(reader):
            if i >= 100_000: raise ValueError("Too many CSV rows")
            try: value=float(row[column])
            except (TypeError, ValueError): missing+=1; continue
            if not math.isfinite(value): missing+=1; continue
            values.append(value)
    if not values: raise ValueError("No finite numeric observations")
    return {"path":str(p),"column":column,"n":len(values),"missing":missing,"mean":statistics.mean(values),"median":statistics.median(values),"min":min(values),"max":max(values),"sample_stdev":statistics.stdev(values) if len(values)>1 else None,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()}
