"""Thin client for the existing local OpenCode API, not a runner."""
from __future__ import annotations
import base64
import fnmatch
import hashlib
import json
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

class NativeClient:
    def __init__(self, binary: str | None = None):
        self.binary=binary or str(Path.home()/".opencode/bin/opencode")

    def api(self, method: str, path: str, data: dict | None = None):
        url=subprocess.check_output([self.binary,"service","status"],text=True,timeout=10).strip()
        parsed=urllib.parse.urlsplit(url)
        if parsed.scheme!="http" or parsed.hostname not in {"127.0.0.1","localhost","::1"}:
            raise ValueError("Only the owner's loopback OpenCode service is supported")
        req=urllib.request.Request(url+path,data=json.dumps(data).encode() if data is not None else None,method=method,headers={"Content-Type":"application/json"})
        try:
            response=urllib.request.urlopen(req,timeout=20)
        except urllib.error.HTTPError as exc:
            if exc.code!=401: raise RuntimeError(f"Native OpenCode HTTP {exc.code}") from None
            password=json.loads((Path.home()/".config/opencode/service.json").read_text())["password"]
            req.add_header("Authorization","Basic "+base64.b64encode(("opencode:"+password).encode()).decode())
            try: response=urllib.request.urlopen(req,timeout=20)
            except urllib.error.HTTPError as e: raise RuntimeError(f"Native OpenCode HTTP {e.code}") from None
        with response:
            if response.status==204:return None
            payload=json.load(response)
        if isinstance(payload,str): payload=json.loads(payload)
        return payload

    def models(self) -> list[str]:
        result=subprocess.run([self.binary,"models"],capture_output=True,text=True,timeout=30)
        if result.returncode: raise RuntimeError("OpenCode model catalog unavailable")
        return [line.strip() for line in result.stdout.splitlines() if "/" in line and not line.startswith(" ")]

    def agents(self, directory: str):
        query=urllib.parse.urlencode({"location[directory]":directory})
        # The v2 catalog endpoint does not initialize a location itself.
        self.api("GET","/api/location?"+query)
        definitions=Path(__file__).resolve().parents[2]/".opencode/agents"
        expected={str(path.relative_to(definitions).with_suffix("")) for path in definitions.rglob("*.md")}
        for attempt in range(20):
            result=self.api("GET","/api/agent?"+query)
            if result.get("data") and expected.issubset({a["id"] for a in result["data"]}):return result
            if attempt<19:time.sleep(0.25)
        raise RuntimeError("Native agent catalog did not become ready after location initialization")

    def session(self, session_id: str):
        if not session_id.startswith("ses_") or "/" in session_id: raise ValueError("Invalid native session ID")
        return self.api("GET","/api/session/"+session_id)["data"]

    def ready(self, directory: str):
        self.agents(directory)
        query=urllib.parse.urlencode({"location[directory]":directory})
        for attempt in range(40):
            info=self.api("GET","/api/mcp?"+query)
            dai=next((x for x in info.get("data",[]) if x["name"]=="dai"),None)
            status=dai.get("status",{}).get("status") if dai else None
            if status=="connected":return info
            if status in {"failed","disabled"}:raise RuntimeError("Native DAI MCP is failed or disabled; inspect its diagnostic")
            if attempt<39:time.sleep(0.25)
        raise RuntimeError("Native DAI MCP did not become ready within bounded startup wait")

    def reserve_delegation(self, store, caller_id: str, target: str, task: str, delegation_id: str, model: str = "") -> dict:
        from core import identifier, encoded, now
        identifier(delegation_id)
        caller=self.session(caller_id)
        source_agent=caller.get("agent","")
        if not source_agent.startswith("dai-"):
            raise ValueError("Delegation requires a DAI primary session")
        directory=caller["location"]["directory"]
        catalog=self.agents(directory)
        agents={a["id"]:a for a in catalog.get("data",[])}
        if target not in agents or not (target.startswith("dai-") or target.startswith("dai/")):
            raise ValueError("Target must be a loaded DAI agent")
        decision="deny"
        for permission in agents.get(source_agent,{}).get("permissions",[]):
            if fnmatch.fnmatchcase("subagent",permission["action"]) and fnmatch.fnmatchcase(target,permission["resource"]):
                decision=permission["effect"]
        if decision!="allow":raise ValueError("Target is not allowed by the caller's native subagent policy")
        permission=self.api("POST",f"/api/session/{caller_id}/permission",{"action":"subagent","resources":[target],"agent":source_agent})
        if permission["data"]["effect"]!="allow":
            raise ValueError("Native session/policy permission did not allow delegation")
        if target==source_agent: raise ValueError("Direct self-delegation is blocked")
        ancestor=caller
        depth=0
        while ancestor.get("parentID"):
            depth+=1
            if depth>=6:raise ValueError("Peer delegation depth limit reached; checkpoint before expanding")
            ancestor=self.session(ancestor["parentID"])
        if not task.strip() or len(task)>12000: raise ValueError("Bounded delegation text required")
        selected=None
        if model:
            if model not in self.models(): raise ValueError("Model not in current native catalog")
            provider,model_id=model.split("/",1)
            selected={"providerID":provider,"id":model_id}
        else:
            selected=agents[target].get("model") or caller.get("model")
        contract={"caller":caller_id,"target":target,"task":task,"model":selected}
        digest=hashlib.sha256(encoded(contract).encode()).hexdigest()
        # Reservation is committed before any external request. An uncertain send is
        # never retried automatically: status/readback first, then owner decision.
        with store.connect() as db:
            old=db.execute("SELECT digest,payload FROM delegations WHERE id=?",(delegation_id,)).fetchone()
            if old:
                if old["digest"]!=digest: raise ValueError("Delegation ID reused for a different contract")
                return json.loads(old["payload"])
            payload={**contract,"id":delegation_id,"status":"RESERVED","created":now()}
            db.execute("INSERT INTO delegations VALUES(?,?,?,?)",(delegation_id,digest,encoded(payload),now()))
        try:
            session_body={"parentID":caller_id,"title":"DAI delegation: "+delegation_id,"agent":target,"location":{"directory":directory},"metadata":{"dai_delegation":delegation_id,"dai_origin":caller_id}}
            if selected: session_body["model"]=selected
            child=self.api("POST","/api/session",session_body)["data"]
            payload["session_id"]=child["id"]
            payload["status"]="CREATED"
            with store.connect() as db:
                db.execute("UPDATE delegations SET payload=?,updated=? WHERE id=?",(encoded(payload),now(),delegation_id))
            receipt=self.api("POST",f'/api/session/{child["id"]}/prompt',{"text":task,"metadata":{"dai_delegation":delegation_id}})
            payload.update(status="QUEUED",dispatch_receipt=receipt)
        except Exception as exc:
            payload.update(status="UNCERTAIN",error=type(exc).__name__)
        with store.connect() as db:
            db.execute("UPDATE delegations SET payload=?,updated=? WHERE id=?",(encoded(payload),now(),delegation_id))
        return payload

    def delegation_status(self, store, delegation_id: str, caller_session: str) -> dict:
        from core import identifier
        identifier(delegation_id)
        if not caller_session.startswith("ses_") or "/" in caller_session:
            raise ValueError("An invoking native session is mandatory")
        with store.connect() as db:
            row=db.execute("SELECT payload FROM delegations WHERE id=?",(delegation_id,)).fetchone()
            if not row: raise ValueError("Unknown delegation")
            payload=json.loads(row[0])
        allowed={payload["caller"],payload.get("session_id")}
        if caller_session not in allowed:
            raise ValueError("Delegation results require the actual origin or child session; restore the original native session")
        if payload.get("session_id"):
            sid=payload["session_id"]
            payload["native_session"]=self.session(sid)
            messages=self.api("GET",f"/api/session/{sid}/message?limit=10&order=desc")
            # Preserve verifiable tool/text receipts without sending private reasoning
            # or opaque provider state to other agents' contexts.
            for message in messages.get("data",[]):
                message.pop("providerState",None)
                if "content" in message:
                    message["content"]=[part for part in message["content"] if part.get("type")!="reasoning"]
                    for part in message["content"]:
                        part.pop("providerState",None)
            payload["messages"]=messages
            info=payload["native_session"]
            payload["observed_status"]=info.get("outcome","RUNNING" if not info.get("time",{}).get("idle") else "IDLE")
        return payload
