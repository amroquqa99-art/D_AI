"""Official MCP SDK transport for bounded DAI data/analysis tools."""
from __future__ import annotations
import hashlib
import json
import os
import fnmatch
import urllib.parse
import urllib.request
from pathlib import Path
from mcp.server.fastmcp import Context, FastMCP
from pypdf import PdfReader
from core import Store, calculate, csv_summary
from native import NativeClient
from models import probe_local, recommend

PROJECT=Path(os.environ.get("DAI_PROJECT_ROOT",Path(__file__).resolve().parents[2])).resolve()
DATA=Path(os.environ.get("DAI_DATA_ROOT",Path.home()/".local/share/d-ai-opencode/workspace")).resolve()
store=Store(DATA,[PROJECT])
native=NativeClient()
mcp=FastMCP("DAI evidence and mission tools")

def caller(ctx: Context) -> str:
    meta=ctx.request_context.meta
    if meta is None:return "unbound-local-call"
    value=meta.model_dump() if hasattr(meta,"model_dump") else dict(meta)
    return str(value.get("ai.opencode/sessionID","unbound-local-call"))

def actor_agent(ctx: Context) -> str:
    sid=caller(ctx)
    if not sid.startswith("ses_"):
        raise ValueError("Mission access requires native invoking-session metadata")
    agent=native.session(sid).get("agent","")
    if not (agent.startswith("dai-") or agent.startswith("dai/")):
        raise ValueError("A loaded DAI session is required")
    return agent

def authorized(mission_id: str, ctx: Context) -> dict:
    agent=actor_agent(ctx)
    data=store.mission_get(mission_id,include_evidence=False)
    domain=data["system"]
    allowed=["dai-"+domain,"dai/"+domain+"/*",*data["state"].get("shared_with",[])]
    if agent.startswith("dai/shared/"):
        session=native.session(caller(ctx))
        if session.get("parentID") and native.session(session["parentID"]).get("agent")=="dai-"+domain:
            return data
    if not any(fnmatch.fnmatchcase(agent,p) for p in allowed):
        raise ValueError("Mission not shared with this system/agent")
    return data

def authorized_file(path: str, ctx: Context) -> Path:
    current=Path(native.session(caller(ctx))["location"]["directory"])
    requested=Path(path).expanduser()
    p=store.safe_path(str(requested if requested.is_absolute() else current/requested),[current])
    if p.is_relative_to(DATA):
        relative=p.relative_to(DATA).parts
        if len(relative)<3 or relative[0]!="missions":
            raise ValueError("Private internal data files are not readable artifacts")
        authorized(relative[1],ctx)
    return p

def owner_write(mission_id: str, ctx: Context) -> dict:
    data=authorized(mission_id,ctx)
    if actor_agent(ctx)!="dai-"+data["system"]:
        raise ValueError("Only the originating primary may modify mission data")
    return data

@mcp.tool()
def mission_create(mission_id: str, system: str, objective: str, acceptance: list[str], ctx: Context) -> dict:
    """Create an idempotent task contract with persistent state. Does not start an agent."""
    if actor_agent(ctx)!="dai-"+system:
        raise ValueError("A primary creates missions only in its own system")
    store.mission_create(mission_id,system,objective,acceptance,caller(ctx))
    return authorized(mission_id,ctx)

@mcp.tool()
def mission_read(mission_id: str, ctx: Context) -> dict:
    """Restore actual state plus bounded evidence metadata/claim summaries. Fetch original text using evidence_read; summary is not full source reading."""
    return authorized(mission_id,ctx)

