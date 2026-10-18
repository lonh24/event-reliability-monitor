// Derived from docs/06-api-contract.md §7. Regenerate with npm run contract:sync.
// Runtime constraints (patterns, ranges and conditional rules) are checked at the adapter boundary.

export type Id = string;

export type UtcTimestamp = string;

export type NonNegativeInt64String = string;

export type PositiveInt64String = string;

export type ObservationStatus = "REPORTED_ONLY" | "OBSERVED";

export type ProcessingStatus = "CONFIRMED" | "FAILED" | "PENDING" | "UNKNOWN";

export type ProcessingReportStatus = "STARTED" | "SUCCEEDED" | "FAILED";

export type ProcessingAttemptStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "CONFLICTED";

export type RuleOutcome = "PASS" | "VIOLATION" | "UNKNOWN";

export type IncidentStatus = "OPEN" | "INVESTIGATING" | "RESOLVED";

export type RuleType = "TIMEOUT" | "DUPLICATE_BUSINESS_EFFECT" | "DATA_INVARIANT";

export type EvidenceCoverage = "COMPLETE" | "PARTIAL" | "NONE";

export type EvidenceTrust = "TRUSTED" | "UNTRUSTED" | "CONFLICTED";

export type EvidenceFinality = "FINAL" | "OPEN" | "UNKNOWN";

export type ApplicationResponse = {
  id: Id;
  name: string;
  environment: "SANDBOX" | "DEVELOPMENT";
  status: "ACTIVE" | "INACTIVE";
  createdAt: UtcTimestamp;
};

export type CreateApplicationRequest = {
  name: string;
  environment: "SANDBOX" | "DEVELOPMENT";
};

export type TimeoutRuleConfig = {
  thresholdSeconds: number;
  completionBasis: "FIRST_TRUSTED_SUCCESS";
};

export type DuplicateRuleConfig = {
  maxEffects: 1;
  sourcePolicy: "EVENT_BOUND_SOURCE";
};

export type InvariantRuleConfig = {
  expectedSource: "ORDER_EXPECTATION";
  comparison: "TOTAL_DELTA_EQUALS_EXPECTED";
};

export type MonitoringRuleResponse = {
  id: Id;
  applicationId: Id;
  name: string;
  description: string;
  enabled: boolean;
  configVersion: PositiveInt64String;
  updatedAt: UtcTimestamp;
  relatedEventIds: Array<Id>;
  relatedIncidentIds: Array<Id>;
} & (
  { ruleType: "TIMEOUT"; config: TimeoutRuleConfig } |
  { ruleType: "DUPLICATE_BUSINESS_EFFECT"; config: DuplicateRuleConfig } |
  { ruleType: "DATA_INVARIANT"; config: InvariantRuleConfig }
);

export type CreateRuleRequest = {
  applicationId: Id;
  name: string;
  description?: string;
  enabled?: boolean;
} & (
  { ruleType: "TIMEOUT"; config: TimeoutRuleConfig } |
  { ruleType: "DUPLICATE_BUSINESS_EFFECT"; config: DuplicateRuleConfig } |
  { ruleType: "DATA_INVARIANT"; config: InvariantRuleConfig }
);

export type UpdateRuleRequest = {
  enabled: boolean;
};

export type RuleResultSummaryResponse = {
  evaluationId: Id;
  ruleId: Id;
  ruleType: RuleType;
  outcome: RuleOutcome;
  reasonCode: string;
  evaluatedAt: UtcTimestamp;
};

export type EventSummaryResponse = {
  id: Id;
  eventId: Id;
  applicationId: Id;
  applicationName: string;
  eventType: "ORDER_PAID" | null;
  correlationId: Id | null;
  occurredAt: UtcTimestamp | null;
  observationStatus: ObservationStatus;
  processingStatus: ProcessingStatus;
  processingStatusReason: string;
  reportedAttemptCount: number;
  hasReportConflict: boolean;
  evaluationState: "CURRENT" | "PENDING" | "NOT_EVALUATED";
  ruleResults: Array<RuleResultSummaryResponse>;
  relatedIncidentId: Id | null;
};

export type ProcessingReportResponse = {
  id: Id;
  attemptId: Id;
  producerReportId: Id;
  reportedStatus: ProcessingReportStatus;
  startedAt: UtcTimestamp | null;
  finishedAt: UtcTimestamp | null;
  reportedAt: UtcTimestamp;
  receivedAt: UtcTimestamp;
  errorCode: string | null;
};

export type ProcessingAttemptResponse = {
  id: Id;
  producerAttemptId: Id;
  attemptNo: number | null;
  status: ProcessingAttemptStatus;
  startedAt: UtcTimestamp | null;
  finishedAt: UtcTimestamp | null;
  reportIds: Array<Id>;
  hasTerminalConflict: boolean;
};

