"""Local operator interface. Host/model tools use separately authenticated APIs.

Destructive purge and workspace restore require a live local confirmation;
normal natural-language forgetting is the distinct reversible archive action.
Every command group added here prints exactly one JSON object on stdout (list
commands print a JSON array) and never changes an existing command, flag or
output shape. Business rules live in the service modules; this file only parses
arguments, calls a service and serialises dataclass receipts.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict
import getpass
import json
import os
from pathlib import Path
import sys

from . import __version__
from .charters import CharterService
from .components import ComponentRegistry
from .contracts import Principal, Scope
from .decisions import DecisionService
from .errors import DaiError, InvalidRequest
from .memory import MemoryStore
from .models import ModelRegistry
from .tasks import TaskService
from .teams import TeamService
from .tools import ToolGateway
from .updates import UpdateWatcher


def local_principal() -> Principal:
    value = f"uid-{os.getuid()}" if hasattr(os, "getuid") else "local-" + getpass.getuser()
    return Principal(value)


def confirm(prompt: str, expected: str) -> None:
    if not sys.stdin.isatty():
        raise InvalidRequest("This operation requires interactive local confirmation")
    print(prompt, file=sys.stderr)
    if input(f"Type {expected!r} to confirm: ") != expected:
        raise InvalidRequest("Operation cancelled; confirmation did not match")


def _json_object(text: str, what: str) -> dict:
    """Parse a JSON object from the command line without leaking record content."""
    try:
        value = json.loads(text)
    except ValueError as exc:
        raise InvalidRequest(f"{what} must be a JSON object") from exc
    if not isinstance(value, dict):
        raise InvalidRequest(f"{what} must be a JSON object")
    return value


def _string_list(values: list[str] | None) -> list[str]:
    return list(values or [])


def _project_scope(store: MemoryStore, actor: Principal, project_id: str | None,
                   command: str) -> Scope:
    """Resolve a project scope, failing with a clear InvalidRequest without one."""
    if not project_id:
        raise InvalidRequest(
            f"{command} requires --project <project-id>; it is a project-scoped operation")
    return store.project_scope(actor, project_id)


def _add_scope_flags(parser: argparse.ArgumentParser, *, project_required: bool = True) -> None:
    parser.add_argument("--project",
                        help="Project id; resolves the scope through store.project_scope(actor, project_id)")
    parser.add_argument("--scope", choices=["person", "global"], default="person",
                        help="Non-project scope: person or global")


def _scope_flags_after_action(commands: argparse._SubParsersAction) -> None:
    """Let --project and --scope appear before OR after the action name.

    argparse parses an action in a fresh namespace and then copies its
    attributes onto the parent namespace, so an action-level default would
    overwrite a group-level value. SUPPRESS keeps the action from setting the
    attribute it was not given.
    """
    for group in commands.choices.values():
        candidates = list(getattr(group, "_actions", []) or [])
        candidates += list(getattr(group, "_group_actions", []) or [])
        sub = next((action for action in candidates
                    if isinstance(action, argparse._SubParsersAction)), None)
        if sub is None:
            continue
        scope_action = next((action for action in group._actions
                             if action.dest == "scope"), None)
        choices = tuple(scope_action.choices) if scope_action and scope_action.choices \
            else ("person", "global")
        for leaf in sub.choices.values():
            leaf.add_argument("--project", default=argparse.SUPPRESS,
                              help="Project id; may also be given before the action")
            leaf.add_argument("--scope", choices=choices, default=argparse.SUPPRESS,
                              help="Non-project scope; may also be given before the action")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="dai", description="D_AI local project and memory operator")
    root.add_argument("--data-root", type=Path, default=Path.home() / ".d-ai")
    root.add_argument("--version", action="version", version=__version__)
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("init")
    commands.add_parser("status")
    project = commands.add_parser("project").add_subparsers(dest="action", required=True)
    project.add_parser("list")
    create = project.add_parser("create")
    create.add_argument("name")
    create.add_argument("--id")
    memory = commands.add_parser("memory")
    memory.add_argument("--project")
    memory.add_argument("--scope", choices=["person", "project", "global"], default="project")
    actions = memory.add_subparsers(dest="action", required=True)
    create = actions.add_parser("create")
    create.add_argument("--kind", default="note")
    content = create.add_mutually_exclusive_group(required=True)
    content.add_argument("--json")
    content.add_argument("--file", type=Path)
    actions.add_parser("list")
    search = actions.add_parser("search")
    search.add_argument("query")
    for operation in ["get", "archive", "restore", "history", "purge"]:
        action = actions.add_parser(operation)
        action.add_argument("id")
        if operation in ["archive", "restore", "purge"]:
            action.add_argument("--version", type=int, required=True)
    backup = commands.add_parser("backup").add_subparsers(dest="action", required=True)
    for operation in ["create", "restore"]:
        action = backup.add_parser(operation)
        action.add_argument("path", type=Path)

    # ---- New command groups (add, never replace) ----
    _add_charter(commands)
    _add_task(commands)
    _add_decision(commands)
    _add_team(commands)
    _add_consultation(commands)
    _add_model(commands)
    _add_tool(commands)
    _add_component(commands)
    _add_update(commands)
    _scope_flags_after_action(commands)
    return root


def _add_charter(commands) -> None:
    charter = commands.add_parser("charter", help="Charter drafts, assessment, approval and the active charter")
    _add_scope_flags(charter)
    c_actions = charter.add_subparsers(dest="action", required=True)
    propose = c_actions.add_parser("propose", help="Propose a charter draft record")
    propose.add_argument("--json", required=True, help="Charter draft content as a JSON object")
    assess = c_actions.add_parser("assess", help="Assess a charter draft and list missing fields")
    assess.add_argument("draft_id", help="Charter draft record id")
    approve = c_actions.add_parser("approve", help="Approve an active charter draft (version-fenced)")
    approve.add_argument("draft_id", help="Charter draft record id")
    approve.add_argument("--expected-version", type=int, required=True,
                         help="Expected draft version before approval")
    c_actions.add_parser("active", help="Show the project's approved active charter")


def _add_task(commands) -> None:
    task = commands.add_parser("task", help="Durable task graph: create, show, list, state, lease, release, attempt, graph")
    _add_scope_flags(task)
    t_actions = task.add_subparsers(dest="action", required=True)
    create = t_actions.add_parser("create", help="Create a task against the approved active charter")
    create.add_argument("--objective", required=True, help="Bounded task objective")
    create.add_argument("--acceptance", action="append", help="Non-empty acceptance criterion (repeatable)")
    create.add_argument("--charter-id", help="Charter id (defaults to the active charter)")
    create.add_argument("--responsibility", help="Who is responsible for the task")
    create.add_argument("--inputs", action="append", help="Task input (repeatable)")
    create.add_argument("--outputs", action="append", help="Task output (repeatable)")
    create.add_argument("--depends-on", action="append", help="Task id this task depends on (repeatable)")
    create.add_argument("--idempotency-key", help="Idempotency key for repeat-safe creation")
    show = t_actions.add_parser("show", help="Show a task record")
    show.add_argument("task_id", help="Task record id")
    list_task = t_actions.add_parser("list", help="List task records")
    list_task.add_argument("--state", help="Filter by task state")
    list_task.add_argument("--limit", type=int, default=50, help="Maximum records to return")
    state = t_actions.add_parser("state", help="Advance a task state (version-fenced)")
    state.add_argument("task_id", help="Task record id")
    state.add_argument("--state", required=True, help="Target task state")
    state.add_argument("--expected-version", type=int, required=True, help="Expected task version")
    state.add_argument("--receipt", help="Receipt evidencing the transition")
    state.add_argument("--note", help="Note explaining the transition")
    lease = t_actions.add_parser("lease", help="Take an exclusive lease on a task")
    lease.add_argument("task_id", help="Task record id")
    lease.add_argument("--owner", required=True, help="Lease owner")
    lease.add_argument("--ttl", type=int, default=300, help="Lease TTL in seconds")
    release = t_actions.add_parser("release", help="Release a task lease")
    release.add_argument("task_id", help="Task record id")
    release.add_argument("--owner", required=True, help="Lease owner to release")
    attempt = t_actions.add_parser("attempt", help="Record a task attempt (the only path to COMPLETED)")
    attempt.add_argument("task_id", help="Task record id")
    attempt.add_argument("--attempt-id", required=True, help="Attempt id")
    attempt.add_argument("--outcome", required=True, help="SUCCESS, FAILURE, PARTIAL or CANCELLED")
    attempt.add_argument("--artifacts", action="append", help="Attempt artifact (repeatable)")
    attempt.add_argument("--receipt", help="Attempt receipt")
    attempt.add_argument("--idempotency-key", help="Idempotency key for repeat-safe attempt")
    t_actions.add_parser("graph", help="Return the task dependency graph")


def _add_decision(commands) -> None:
    decision = commands.add_parser("decision", help="Versioned decisions: record, list, supersede, withdraw, affected")
    _add_scope_flags(decision)
    d_actions = decision.add_subparsers(dest="action", required=True)
    record = d_actions.add_parser("record", help="Record a new decision")
    record.add_argument("--text", required=True, help="Bounded decision text")
    record.add_argument("--meaning", required=True, help="Bounded decision meaning")
    record.add_argument("--authorization-source", required=True, help="Mandatory non-empty authority source")
    record.add_argument("--affects", action="append", help="Unit affected by the decision (repeatable)")
    record.add_argument("--supersedes", help="Active decision id this supersedes")
    record.add_argument("--idempotency-key", help="Idempotency key for repeat-safe recording")
    d_actions.add_parser("list", help="List active decisions")
    supersede = d_actions.add_parser("supersede", help="Supersede an active decision with a new record")
    supersede.add_argument("decision_id", help="Decision record id")
    supersede.add_argument("--text", required=True, help="Bounded decision text")
    supersede.add_argument("--authorization-source", required=True, help="Mandatory non-empty authority source")
    supersede.add_argument("--expected-version", type=int, required=True, help="Expected decision version")
    supersede.add_argument("--idempotency-key", help="Idempotency key for repeat-safe supersede")
    withdraw = d_actions.add_parser("withdraw", help="Withdraw an active decision")
    withdraw.add_argument("decision_id", help="Decision record id")
    withdraw.add_argument("--reason", required=True, help="Withdrawal reason")
    withdraw.add_argument("--expected-version", type=int, required=True, help="Expected decision version")
    affected = d_actions.add_parser("affected", help="List active decisions affecting a unit")
    affected.add_argument("--unit", required=True, help="Unit to check")


def _add_team(commands) -> None:
    team = commands.add_parser("team", help="Team, agent tree, messages and consultations")
    _add_scope_flags(team)
    ta_actions = team.add_subparsers(dest="action", required=True)
    create = ta_actions.add_parser("create", help="Create a team")
    create.add_argument("--name", required=True, help="Bounded team name")
    create.add_argument("--roles", action="append", help="Team role (repeatable)")
    create.add_argument("--idempotency-key", help="Idempotency key for repeat-safe creation")
    add_agent = ta_actions.add_parser("add-agent", help="Add an agent to a team")
    add_agent.add_argument("--team", required=True, help="Team record id")
    add_agent.add_argument("--agent-id", required=True, help="Agent id")
    add_agent.add_argument("--role", required=True, help="Agent role")
    add_agent.add_argument("--parent-agent", help="Parent agent id for the tree")
    add_agent.add_argument("--model", help="Agent model")
    add_agent.add_argument("--budget", help="Agent budget as a JSON object")
    agents = ta_actions.add_parser("agents", help="List agents in a team")
    agents.add_argument("--team", required=True, help="Team record id")
    tree = ta_actions.add_parser("tree", help="Show the agent tree")
    tree.add_argument("--team", required=True, help="Team record id")
    assign = ta_actions.add_parser("assign", help="Assign a task to an agent")
    assign.add_argument("--team", required=True, help="Team record id")
    assign.add_argument("--agent-id", required=True, help="Agent id")
    assign.add_argument("--task-id", required=True, help="Task id")
    assign.add_argument("--idempotency-key", help="Idempotency key for repeat-safe assignment")
    message = ta_actions.add_parser("message", help="Send a message from one agent to another")
    message.add_argument("--from-agent", required=True, help="Sending agent id")
    message.add_argument("--to-agent", required=True, help="Receiving agent id")
    message.add_argument("--body", required=True, help="Bounded message body")
    message.add_argument("--references", action="append", help="Message reference (repeatable)")
    message.add_argument("--idempotency-key", help="Idempotency key for repeat-safe message")
    inbox = ta_actions.add_parser("inbox", help="List an agent's inbox")
    inbox.add_argument("--agent-id", required=True, help="Agent id")
    inbox.add_argument("--status", help="Filter by message status")
    acknowledge = ta_actions.add_parser("acknowledge", help="Acknowledge a SENT message")
    acknowledge.add_argument("message_id", help="Message record id")
    acknowledge.add_argument("--status", required=True, help="ACKNOWLEDGED, APPLIED or NEEDS_DECISION")
    acknowledge.add_argument("--expected-version", type=int, required=True, help="Expected message version")


def _add_consultation(commands) -> None:
    consultation = commands.add_parser("consultation",
                                       help="Consultations: open, reply, status, list")
    _add_scope_flags(consultation)
    co_actions = consultation.add_subparsers(dest="action", required=True)
    open_consult = co_actions.add_parser("open", help="Open a consultation")
    open_consult.add_argument("--parent-session", required=True, help="Parent session id")
    open_consult.add_argument("--question", required=True, help="Bounded question")
    open_consult.add_argument("--mode", default="ask", help="ask, analyse or suggest")
    reply = co_actions.add_parser("reply", help="Reply to a consultation")
    reply.add_argument("consultation_id", help="Consultation record id")
    reply.add_argument("--body", required=True, help="Bounded reply body")
    reply.add_argument("--references", action="append", help="Reply reference (repeatable)")
    reply.add_argument("--idempotency-key", help="Idempotency key for repeat-safe reply")
    status_consult = co_actions.add_parser("status", help="Advance a consultation status")
    status_consult.add_argument("consultation_id", help="Consultation record id")
    status_consult.add_argument("--status", required=True, help="Next consultation status")
    status_consult.add_argument("--expected-version", type=int, required=True,
                                help="Expected consultation version")
    list_consult = co_actions.add_parser("list", help="List consultations")
    list_consult.add_argument("--parent-session",
                              help="Only consultations bound to this parent session")


def _add_model(commands) -> None:
    model = commands.add_parser("model", help="Model registry, routing, metering and usage")
    _add_scope_flags(model)
    m_actions = model.add_subparsers(dest="action", required=True)
    register = m_actions.add_parser("register", help="Register a model")
    register.add_argument("--model-id", required=True, help="Model id")
    register.add_argument("--provider", required=True, help="Model provider")
    register.add_argument("--capabilities", action="append", required=True,
                          help="Model capability (repeatable, at least one)")
    register.add_argument("--context-window", type=int, help="Positive context window")
    register.add_argument("--cost-input-per-1k", help="Input cost per 1k tokens as a decimal string")
    register.add_argument("--cost-output-per-1k", help="Output cost per 1k tokens as a decimal string")
    register.add_argument("--cost-currency", help="Cost currency code")
    register.add_argument("--cost-basis", default="unknown", help="measured, estimated or unknown")
    register.add_argument("--tool-support", action="append", help="Tool supported by the model (repeatable)")
    register.add_argument("--availability", default="unknown",
                          help="available, limited, unavailable or unknown")
    register.add_argument("--notes", default="", help="Model notes")
    m_actions.add_parser("list", help="List registered models")
    route = m_actions.add_parser("route", help="Route a task class to a model")
    route.add_argument("--task-class", required=True, help="Bounded task class")
    route.add_argument("--required-capabilities", action="append", help="Required capability (repeatable)")
    route.add_argument("--max-cost-per-1k", help="Maximum input cost per 1k tokens")
    choose = m_actions.add_parser("choose", help="Choose a model for a role")
    choose.add_argument("--model-id", required=True, help="Model id")
    choose.add_argument("--role", required=True, help="Role the model is assigned to")
    choose.add_argument("--reason", required=True, help="Bounded reason for the assignment")
    choose.add_argument("--task-class", required=True, help="Bounded task class")
    choose.add_argument("--idempotency-key", help="Idempotency key for repeat-safe choice")
    meter = m_actions.add_parser("meter", help="Meter model usage (append-only ledger)")
    meter.add_argument("--model-id", required=True, help="Model id")
    meter.add_argument("--task-class", required=True, help="Bounded task class")
    meter.add_argument("--input-tokens", type=int, help="Non-negative input token count")
    meter.add_argument("--output-tokens", type=int, help="Non-negative output token count")
    meter.add_argument("--cache-tokens", type=int, help="Non-negative cache token count")
    meter.add_argument("--cost", help="Cost as a decimal string")
    meter.add_argument("--cost-basis", default="unknown", help="measured, estimated or unknown")
    meter.add_argument("--latency-ms", type=int, help="Non-negative latency in ms")
    meter.add_argument("--status", default="ok", help="Bounded status")
    m_actions.add_parser("usage", help="Return actual, estimated and unknown usage")


def _add_tool(commands) -> None:
    tool = commands.add_parser("tool", help="Tool gateway: register, list, resolve, invoke")
    _add_scope_flags(tool)
    t_actions = tool.add_subparsers(dest="action", required=True)
    register = t_actions.add_parser("register", help="Register a tool")
    register.add_argument("--tool-id", required=True, help="Tool id")
    register.add_argument("--systems", action="append", required=True,
                          help="System the tool is available to (repeatable, at least one)")
    register.add_argument("--effect", required=True, help="Bounded effect")
    register.add_argument("--required-capability", help="Capability required to invoke the tool")
    register.add_argument("--side-effect", default="none", help="Bounded side effect")
    register.add_argument("--data-classes", action="append", help="Data class touched (repeatable)")
    register.add_argument("--provider", default="local", help="Tool provider")
    t_actions.add_parser("list", help="List registered tools")
    resolve = t_actions.add_parser("resolve", help="Resolve whether a tool is authorized")
    resolve.add_argument("--tool-id", required=True, help="Tool id")
    resolve.add_argument("--system", required=True, help="System identity")
    resolve.add_argument("--action", dest="tool_action", required=True, help="Action identity")
    invoke = t_actions.add_parser("invoke", help="Record an authorized or denied tool attempt")
    invoke.add_argument("--tool-id", required=True, help="Tool id")
    invoke.add_argument("--system", required=True, help="System identity")
    invoke.add_argument("--action", dest="tool_action", required=True, help="Action identity")
    invoke.add_argument("--payload", help="Invocation payload as a JSON object (never persisted)")
    invoke.add_argument("--idempotency-key", help="Idempotency key for repeat-safe invocation")


def _add_component(commands) -> None:
    component = commands.add_parser("component",
                                    help="External component adoption: propose, decide, adopt, list, verify, import")
    _add_scope_flags(component)
    c_actions = component.add_subparsers(dest="action", required=True)
    propose = c_actions.add_parser("propose", help="Propose an external component")
    propose.add_argument("--source-url", required=True,
                         help="https://github.com/<owner>/<repo> source URL")
    propose.add_argument("--name", required=True, help="Bounded component name")
    propose.add_argument("--license", default="UNKNOWN", help="Component license verbatim")
    propose.add_argument("--commit", help="Bounded commit reference")
    propose.add_argument("--patterns", action="append", required=True,
                         help="Concrete named transferable pattern, at least 12 chars (repeatable)")
    propose.add_argument("--requirements", action="append", help="Requirement (repeatable)")
    propose.add_argument("--abstraction", help="Bounded abstraction")
    propose.add_argument("--notes", default="", help="Proposal notes")
    propose.add_argument("--idempotency-key", help="Idempotency key for repeat-safe proposal")
    decide = c_actions.add_parser("decide", help="Decide a component (version-fenced, one decision)")
    decide.add_argument("component_id", help="Component record id")
    decide.add_argument("--decision", required=True, help="ADOPT_PATTERN, ADOPT_PATTERN_AFTER_X, REFERENCE_ONLY or REJECT")
    decide.add_argument("--rationale", required=True, help="Bounded rationale")
    decide.add_argument("--expected-version", type=int, required=True, help="Expected component version")
    adopt = c_actions.add_parser("adopt", help="Adopt a decided component into D_AI-native files")
    adopt.add_argument("component_id", help="Component record id")
    adopt.add_argument("--capability-id", required=True, help="D_AI-native capability id")
    adopt.add_argument("--bindings", required=True, help="Bindings dict of known D_AI contract names as JSON")
    adopt.add_argument("--files", action="append", required=True,
                       help="D_AI-relative file path inside the tree (repeatable)")
    adopt.add_argument("--verification", required=True, help="Bounded verification string")
    adopt.add_argument("--expected-version", type=int, required=True, help="Expected component version")
    c_actions.add_parser("list", help="List proposed and adopted components")
    verify = c_actions.add_parser("verify", help="Verify adopted files still exist and the capability is reachable")
    verify.add_argument("component_id", help="Component record id")
    import_manifest = c_actions.add_parser("import", help="Import and propose components from a manifest")
    import_manifest.add_argument("--manifest", required=True, help="Path to a components manifest JSON file")


def _add_update(commands) -> None:
    update = commands.add_parser("update", help="Weekly update watcher: status, check, plan, decide, apply, rollback")
    _add_scope_flags(update)
    u_actions = update.add_subparsers(dest="action", required=True)
    u_actions.add_parser("status", help="Show watcher state and whether a check is due")
    check = u_actions.add_parser("check", help="Perform a real network check of a source")
    check.add_argument("--source", required=True, help="Source URL to check")
    check.add_argument("--channel", default="default", help="Bounded channel")
    check.add_argument("--ref", help="Bounded ref")
    plan = u_actions.add_parser("plan", help="Plan an update (project-scoped)")
    plan.add_argument("--source", required=True, help="Bounded source")
    plan.add_argument("--version", required=True, help="Bounded version")
    plan.add_argument("--commit", required=True, help="Bounded commit")
    plan.add_argument("--diff", required=True, help="Bounded diff")
    plan.add_argument("--impact", required=True, help="Bounded impact")
    plan.add_argument("--migration", default="", help="Migration string")
    decide = u_actions.add_parser("decide", help="Decide a planned update (project-scoped)")
    decide.add_argument("update_id", help="Update record id")
    decide.add_argument("--decision", required=True, help="update, defer or ignore")
    decide.add_argument("--expected-version", type=int, required=True, help="Expected update version")
    apply = u_actions.add_parser("apply", help="Apply a decided update (project-scoped)")
    apply.add_argument("update_id", help="Update record id")
    apply.add_argument("--expected-version", type=int, required=True, help="Expected update version")
    apply.add_argument("--rollback-token", help="Rollback token")
    rollback = u_actions.add_parser("rollback", help="Roll back an applied update (project-scoped)")
    rollback.add_argument("update_id", help="Update record id")
    rollback.add_argument("--expected-version", type=int, required=True, help="Expected update version")


def _dispatch_new(args: argparse.Namespace, store: MemoryStore, actor: Principal):
    """Dispatch the new command groups. Returns a JSON-serialisable result or None."""
    if args.command == "charter":
        svc = CharterService(store)
        scope = _project_scope(store, actor, args.project, "charter")
        if args.action == "propose":
            return asdict(svc.propose(actor, scope, _json_object(args.json, "charter proposal content")))
        if args.action == "assess":
            return svc.assess(actor, scope, args.draft_id)
        if args.action == "approve":
            return asdict(svc.approve(actor, scope, args.draft_id, expected_version=args.expected_version))
        if args.action == "active":
            return asdict(svc.active(actor, scope))
    if args.command == "task":
        svc = TaskService(store)
        scope = _project_scope(store, actor, args.project, "task")
        if args.action == "create":
            return asdict(svc.create_task(actor, scope, objective=args.objective,
                                          acceptance=_string_list(args.acceptance),
                                          charter_id=args.charter_id,
                                          responsibility=args.responsibility,
                                          inputs=_string_list(args.inputs),
                                          outputs=_string_list(args.outputs),
                                          depends_on=_string_list(args.depends_on),
                                          idempotency_key=args.idempotency_key))
        if args.action == "show":
            return asdict(svc.get(actor, scope, args.task_id))
        if args.action == "list":
            return [asdict(r) for r in svc.list(actor, scope, state=args.state, limit=args.limit)]
        if args.action == "state":
            return asdict(svc.set_state(actor, scope, args.task_id, state=args.state,
                                        expected_version=args.expected_version,
                                        receipt=args.receipt, note=args.note or ""))
        if args.action == "lease":
            return asdict(svc.lease(actor, scope, args.task_id, owner=args.owner, ttl=args.ttl))
        if args.action == "release":
            return asdict(svc.release(actor, scope, args.task_id, owner=args.owner))
        if args.action == "attempt":
            return asdict(svc.record_attempt(actor, scope, args.task_id, attempt_id=args.attempt_id,
                                             outcome=args.outcome,
                                             artifacts=_string_list(args.artifacts),
                                             receipt=args.receipt,
                                             idempotency_key=args.idempotency_key))
        if args.action == "graph":
            return svc.graph(actor, scope)
    if args.command == "decision":
        svc = DecisionService(store)
        scope = _project_scope(store, actor, args.project, "decision")
        if args.action == "record":
            return asdict(svc.record(actor, scope, text=args.text, meaning=args.meaning,
                                     authorization_source=args.authorization_source,
                                     affects=_string_list(args.affects),
                                     supersedes=args.supersedes,
                                     idempotency_key=args.idempotency_key))
        if args.action == "list":
            return [asdict(r) for r in svc.active(actor, scope)]
        if args.action == "supersede":
            return asdict(svc.supersede(actor, scope, args.decision_id, text=args.text,
                                        authorization_source=args.authorization_source,
                                        expected_version=args.expected_version,
                                        idempotency_key=args.idempotency_key))
        if args.action == "withdraw":
            return asdict(svc.withdraw(actor, scope, args.decision_id, reason=args.reason,
                                       expected_version=args.expected_version))
        if args.action == "affected":
            return [asdict(r) for r in svc.affected(actor, scope, args.unit)]
    if args.command == "team":
        svc = TeamService(store)
        scope = _project_scope(store, actor, args.project, "team")
        if args.action == "create":
            return asdict(svc.create_team(actor, scope, name=args.name,
                                          roles=_string_list(args.roles),
                                          idempotency_key=args.idempotency_key))
        if args.action == "add-agent":
            return asdict(svc.add_agent(actor, scope, args.team, agent_id=args.agent_id, role=args.role,
                                        parent_agent=args.parent_agent, model=args.model,
                                        budget=_json_object(args.budget, "team budget") if args.budget else None))
        if args.action == "agents":
            return svc.agents(actor, scope, args.team)
        if args.action == "tree":
            return svc.tree(actor, scope, args.team)
        if args.action == "assign":
            return asdict(svc.assign(actor, scope, args.team, agent_id=args.agent_id, task_id=args.task_id,
                                     idempotency_key=args.idempotency_key))
        if args.action == "message":
            return asdict(svc.message_leader(actor, scope, from_agent=args.from_agent, to_agent=args.to_agent,
                                             body=args.body, references=_string_list(args.references),
                                             idempotency_key=args.idempotency_key))
        if args.action == "inbox":
            return [asdict(r) for r in svc.inbox(actor, scope, agent_id=args.agent_id, status=args.status)]
        if args.action == "acknowledge":
            return asdict(svc.acknowledge(actor, scope, args.message_id, status=args.status,
                                          expected_version=args.expected_version))
    if args.command == "consultation":
        svc = TeamService(store)
        scope = _project_scope(store, actor, args.project, "consultation")
        if args.action == "open":
            return asdict(svc.open_consultation(actor, scope, parent_session=args.parent_session,
                                                question=args.question, mode=args.mode))
        if args.action == "reply":
            return asdict(svc.consultation_reply(actor, scope, args.consultation_id, body=args.body,
                                                 references=_string_list(args.references),
                                                 idempotency_key=args.idempotency_key))
        if args.action == "status":
            return asdict(svc.consult_consultation(actor, scope, args.consultation_id, status=args.status,
                                                   expected_version=args.expected_version))
        if args.action == "list":
            return [asdict(r) for r in svc.list_consultations(actor, scope, parent_session=args.parent_session)]
    if args.command == "model":
        svc = ModelRegistry(store)
        scope = _project_scope(store, actor, args.project, "model")
        if args.action == "register":
            return asdict(svc.register(actor, scope, model_id=args.model_id, provider=args.provider,
                                       capabilities=_string_list(args.capabilities),
                                       context_window=args.context_window,
                                       cost_input_per_1k=args.cost_input_per_1k,
                                       cost_output_per_1k=args.cost_output_per_1k,
                                       cost_currency=args.cost_currency, cost_basis=args.cost_basis,
                                       tool_support=_string_list(args.tool_support),
                                       availability=args.availability, notes=args.notes))
        if args.action == "list":
            return svc.catalog(actor, scope)
        if args.action == "route":
            return svc.route(actor, scope, task_class=args.task_class,
                             required_capabilities=_string_list(args.required_capabilities),
                             max_cost_per_1k=args.max_cost_per_1k)
        if args.action == "choose":
            return asdict(svc.choose(actor, scope, model_id=args.model_id, role=args.role,
                                     reason=args.reason, task_class=args.task_class,
                                     idempotency_key=args.idempotency_key))
        if args.action == "meter":
            return asdict(svc.meter(actor, scope, model_id=args.model_id, task_class=args.task_class,
                                    input_tokens=args.input_tokens, output_tokens=args.output_tokens,
                                    cache_tokens=args.cache_tokens, cost=args.cost,
                                    cost_basis=args.cost_basis, latency_ms=args.latency_ms,
                                    status=args.status))
        if args.action == "usage":
            return svc.usage(actor, scope)
    if args.command == "tool":
        svc = ToolGateway(store)
        scope = _project_scope(store, actor, args.project, "tool")
        if args.action == "register":
            return asdict(svc.register(actor, scope, tool_id=args.tool_id, systems=_string_list(args.systems),
                                       effect=args.effect, required_capability=args.required_capability,
                                       side_effect=args.side_effect,
                                       data_classes=_string_list(args.data_classes),
                                       provider=args.provider))
        if args.action == "list":
            return svc.catalog(actor, scope)
        if args.action == "resolve":
            return svc.resolve(actor, scope, tool_id=args.tool_id, system=args.system, action=args.tool_action)
        if args.action == "invoke":
            payload = _json_object(args.payload, "tool invocation payload") if args.payload else None
            return svc.invoke(actor, scope, tool_id=args.tool_id, system=args.system, action=args.tool_action,
                              payload=payload, idempotency_key=args.idempotency_key)
    if args.command == "component":
        svc = ComponentRegistry(store)
        scope = _project_scope(store, actor, args.project, "component")
        if args.action == "propose":
            return asdict(svc.propose(actor, scope, source_url=args.source_url, name=args.name,
                                      license=args.license, commit=args.commit,
                                      patterns=_string_list(args.patterns),
                                      requirements=_string_list(args.requirements),
                                      abstraction=args.abstraction, notes=args.notes,
                                      idempotency_key=args.idempotency_key))
        if args.action == "decide":
            return asdict(svc.decide(actor, scope, args.component_id, decision=args.decision,
                                     rationale=args.rationale, expected_version=args.expected_version))
        if args.action == "adopt":
            return asdict(svc.adopt(actor, scope, args.component_id, capability_id=args.capability_id,
                                    bindings=_json_object(args.bindings, "component bindings"),
                                    files=_string_list(args.files), verification=args.verification,
                                    expected_version=args.expected_version))
        if args.action == "list":
            return svc.catalog(actor, scope)
        if args.action == "verify":
            return svc.verify(actor, scope, args.component_id)
        if args.action == "import":
            entries = ComponentRegistry.from_manifest(args.manifest, store=store, actor=actor, scope=scope)
            return [asdict(r) for r in entries]
    if args.command == "update":
        svc = UpdateWatcher(store)
        if args.action == "status":
            return svc.status(actor)
        if args.action == "check":
            return svc.check(actor, source=args.source, channel=args.channel, ref=args.ref)
        scope = _project_scope(store, actor, args.project, "update")
        if args.action == "plan":
            return asdict(svc.plan(actor, scope, source=args.source, version=args.version,
                                   commit=args.commit, diff=args.diff, impact=args.impact,
                                   migration=args.migration))
        if args.action == "decide":
            return asdict(svc.decide(actor, scope, args.update_id, decision=args.decision,
                                     expected_version=args.expected_version))
        if args.action == "apply":
            return asdict(svc.apply(actor, scope, args.update_id, expected_version=args.expected_version,
                                    rollback_token=args.rollback_token))
        if args.action == "rollback":
            return asdict(svc.rollback(actor, scope, args.update_id, expected_version=args.expected_version))
    raise InvalidRequest(f"Unknown command {args.command!r} {args.action!r}")


def dispatch(args: argparse.Namespace):
    actor = local_principal()
    store = MemoryStore(args.data_root, administrator=actor.id)
    if args.command in ("init", "status"):
        return {"version": __version__, "data_root": str(store.root), "principal": actor.id,
                "projects": len(store.projects(actor)), "release_status": "NOT_READY",
                "note": "Full host/domain acceptance remains in progress; memory checks do not prove D_AI 1.0 complete."}
    if args.command == "project":
        return ([asdict(p) for p in store.projects(actor)] if args.action == "list" else
                asdict(store.create_project(actor, args.name, project_id=args.id)))
    if args.command == "backup":
        if args.action == "create":
            return {"snapshot": str(store.snapshot(actor, args.path)), "contains_keys": False,
                    "restore_requires": "the same live installation key authority"}
        confirm("Restore replaces the three live database states. Permanently purged keys are not restored.", "RESTORE")
        store.restore_snapshot(actor, args.path)
        return {"restored": True}
    if args.command in ("charter", "task", "decision", "team", "consultation", "model", "tool",
                        "component", "update"):
        return _dispatch_new(args, store, actor)
    scope = (store.project_scope(actor, args.project) if args.project else
             Scope(args.scope, actor.id) if args.scope != "project" else None)
    if scope is None:
        raise InvalidRequest("Project memory requires --project; use --scope person or global explicitly")
    if args.action == "create":
        try:
            content = json.loads(args.json if args.json is not None else args.file.read_text())
        except (OSError, ValueError) as exc:
            raise InvalidRequest("Could not read a JSON content object") from exc
        return asdict(store.create(actor, scope, args.kind, content))
    if args.action == "list":
        return [asdict(r) for r in store.list(actor, scope)]
    if args.action == "search":
        return [asdict(r) for r in store.search(actor, scope, args.query)]
    if args.action == "history":
        return [asdict(r) for r in store.history(actor, scope, args.id)]
    if args.action == "get":
        return asdict(store.get(actor, scope, args.id))
    if args.action == "archive":
        return asdict(store.archive(actor, scope, args.id, expected_version=args.version))
    if args.action == "restore":
        return asdict(store.restore_record(actor, scope, args.id, expected_version=args.version))
    preview = store.request_purge(actor, scope, args.id, expected_version=args.version)
    confirm(f"Permanently erase {scope.key}/{args.id} version {args.version}, its revisions and managed recall. "
            "Old database snapshots cannot recover its key. Manually exported keys/data or provider copies "
            "are outside this operation. It cannot be undone through D_AI.", f"DELETE {args.id}")
    store.confirm_purge(actor, preview)
    return {"id": args.id, "purged": True, "recoverable": False}


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        result = dispatch(args)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except DaiError as exc:
        print(json.dumps({"error": type(exc).__name__, "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
