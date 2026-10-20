"""D_AI -> pi host integration contract: declared capabilities, observed
state, and operation-to-pi-action descriptors.

This adapter:
  * declares the capabilities D_AI expects from a pi host (session identity,
    subagent spawn, model selection, "/" commands, message send, cancel,
    compaction, tool exposure) with a status of SUPPORTED | UNSUPPORTED |
    UNVERIFIED for each;
  * provides a probe function that reports the REAL observed state and never
    guesses: if the pi binary is not on PATH it reports NOT_INSTALLED with
    the reason, and every capability it cannot observe is UNVERIFIED;
  * provides the mapping from a D_AI operation to a pi action as a request
    DESCRIPTOR that a pi integration would execute. The adapter itself
    performs NO model call and NO external action: it is a contract, not a
    runner.
"""

from __future__ import annotations

import json
import os
from typing import Any

from dai.errors import InvalidRequest

try:  # imported as adapters.pi.pi_adapter
    from .probe import probe as _pi_probe
except ImportError:  # run directly as a script
    from probe import probe as _pi_probe  # type: ignore[no-redef]

SUPPORTED = "SUPPORTED"
UNSUPPORTED = "UNSUPPORTED"
UNVERIFIED = "UNVERIFIED"
NOT_INSTALLED = "NOT_INSTALLED"

CAPABILITIES: dict[str, dict[str, Any]] = {
    "session_identity": {
        "status": UNVERIFIED,
        "reason": "pi host session identity has not been observed",
    },
    "subagent_spawn": {
        "status": UNVERIFIED,
        "reason": "pi host subagent spawning has not been observed",
    },
    "model_selection": {
        "status": UNVERIFIED,
        "reason": "pi host model selection has not been observed",
    },
    "slash_commands": {
        "status": UNVERIFIED,
        "reason": "pi host \"/\" commands have not been observed",
    },
    "message_send": {
        "status": UNVERIFIED,
        "reason": "pi host message sending has not been observed",
    },
    "cancel": {
        "status": UNVERIFIED,
        "reason": "pi host cancellation has not been observed",
    },
    "compaction": {
        "status": UNVERIFIED,
        "reason": "pi host compaction has not been observed",
    },
    "tool_exposure": {
        "status": UNVERIFIED,
        "reason": "pi host tool exposure has not been observed",
    },
}

