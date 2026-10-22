---
description: "DAI checkpoint — حفظ نقطة تحقق، أو استئناف بمقدمة resume (مثال: /checkpoint resume live-research-1012)"
---

If $ARGUMENTS starts with "resume": restore that mission with dai_mission_read, read the current version, verify changed inputs and pending human requirements with the owner before continuing, and do not claim completion.
Otherwise checkpoint the current mission with dai-core using actual receipts, original evidence and one next action. Do not claim completion without evidence.
