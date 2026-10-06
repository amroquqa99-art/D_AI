/** First-class D_AI domain registry and Local Intelligence Core descriptor. */

export type SystemCapabilityStatus =
  | 'FOUNDATION'
  | 'PARTIAL'
  | 'INTEGRATED'
  | 'TESTED'
  | 'LIVE-VERIFIED'

export type SystemRiskClass =
  | 'standard'
  | 'scientific'
  | 'financial'
  | 'authorized-cyber'
  | 'sensitive-operations'

export type SystemId =
  | 'investigation'
  | 'scientific-research'
  | 'investor'
  | 'cybersecurity'
  | 'operations-intelligence'
  | 'innovation-discovery'

export interface SystemManifest {
  readonly id: SystemId
  readonly version: string
  readonly name: string
  readonly description: string
  readonly status: SystemCapabilityStatus
  readonly managerAgent: string
  readonly execution: 'native' | 'contract-only'
  readonly memoryScopes: readonly ('system' | 'project' | 'mission' | 'agent' | 'task')[]
  readonly toolProfiles: readonly string[]
  readonly evidenceTypes: readonly string[]
  readonly crossSystem: readonly SystemId[]
  readonly riskClass: SystemRiskClass
  readonly humanApprovalGates: readonly string[]
}

function manifest(value: SystemManifest): SystemManifest {
  return Object.freeze({
    ...value,
    memoryScopes: Object.freeze([...value.memoryScopes]),
    toolProfiles: Object.freeze([...value.toolProfiles]),
    evidenceTypes: Object.freeze([...value.evidenceTypes]),
    crossSystem: Object.freeze([...value.crossSystem]),
    humanApprovalGates: Object.freeze([...value.humanApprovalGates]),
  })
}

/**
 * The registry is product truth: all six systems exist as first-class domains.
 * Status/execution fields distinguish integrated behavior, partial native slices,
 * and future foundation work without overstating readiness.
 */
