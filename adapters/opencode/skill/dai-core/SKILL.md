---
name: dai-core
description: "Shared core for every DAI agent: adaptive workflow depth, durable mission contracts and versioned checkpoints (WAITING_FOR_HUMAN/DATA/SCHEDULE/RESOURCES), source and claim evidence hygiene (locator, hash, FACT/STATEMENT/ANALYSIS/INFERENCE/HYPOTHESIS/UNKNOWN), independent read-only review of completed batches, and bounded collaboration between systems. Use when a task has phases, interruptions, conflicting evidence, consequential decisions, factual claims or citations, substantive implementation to verify, or needs another specialty. Do not use for stable one-step tasks or as a substitute for domain analysis; completion needs artifacts and review, never schema validation alone."
metadata:
  version: "3.0.0"
  status: "merged"
  merged_from: "adaptive-workflow-os + dai-mission + dai-evidence + dai-review + dai-collaboration"
---

# dai-core

This is the shared merged skill: the five original skills are kept complete as the sections below and are read as one chain — workflow, then mission, then evidence, then review, then collaboration. Original section names are preserved for semantic search, and no new behavior rules were added in the merge.

## adaptive-workflow-os — سير العمل التكيفي

Adapt the work to the user's actual goal. Choose the lightest workflow that can produce a reliable result. This skill supports normal discovery and explicit invocation; installation does not guarantee invocation in every chat.

### Essential decisions

- Judge proposals by evidence, mechanism, constraints, and consequences. Popularity, praise, and criticism do not establish correctness. Apply the same standards to competing ideas.
- Preserve the requested outcome, constraints, existing authorization, language, and voice. A workflow cannot grant permission or expand the assignment.
- Prefer observed environment state, authoritative sources, and meaningful checks to model confidence. Report completion only to the extent supported by evidence.
- When an attempt fails, use the failure to change the next action. Avoid repeating a side effect before checking whether it already succeeded.
- Finish when the requested outcome and necessary checks are complete. Do not add work merely to satisfy a process.

### Choose depth

Use the lowest useful depth and revise it as evidence changes:

- **SNAP:** stable one-step work; answer or act directly.
- **STANDARD:** ordinary multi-step work; identify the deliverable and use targeted checks.
- **DEEP:** difficult engineering, conflicting evidence, substantial uncertainty, or large inputs; divide into useful subgoals and strengthen verification.
- **CRITICAL:** consequential or irreversible decisions; use stronger source and state checks, explicit uncertainty, and the applicable permission boundaries.

Depth is a work allocation choice, not a required visible label or fixed sequence. Follow higher-priority requirements for browsing, authorization, specialized skills, and available tools.

### Work and route

Infer what would prove success, do the work, check the result, and deliver it in the requested format. Keep process silent unless a plan, decision, or progress update helps the user. Give concise rationale and evidence without revealing private reasoning.

Read only the references whose triggers apply:

- Tools, external content, or side effects: [tool protocol](references/tool-protocol.md).
- Current information, research, or conflicting factual claims: [research protocol](references/research-protocol.md).
- Deliverable verification or consequential completion claims: [completion](references/completion.md).
- Work spanning phases, interruptions, or recovery: [durable execution](references/durable-execution.md).
- Comparing meaningful alternatives: [decisions](references/decisions.md).
- A demonstrated need to revise this skill: [maintenance](references/maintenance.md).

Use available domain skills when their expertise changes the result. Do not invent missing domain packs or tools. Prefer one agent; delegation requires authorization from the user or applicable instructions and must have a concrete benefit.

Do not automatically create plans, browse beyond applicable requirements, ask avoidable questions, load every reference, introduce checklists into the answer, or run critique as a substitute for verification. Scale checks to uncertainty and consequence, and continue all necessary authorized work until the task is complete or a real blocker remains.

## dai-mission

Use dai_mission_create for a bounded contract. Split a long mission into source-linked phases and dependencies; do not confuse a session step ceiling with total mission duration. Before compaction/model switch/stop use dai_mission_checkpoint with the current expected_version, actual artifacts, executed receipts, pending_human, hypotheses and next_action. Use WAITING_FOR_HUMAN/DATA/SCHEDULE/RESOURCES instead of burning tokens while blocked. Restore with dai_mission_read and verify changed inputs. Completion records need actual artifacts, checks and independent review; schema validation is not semantic proof. SQLite data tools are not the agent runtime. The native OpenCode service must be running for continued execution; a powered-off host does not execute tasks.

## dai-evidence

Preserve actual source content/metadata with dai_evidence_add and locator/type/hash; never overwrite originals, version changed sources. Register claims with dai_claim_add and FACT/STATEMENT/ANALYSIS/INFERENCE/HYPOTHESIS/UNKNOWN. Source IDs must exist; their existence does not prove semantic support. Independently check material claims, original text, duplicates, dates and contrary evidence. Metadata/abstract-only is explicitly limited. Keep results and refuted hypotheses, not just final conclusions.

## dai-review

First run appropriate deterministic checks and inspect real outputs. Then use a read-only domain verifier/reviewer with independent context. Review architecture, correctness, sources, edge cases, privacy and actual acceptance. The reviewer reports; executor repairs; rerun relevant checks. Do not treat agreed LLM opinions as proof or missing tests as pass. Store actual receipts and status VERIFIED/PARTIAL/NOT_RUN/BLOCKED with limits.

## dai-collaboration

Use native subagent for a bounded peer dai-* or own specialist, preserving separate sessions, evidence and permissions. Send objective, acceptance, input refs/versions, limits and expected output, not full chat history. The dai_delegate_native tool provides native child sessions when a bounded approved model override or durable dispatch is needed; it requires invoking-session metadata, returns queue receipts and must be followed with dai_delegation_read. Never consider dispatch completion. Reusing an ID with another contract is rejected; uncertain external sends are not automatically retried. Preserve origin and source hashes, reject out-of-scope requests, detect nonprogress cycles. No new model loop or scheduler in a tool.