@mcp.tool()
def evidence_read(mission_id: str, ctx: Context, source_id: str = "", offset: int = 0, limit: int = 8000, claim_id: str = "") -> dict:
    """Read original source/claim text in character chunks, or paginate bounded metadata (20 records/page). Hash refers to the complete original source or claim record, not the chunk."""
    authorized(mission_id,ctx)
    if offset<0 or not 1<=limit<=16000:raise ValueError("Nonnegative offset and chunk limit 1–16000 required")
    with store.connect() as db:
        if source_id and claim_id:raise ValueError("Select a source or a claim, not both")
        if source_id or claim_id:
            from core import identifier
            identifier(source_id or claim_id)
            table="sources" if source_id else "claims"
            row=db.execute(f"SELECT payload FROM {table} WHERE mission_id=? AND id=?",(mission_id,source_id or claim_id)).fetchone()
            if not row:raise ValueError("Unknown original source")
            source=json.loads(row[0]);text=source.pop("content" if source_id else "text")
            if claim_id:source["claim_record_sha256"]=hashlib.sha256(row[0].encode()).hexdigest()
            return {**source,"character_offset":offset,"content_chunk":text[offset:offset+limit],"total_characters":len(text),"next_offset":offset+limit if offset+limit<len(text) else None}
        result={"offset":offset,"page_size":20}
        for table in ("sources","claims"):
            items=[json.loads(r[0]) for r in db.execute(f"SELECT payload FROM {table} WHERE mission_id=? ORDER BY id LIMIT 20 OFFSET ?",(mission_id,offset))]
            result[table]=[]
            for item in items:
                bounded={k:v for k,v in item.items() if k!="content"}
                for field in ("text","limitations","title"):
                    if field in bounded:bounded[field]=bounded[field][:500]
                if "source_ids" in bounded:bounded.update(source_ids=item["source_ids"][:20],source_ref_count=len(item["source_ids"]))
                result[table].append(bounded)
        return result

@mcp.tool()
def mission_list(ctx: Context, system: str = "") -> list[dict]:
    """List up to 100 saved missions, optionally filtered by a registered system."""
    actor_agent(ctx)
    result=[]
    for row in store.mission_list(system):
        try:authorized(row["id"],ctx)
        except ValueError:continue
        result.append(row)
    return result

@mcp.tool()
def mission_checkpoint(mission_id: str, expected_version: int, status: str, state: dict, ctx: Context) -> dict:
    """Save a version-checked checkpoint. Include next_action, artifacts, actual receipts and pending_human. Completion is recorded, never an automatic semantic verification."""
    owner_write(mission_id,ctx)
    if "shared_with" in state:
        raise ValueError("Sharing is a separate permission-gated action")
    result=store.checkpoint(mission_id,expected_version,status,state,caller(ctx))
    result["export"]=store.export(mission_id)
    return {**authorized(mission_id,ctx),"export":result["export"]}

@mcp.tool()
def evidence_add(mission_id: str, source_id: str, title: str, locator: str, content: str, ctx: Context, source_kind: str = "provided_text") -> dict:
    """Preserve immutable original source text or metadata with locator and SHA256. Use a new ID when source content changes."""
    owner_write(mission_id,ctx)
    result=store.add_source(mission_id,source_id,title,locator,content,source_kind,caller(ctx))
    return {k:v for k,v in result.items() if k!="content"}

@mcp.tool()
def claim_add(mission_id: str, claim_id: str, text: str, claim_type: str, source_ids: list[str], ctx: Context, limitations: str = "") -> dict:
    """Register FACT/STATEMENT/ANALYSIS/INFERENCE/HYPOTHESIS/UNKNOWN. Sources must exist; semantic support still requires independent review."""
    owner_write(mission_id,ctx)
    return store.add_claim(mission_id,claim_id,text,claim_type,source_ids,limitations,caller(ctx))