export const SYSTEMS: readonly SystemManifest[] = Object.freeze([
  manifest({
    id: 'investigation',
    version: '0.2.0',
    name: 'Investigation',
    description: 'Evidence-first multi-source investigation, entity resolution, hypotheses, contradiction detection, temporal/geospatial reasoning and auditable reporting.',
    status: 'INTEGRATED',
    managerAgent: 'InvestigationManager',
    execution: 'native',
    memoryScopes: ['system', 'project', 'mission', 'agent', 'task'],
    toolProfiles: ['web-research', 'documents', 'osint', 'geospatial', 'evidence'],
    evidenceTypes: ['source', 'claim', 'counterclaim', 'entity', 'relationship', 'timeline-event'],
    crossSystem: ['scientific-research', 'investor', 'cybersecurity', 'operations-intelligence', 'innovation-discovery'],
    riskClass: 'standard',
    humanApprovalGates: ['new-independent-mission', 'restricted-source-access', 'sensitive-external-side-effect'],
  }),
  manifest({
    id: 'scientific-research',
    version: '0.1.0',
    name: 'Scientific Research',
    description: 'Research assistant for literature mapping, gap discovery, reproducible methodology, experiment design, analysis and production of testable new knowledge.',
    status: 'PARTIAL',
    managerAgent: 'ScientificResearchManager',
    execution: 'native',
    memoryScopes: ['system', 'project', 'mission', 'agent', 'task'],
    toolProfiles: ['scholarly-research', 'documents', 'statistics', 'simulation', 'experiments'],
    evidenceTypes: ['paper', 'dataset', 'method', 'measurement', 'experiment', 'result', 'hypothesis'],
    crossSystem: ['investigation', 'innovation-discovery', 'investor'],
    riskClass: 'scientific',
    humanApprovalGates: ['human-experiment', 'physical-experiment', 'ethics-sensitive-study', 'budget-extension'],
  }),
  manifest({
    id: 'investor',
    version: '0.1.0',
    name: 'Investor',
    description: 'Financial and investment intelligence for companies, markets, valuation, scenarios, portfolio risk, influence signals and continuously tracked theses.',
    status: 'PARTIAL',
    managerAgent: 'InvestorManager',
    execution: 'native',
    memoryScopes: ['system', 'project', 'mission', 'agent', 'task'],
    toolProfiles: ['financial-data', 'filings', 'market-data', 'news', 'statistics', 'portfolio'],
    evidenceTypes: ['filing', 'market-observation', 'financial-metric', 'thesis', 'scenario', 'risk-factor'],
    crossSystem: ['investigation', 'scientific-research', 'operations-intelligence'],
    riskClass: 'financial',
    humanApprovalGates: ['real-capital-movement', 'new-paid-data-source', 'material-budget-extension'],
  }),
  manifest({
    id: 'cybersecurity',
    version: '0.1.0',
    name: 'Cybersecurity',
    description: 'Authorized defensive security, vulnerability analysis, code/config review, forensics, threat modeling, controlled testing, remediation and retesting.',
    status: 'PARTIAL',
    managerAgent: 'CybersecurityManager',
    execution: 'native',
    memoryScopes: ['system', 'project', 'mission', 'agent', 'task'],
    toolProfiles: ['asset-inventory', 'code-review', 'vulnerability-analysis', 'forensics', 'authorized-lab'],
    evidenceTypes: ['asset', 'finding', 'vulnerability', 'forensic-artifact', 'threat', 'remediation', 'retest'],
    crossSystem: ['investigation', 'operations-intelligence', 'innovation-discovery'],
    riskClass: 'authorized-cyber',
    humanApprovalGates: ['active-security-test', 'external-target-action', 'privilege-escalation-test', 'destructive-test'],
  }),
  manifest({
    id: 'operations-intelligence',
    version: '0.1.0',
    name: 'Operations & Intelligence',
    description: 'Case and operations intelligence for lawful institutional use: multi-source fusion, entity/network/timeline analysis, intelligence gaps, exposure estimates and options analysis.',
    status: 'PARTIAL',
    managerAgent: 'OperationsIntelligenceManager',
    execution: 'native',
    memoryScopes: ['system', 'project', 'mission', 'agent', 'task'],
    toolProfiles: ['case-management', 'evidence', 'geospatial', 'timeline', 'network-analysis', 'authorized-intelligence'],
    evidenceTypes: ['case-item', 'entity', 'relationship', 'field-report', 'digital-evidence', 'timeline-event', 'intelligence-gap', 'option'],
    crossSystem: ['investigation', 'cybersecurity', 'investor'],
    riskClass: 'sensitive-operations',
    humanApprovalGates: ['sensitive-external-action', 'restricted-data-access', 'cross-case-link', 'high-impact-operational-option'],
  }),
  manifest({
    id: 'innovation-discovery',
    version: '0.1.0',
    name: 'Innovation & Discovery',
    description: 'Multi-disciplinary discovery engine for hard scientific and technical problems, new hypotheses, problem reframing, simulation, novelty checks and experiment handoff.',
    status: 'PARTIAL',
    managerAgent: 'InnovationDiscoveryManager',
    execution: 'native',
    memoryScopes: ['system', 'project', 'mission', 'agent', 'task'],
    toolProfiles: ['mathematics', 'simulation', 'scientific-compute', 'prior-art', 'experiments'],
    evidenceTypes: ['conjecture', 'counterexample', 'model', 'simulation', 'design', 'prior-art', 'experiment-proposal'],
    crossSystem: ['scientific-research', 'investigation', 'investor', 'cybersecurity'],
    riskClass: 'scientific',
    humanApprovalGates: ['physical-experiment', 'high-cost-compute', 'high-risk-prototype'],
  }),
])

const registry = new Map<SystemId, SystemManifest>(SYSTEMS.map(system => [system.id, system]))
if (registry.size !== SYSTEMS.length) throw new Error('D_AI system registry contains duplicate IDs')

export function getSystemManifest(id: SystemId): SystemManifest {
  const system = registry.get(id)
  if (system === undefined) throw new Error(`Unknown D_AI system: ${id}`)
  return system
}

export function listSystemManifests(): readonly SystemManifest[] {
  return SYSTEMS
}

export interface LocalIntelligenceCoreManifest {
  readonly id: 'local-intelligence-core'
  readonly status: SystemCapabilityStatus
  readonly role: string
  readonly dataPolicy: 'explicit-eligibility-only'
  readonly stages: readonly string[]
  readonly requiredControls: readonly string[]
}

/**
 * The Local Intelligence Core is a platform component, not a seventh domain.
 * Training is never implicit: only governed, explicitly eligible data may enter
 * datasets or experiments.
 */
export const LOCAL_INTELLIGENCE_CORE: LocalIntelligenceCoreManifest = Object.freeze({
  id: 'local-intelligence-core',
  status: 'PARTIAL',
  role: 'Primary future specialized model for D_AI planning, tool use, evidence reasoning and cross-system work.',
  dataPolicy: 'explicit-eligibility-only',
  stages: Object.freeze([
    'usage-event-capture',
    'eligibility-and-consent',
    'redaction-and-quality-filtering',
    'dataset-versioning',
    'holdout-evaluation',
    'controlled-training-or-adapter-experiment',
    'before-after-evaluation',
    'promotion-or-rollback',
  ]),
  requiredControls: Object.freeze([
    'project-opt-in-opt-out',
    'source-ownership-and-license',
    'sensitive-data-exclusion',
    'dataset-lineage',
    'model-lineage',
    'independent-evaluation',
    'rollback',
  ]),
})