# Mapping from a D_AI operation to a pi action. Each entry is a request
# DESCRIPTOR: a pi integration would execute it, this adapter never does.
_OPERATION_DESCRIPTORS: dict[str, dict[str, Any]] = {
    "dai_project_create": {
        "host": "pi", "action": "workspace.create",
        "request": {
            "kind": "project.create",
            "metadata": {"dai_operation": "dai_project_create"},
        },
        "note": "A pi integration creates the pi workspace for this D_AI project.",
    },
    "dai_charter_propose": {
        "host": "pi", "action": "subagent.send",
        "request": {
            "kind": "subagent.message",
            "agent": "dai-coordinator",
            "body": "...",
            "metadata": {"dai_operation": "dai_charter_propose"},
        },
        "note": "The charter proposal is conveyed to the pi host as a bounded message.",
    },
    "dai_task_create": {
        "host": "pi", "action": "subagent.spawn",
        "request": {
            "kind": "subagent.spawn",
            "agent": "dai-engineer",
            "task": "...",
            "metadata": {"dai_operation": "dai_task_create"},
        },
        "note": "A pi subagent executes the task; the adapter only describes the request.",
    },
    "dai_task_state": {
        "host": "pi", "action": "subagent.report",
        "request": {
            "kind": "task.state.change",
            "metadata": {"dai_operation": "dai_task_state"},
        },
        "note": "Task state advances are reported to D_AI, never assumed.",
    },
    "dai_decision_record": {
        "host": "pi", "action": "subagent.send",
        "request": {
            "kind": "decision.record",
            "metadata": {"dai_operation": "dai_decision_record"},
        },
        "note": "Decisions are recorded in D_AI core; pi only carries the intent.",
    },
    "dai_team_create": {
        "host": "pi", "action": "team.create",
        "request": {
            "kind": "team.create",
            "metadata": {"dai_operation": "dai_team_create"},
        },
        "note": "Describes the team to spawn on the pi host.",
    },
    "dai_team_message": {
        "host": "pi", "action": "agent.message",
        "request": {
            "kind": "agent.message",
            "metadata": {"dai_operation": "dai_team_message"},
        },
        "note": "Message send across the pi host boundary.",
    },
    "dai_consultation_open": {
        "host": "pi", "action": "consultation.open",
        "request": {
            "kind": "consultation.open",
            "metadata": {"dai_operation": "dai_consultation_open"},
        },
        "note": "Opens a consultation on the pi host bound to a parent session.",
    },
    "dai_model_register": {
        "host": "pi", "action": "model.register",
        "request": {
            "kind": "model.register",
            "metadata": {"dai_operation": "dai_model_register"},
        },
        "note": "Declares a model available on the pi host to D_AI.",
    },
    "dai_model_route": {
        "host": "pi", "action": "model.route",
        "request": {
            "kind": "model.route",
            "metadata": {"dai_operation": "dai_model_route"},
        },
        "note": "The pi integration routes; D_AI never chooses for it.",
    },
    "dai_tool_register": {
        "host": "pi", "action": "tool.register",
        "request": {
            "kind": "tool.register",
            "metadata": {"dai_operation": "dai_tool_register"},
        },
        "note": "Exposes a pi tool to D_AI's gateway policy.",
    },
    "dai_component_propose": {
        "host": "pi", "action": "component.propose",
        "request": {
            "kind": "component.propose",
            "metadata": {"dai_operation": "dai_component_propose"},
        },
        "note": "Proposes an external component via the pi host.",
    },
    "dai_update_plan": {
        "host": "pi", "action": "update.plan",
        "request": {
            "kind": "update.plan",
            "metadata": {"dai_operation": "dai_update_plan"},
        },
        "note": "Describes a planned update; the owner decides in D_AI.",
    },
    "dai_memory_create": {
        "host": "pi", "action": "memory.create",
        "request": {
            "kind": "memory.create",
            "metadata": {"dai_operation": "dai_memory_create"},
        },
        "note": "Creates a memory record in D_AI core from pi observations.",
    },
    "dai_backup_create": {
        "host": "pi", "action": "snapshot.create",
        "request": {
            "kind": "backup.create",
            "metadata": {"dai_operation": "dai_backup_create"},
        },
        "note": "Requests a snapshot; restore stays CLI-only in D_AI.",
    },
}


def probe_capabilities(binary: str | None = None) -> dict[str, Any]:
    """Probe the pi host and map the observation to the capability map.

    When the pi binary is absent every capability is NOT_INSTALLED with the
    real reason. When the binary is present, session-level capabilities
    remain UNVERIFIED because they cannot be confirmed without acting
    through a pi session.
    """
    observed = _pi_probe(binary)
    capabilities: dict[str, dict[str, Any]] = {}
    for name, entry in CAPABILITIES.items():
        capabilities[name] = dict(entry)
    if not observed.get("installed"):
        reason = observed.get(
            "reason", "pi binary is not installed")
        for name in capabilities:
            capabilities[name] = {
                "status": NOT_INSTALLED,
                "reason": reason,
            }
    else:
        for name in capabilities:
            capabilities[name]["reason"] = (
                "pi binary is installed but session-level capability has "
                "not been observed without acting through a pi session")
            capabilities[name]["status"] = UNVERIFIED
    return {"pi": observed, "capabilities": capabilities}


def operation_descriptor(operation: str, **params: Any) -> dict[str, Any]:
    """Return the pi request DESCRIPTOR for a D_AI operation.

    Performs no model call and no external action. Raises InvalidRequest for
    an unknown operation.
    """
    if operation not in _OPERATION_DESCRIPTORS:
        raise InvalidRequest(
            f"Unknown D_AI operation for pi mapping: {operation}")
    descriptor = dict(_OPERATION_DESCRIPTORS[operation])
    descriptor["params"] = dict(params)
    descriptor["executed"] = False
    descriptor["note"] = (
        "A pi integration executes this descriptor; this adapter performs "
        "no model call and no external action.")
    return descriptor


def main() -> int:
    print(json.dumps(probe_capabilities(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