@mcp.tool()
def search_files(query: str, ctx: Context, pattern: str = "*", limit: int = 10, mission_id: str = "") -> dict:
    """Bounded literal source search with real file/line/hash references; skips secrets, binaries and out-of-root symlinks. Optional mission artifacts require authorized scope. No corpus dumps."""
    if not query or len(query)>200 or not 1<=limit<=20 or len(pattern)>100 or ".." in pattern:
        raise ValueError("Bounded literal query, simple glob and limit 1–20 required")
    root=Path(native.session(caller(ctx))["location"]["directory"]).resolve()
    if root.is_relative_to(DATA) and not mission_id:
        raise ValueError("Use an explicitly scoped mission for private artifact search")
    if mission_id:
        authorized(mission_id,ctx)
        root=DATA/"missions"/mission_id/"artifacts"
    results=[];scanned=0;used=0;exhausted=False
    for visited,item in enumerate(root.rglob("*"),1):
        if visited>20_000:exhausted=True;break
        if not item.is_file() or item.suffix.lower() not in {".md",".txt",".py",".ts",".js",".json",".csv",".yaml",".yml",".toml"} or not item.match(pattern):continue
        if item.is_symlink():continue
        try:p=store.safe_path(str(item),[root])
        except (ValueError,FileNotFoundError):continue
        if p.is_relative_to(DATA):authorized_file(str(p),ctx)
        size=p.stat().st_size
        if size>500_000:continue
        if scanned>=1000 or used+size>10_000_000:exhausted=True;break
        scanned+=1;used+=size
        try:raw=p.read_bytes();text=raw.decode("utf-8")
        except (OSError,UnicodeError):continue
        hits=[{"line":i,"text":line[:500]} for i,line in enumerate(text.splitlines(),1) if query.casefold() in line.casefold()][:5]
        if hits:
            results.append({"path":str(p),"sha256":hashlib.sha256(raw).hexdigest(),"matches":hits})
            if len(results)>=limit:exhausted=True;break
    return {"results":results,"files_scanned":scanned,"bytes_scanned":used,"bounded_or_more_possible":exhausted,"limits":"Literal search; 1000 files/10 MB, 500 KB per file, five lines per match; not exhaustive corpus review"}

@mcp.tool()
def calculate_decimal(expression: str) -> dict:
    """Reproduce bounded decimal arithmetic; accepts only numbers and + - * / **. Never executes Python or shell."""
    return calculate(expression)

@mcp.tool()
def summarize_csv(path: str, column: str, ctx: Context) -> dict:
    """Compute count, missingness, mean, median, min/max and sample stdev from a numeric CSV column inside allowed roots."""
    p=authorized_file(path,ctx)
    if p.suffix.lower()!=".csv":raise ValueError("Expected a CSV artifact")
    current=Path(native.session(caller(ctx))["location"]["directory"])
    return csv_summary(store,str(p),column,[current])

@mcp.tool()
def extract_pdf(path: str, ctx: Context, start_page: int = 1, pages: int = 5) -> dict:
    """Extract actual text from up to ten PDF pages, with source checksum. No OCR or visual verification is implied."""
    p=authorized_file(path,ctx)
    if p.suffix.lower()!=".pdf":raise ValueError("Expected a PDF artifact")
    if not 1<=pages<=10 or start_page<1:raise ValueError("Use 1–10 pages and a positive start_page")
    reader=PdfReader(p)
    if reader.is_encrypted:raise ValueError("Encrypted PDF is not supported")
    end=min(len(reader.pages),start_page-1+pages)
    result=[{"page":i+1,"text":(reader.pages[i].extract_text() or "")[:15000]} for i in range(start_page-1,end)]
    return {"path":str(p),"sha256":hashlib.sha256(p.read_bytes()).hexdigest(),"total_pages":len(reader.pages),"pages":result,"limitations":"Text extraction only; no OCR/visual QA"}

@mcp.tool()
def crossref_search(query: str, rows: int = 5) -> dict:
    """Retrieve real scholarly metadata from Crossref; not full-text reading or study-quality verification."""
    if not query.strip() or len(query)>500 or not 1<=rows<=10:raise ValueError("Bounded query and 1–10 rows required")
    url="https://api.crossref.org/works?"+urllib.parse.urlencode({"query":query,"rows":rows})
    req=urllib.request.Request(url,headers={"User-Agent":"DAI-OpenCode/0.1 (local scholarly metadata research)"})
    with urllib.request.urlopen(req,timeout=20) as response:
        data=json.load(response)
    items=[]
    for item in data["message"]["items"]:
        items.append({"doi":item.get("DOI"),"title":item.get("title",[]),"type":item.get("type"),"published":item.get("published"),"authors":item.get("author",[])[:8],"url":item.get("URL"),"abstract":item.get("abstract"),"publisher":item.get("publisher")})
    return {"source":url,"items":items,"limitations":"Bibliographic metadata; abstracts optional; full text not retrieved"}

