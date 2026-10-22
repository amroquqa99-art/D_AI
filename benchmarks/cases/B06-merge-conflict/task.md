Merge v1.conf and v2.conf into merged.conf so that it satisfies every rule in RULES.md.
Do not drop a key and do not keep two values for the same key.

Input files (in the workspace):
  v1.conf   service configuration from branch v1
  v2.conf   service configuration from branch v2
  RULES.md  acceptance rules for the merged file

Output file:
  merged.conf   the merged configuration

The merged file must satisfy every rule in RULES.md. The checker parses merged.conf,
v1.conf and v2.conf and verifies each rule; it does not look for fixed strings.