export type EvidenceGapResponse = {
  code: string;
  message: string;
  missingFields: Array<string>;
};

export type BusinessEffectResponse = {
  id: Id;
  eventId: Id;
  customerRef: Id;
  delta: PositiveInt64String;
  createdAt: UtcTimestamp | null;
};

export type EvidenceScopeResponse = {
  eventId: Id;
  customerRef: Id | null;
  runId: Id | null;
};

export type LedgerSnapshotResponse = {
  expectedPoints: PositiveInt64String | null;
  effectCount: number | null;
  totalDelta: NonNegativeInt64String | null;
  effects: Array<BusinessEffectResponse>;
};

export type EvidenceResponse = {
  id: Id;
  observedEventId: Id;
  kind: "LEDGER_SNAPSHOT" | "REPORT_BATCH" | "GAP" | "CORRELATION_CONFLICT";
  sourceKey: string;
  sourceLabel: string;
  scope: EvidenceScopeResponse;
  coverage: EvidenceCoverage;
  trust: EvidenceTrust;
  finality: EvidenceFinality;
  snapshotAt: UtcTimestamp | null;
  collectedAt: UtcTimestamp;
  supersedesEvidenceId: Id | null;
  ledger: LedgerSnapshotResponse | null;
  reportIds: Array<Id>;
  gaps: Array<EvidenceGapResponse>;
};

export type RuleEvaluationResponse = {
  id: Id;
  observedEventId: Id;
  ruleId: Id;
  ruleVersion: PositiveInt64String;
  inputGeneration: PositiveInt64String;
  outcome: RuleOutcome;
  reasonCode: string;
  reason: string;
  evaluatedAt: UtcTimestamp;
  evidenceIds: Array<Id>;
  isLatest: boolean;
} & (
  { ruleType: "TIMEOUT"; configSnapshot: TimeoutRuleConfig } |
  { ruleType: "DUPLICATE_BUSINESS_EFFECT"; configSnapshot: DuplicateRuleConfig } |
  { ruleType: "DATA_INVARIANT"; configSnapshot: InvariantRuleConfig }
);

export type EventDetailResponse = {
  id: Id;
  eventId: Id;
  applicationId: Id;
  applicationName: string;
  eventType: "ORDER_PAID" | null;
  correlationId: Id | null;
  occurredAt: UtcTimestamp | null;
  observationStatus: ObservationStatus;
  processingStatus: ProcessingStatus;
  processingStatusReason: string;
  reportedAttemptCount: number;
  hasReportConflict: boolean;
  evaluationState: "CURRENT" | "PENDING" | "NOT_EVALUATED";
  ruleResults: Array<RuleResultSummaryResponse>;
  relatedIncidentId: Id | null;
  customerRef: Id | null;
  expectedPoints: PositiveInt64String | null;
  evidenceSourceKey: string | null;
  firstSeenAt: UtcTimestamp;
  evaluationGeneration: PositiveInt64String;
  evaluatedGeneration: NonNegativeInt64String;
  attempts: Array<ProcessingAttemptResponse>;
  reports: Array<ProcessingReportResponse>;
  evaluations: Array<RuleEvaluationResponse>;
  evidence: Array<EvidenceResponse>;
};

export type RuleReferenceResponse = {
  id: Id;
  ruleType: RuleType;
  name: string;
};

export type IncidentSummaryResponse = {
  id: Id;
  applicationId: Id;
  applicationName: string;
  observedEventId: Id;
  eventId: Id;
  primaryRule: RuleReferenceResponse;
  severity: "MEDIUM" | "HIGH";
  status: IncidentStatus;
  summary: string;
  openedAt: UtcTimestamp;
  resolvedAt: UtcTimestamp | null;
  version: NonNegativeInt64String;
};

export type IncidentHistoryResponse = {
  id: Id;
  action: "CREATED" | "STATUS_CHANGED" | "EVIDENCE_ADDED" | "SEVERITY_RAISED";
  fromStatus: IncidentStatus | null;
  toStatus: IncidentStatus | null;
  actorRef: string;
  note: string;
  createdAt: UtcTimestamp;
};

export type IncidentDetailResponse = {
  id: Id;
  applicationId: Id;
  applicationName: string;
  observedEventId: Id;
  eventId: Id;
  primaryRule: RuleReferenceResponse;
  severity: "MEDIUM" | "HIGH";
  status: IncidentStatus;
  summary: string;
  openedAt: UtcTimestamp;
  resolvedAt: UtcTimestamp | null;
  version: NonNegativeInt64String;
  explanation: string;
  updatedAt: UtcTimestamp;
  linkedEvent: EventSummaryResponse;
  linkedEvaluations: Array<RuleEvaluationResponse>;
  evidence: Array<EvidenceResponse>;
  history: Array<IncidentHistoryResponse>;
};

export type UpdateIncidentStatusRequest = {
  status: IncidentStatus;
  expectedVersion: NonNegativeInt64String;
  note?: string;
};