@mcp.tool()
def mission_share(mission_id: str, target_agent: str, ctx: Context) -> dict:
    """Explicitly grant a loaded DAI peer read access to mission data. Native tool permission asks the owner before this operation."""
    data=authorized(mission_id,ctx)
    if actor_agent(ctx)!="dai-"+data["system"]:
        raise ValueError("Only the originating primary may share this mission")
    loaded=native.agents(str(PROJECT))
    if target_agent not in {a["id"] for a in loaded.get("data",[])}:
        raise ValueError("Target agent is not loaded")
    shares=data["state"].get("shared_with",[])
    if target_agent not in shares:
        shares=shares+[target_agent]
        data=store.checkpoint(mission_id,data["version"],data["status"],{"shared_with":shares,"next_action":data["state"]["next_action"]},caller(ctx))
    return {"id":mission_id,"version":data["version"],"shared_with":shares}

@mcp.tool()
def artifact_write(mission_id: str, name: str, content: str, ctx: Context) -> dict:
    """Create an immutable text/CSV/Markdown artifact inside this mission. Existing content is never silently replaced."""
    data=owner_write(mission_id,ctx)
    if not name or Path(name).name!=name or Path(name).suffix.lower() not in {".md",".txt",".csv",".json"}:raise ValueError("Use a simple text artifact filename")
    raw=content.encode()
    if len(raw)>500_000:raise ValueError("Artifact limited to 500 KB")
    directory=DATA/"missions"/mission_id/"artifacts"
    directory.mkdir(parents=True,exist_ok=True)
    if any(p.is_symlink() for p in [directory,*directory.parents] if p.is_relative_to(DATA)):
        raise ValueError("Artifact directory cannot contain symlink components")
    path=directory/name
    if path.exists():
        if path.is_symlink() or path.read_bytes()!=raw:raise ValueError("Artifact immutable; use a new versioned name")
    else:
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,"wb") as f:f.write(raw);f.flush();os.fsync(f.fileno())
    return {"path":str(path),"sha256":hashlib.sha256(raw).hexdigest(),"size":len(raw)}

@mcp.tool()
def artifact_read(mission_id: str, name: str, ctx: Context) -> dict:
    """Read a mission text artifact through the mission scope, preserving path and checksum."""
    authorized(mission_id,ctx)
    if not name or Path(name).name!=name:raise ValueError("Simple artifact name required")
    path=authorized_file(str(DATA/"missions"/mission_id/"artifacts"/name),ctx)
    if path.suffix.lower() not in {".txt",".md",".json",".csv"} or path.stat().st_size>500_000:raise ValueError("Unsupported artifact")
    return {"path":str(path),"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"content":path.read_text()}

@mcp.tool()
def model_catalog(specialization: str = "") -> dict:
    """Discover native cloud/free/local model IDs and owner-maintained specialty profiles. Bare downloaded files are not serving models. Profiles are labels, not measured quality."""
    ids=native.models()
    profiles=json.loads((PROJECT/"config/model-profiles.json").read_text())
    local=probe_local()
    candidates=recommend(profiles["profiles"],ids,specialization,local)
    return {"catalog_ids":ids,"local_servers":local,"specialization":specialization,"profiles":candidates,"policy":"Owner chooses primary; catalog IDs do not prove connectivity. Worker override requires owner permission; automatic recommendations require a successful benchmark. Specialty quality is separate. No paid fallback or training inference from filename."}

@mcp.tool()
def delegate_native(target_agent: str, task: str, delegation_id: str, ctx: Context, model: str = "") -> dict:
    """Queue a bounded task in an actual OpenCode child session, preserving native agent permissions and a durable dispatch receipt. Needs native caller metadata; no model loop here. Uncertain sends are never retried automatically."""
    sid=caller(ctx)
    if not sid.startswith("ses_"):raise ValueError("Requires an invoking OpenCode session; local metadata alone is not an authorization credential")
    if model:
        profiles=json.loads((PROJECT/"config/model-profiles.json").read_text())
        approved={p["id"] for p in profiles["profiles"] if p.get("allow_worker",False)}
        if model not in approved:raise ValueError("Requested model not approved for worker use in owner profiles")
    return native.reserve_delegation(store,sid,target_agent,task,delegation_id,model)

@mcp.tool()
def delegation_read(delegation_id: str, ctx: Context) -> dict:
    """Read actual OpenCode session and result messages for a previous dispatch. Queued does not mean completed."""
    actor_agent(ctx)
    return native.delegation_status(store,delegation_id,caller(ctx))

if __name__=="__main__":
    mcp.run(transport="stdio")