export type OverviewStatsResponse = {
  observedEvents: number;
  confirmedProcessing: number;
  openIncidents: number;
  unknownEvaluations: number;
};

export type EventVolumeBucketResponse = {
  startAt: UtcTimestamp;
  endAt: UtcTimestamp;
  count: number;
  partial: boolean;
};

export type OverviewResponse = {
  range: "1h" | "24h" | "7d";
  bucket: "hour" | "day";
  applicationId: Id | null;
  asOf: UtcTimestamp;
  windowStart: UtcTimestamp;
  windowEnd: UtcTimestamp;
  stats: OverviewStatsResponse;
  volumeBuckets: Array<EventVolumeBucketResponse>;
  latestIncidents: Array<IncidentSummaryResponse>;
};

export interface PageResponse<T extends object = Record<string, unknown>> { items: T[]; page: number; size: number; totalItems: number; totalPages: number; }

export type ApplicationPageResponse = PageResponse<ApplicationResponse>;

export type EventPageResponse = PageResponse<EventSummaryResponse>;

export type RulePageResponse = PageResponse<MonitoringRuleResponse>;

export type IncidentPageResponse = PageResponse<IncidentSummaryResponse>;

export type FieldErrorResponse = {
  field: string;
  code: string;
  message: string;
};

export type ApiErrorResponse = {
  code: "MALFORMED_JSON" | "INVALID_QUERY" | "VALIDATION_ERROR" | "UNAUTHENTICATED" | "FORBIDDEN" | "RESOURCE_NOT_FOUND" | "VERSION_CONFLICT" | "INVALID_STATE_TRANSITION" | "REPORT_PAYLOAD_CONFLICT" | "IDENTITY_CONFLICT" | "METHOD_NOT_ALLOWED" | "UNSUPPORTED_MEDIA_TYPE" | "INTERNAL_ERROR" | "SERVICE_UNAVAILABLE";
  message: string;
  requestId: Id;
  fieldErrors: Array<FieldErrorResponse>;
  currentVersion: NonNegativeInt64String | null;
};

export interface DtoMap {
  Id: Id;
  UtcTimestamp: UtcTimestamp;
  NonNegativeInt64String: NonNegativeInt64String;
  PositiveInt64String: PositiveInt64String;
  ObservationStatus: ObservationStatus;
  ProcessingStatus: ProcessingStatus;
  ProcessingReportStatus: ProcessingReportStatus;
  ProcessingAttemptStatus: ProcessingAttemptStatus;
  RuleOutcome: RuleOutcome;
  IncidentStatus: IncidentStatus;
  RuleType: RuleType;
  EvidenceCoverage: EvidenceCoverage;
  EvidenceTrust: EvidenceTrust;
  EvidenceFinality: EvidenceFinality;
  ApplicationResponse: ApplicationResponse;
  CreateApplicationRequest: CreateApplicationRequest;
  TimeoutRuleConfig: TimeoutRuleConfig;
  DuplicateRuleConfig: DuplicateRuleConfig;
  InvariantRuleConfig: InvariantRuleConfig;
  MonitoringRuleResponse: MonitoringRuleResponse;
  CreateRuleRequest: CreateRuleRequest;
  UpdateRuleRequest: UpdateRuleRequest;
  RuleResultSummaryResponse: RuleResultSummaryResponse;
  EventSummaryResponse: EventSummaryResponse;
  ProcessingReportResponse: ProcessingReportResponse;
  ProcessingAttemptResponse: ProcessingAttemptResponse;
  EvidenceGapResponse: EvidenceGapResponse;
  BusinessEffectResponse: BusinessEffectResponse;
  EvidenceScopeResponse: EvidenceScopeResponse;
  LedgerSnapshotResponse: LedgerSnapshotResponse;
  EvidenceResponse: EvidenceResponse;
  RuleEvaluationResponse: RuleEvaluationResponse;
  EventDetailResponse: EventDetailResponse;
  RuleReferenceResponse: RuleReferenceResponse;
  IncidentSummaryResponse: IncidentSummaryResponse;
  IncidentHistoryResponse: IncidentHistoryResponse;
  IncidentDetailResponse: IncidentDetailResponse;
  UpdateIncidentStatusRequest: UpdateIncidentStatusRequest;
  OverviewStatsResponse: OverviewStatsResponse;
  EventVolumeBucketResponse: EventVolumeBucketResponse;
  OverviewResponse: OverviewResponse;
  PageResponse: PageResponse;
  ApplicationPageResponse: ApplicationPageResponse;
  EventPageResponse: EventPageResponse;
  RulePageResponse: RulePageResponse;
  IncidentPageResponse: IncidentPageResponse;
  FieldErrorResponse: FieldErrorResponse;
  ApiErrorResponse: ApiErrorResponse;
}
