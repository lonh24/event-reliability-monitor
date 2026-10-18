import type {
  OverviewResponse,
  ApplicationPageResponse,
  CreateApplicationRequest,
  ApplicationResponse,
  EventPageResponse,
  EventDetailResponse,
  RulePageResponse,
  CreateRuleRequest,
  MonitoringRuleResponse,
  UpdateRuleRequest,
  IncidentPageResponse,
  IncidentDetailResponse,
  UpdateIncidentStatusRequest,
  ProcessingStatus,
  IncidentStatus,
} from "../types/api.ts";

export interface RequestOptions {
  signal?: AbortSignal;
}
export interface PageQuery {
  page?: number;
  size?: number;
}
export interface OverviewQuery {
  range?: OverviewResponse["range"];
  bucket?: OverviewResponse["bucket"];
  applicationId?: string;
  latestIncidentsLimit?: number;
}
export interface ApplicationsQuery extends PageQuery {
  sort?: "createdAt,asc" | "createdAt,desc";
}
export interface EventsQuery extends PageQuery {
  search?: string;
  applicationId?: string;
  status?: ProcessingStatus | "";
  sort?: "occurredAt,asc" | "occurredAt,desc";
}
export interface RulesQuery extends PageQuery {
  applicationId?: string;
  sort?: "name,asc" | "name,desc";
}
export interface IncidentsQuery extends PageQuery {
  applicationId?: string;
  status?: IncidentStatus | "";
  severity?: "MEDIUM" | "HIGH" | "";
  sort?: "openedAt,asc" | "openedAt,desc";
}

export interface MonitorApi {
  getOverview(
    query?: OverviewQuery,
    options?: RequestOptions,
  ): Promise<OverviewResponse>;
  listApplications(
    query?: ApplicationsQuery,
    options?: RequestOptions,
  ): Promise<ApplicationPageResponse>;
  createApplication(
    body: CreateApplicationRequest,
    options?: RequestOptions,
  ): Promise<ApplicationResponse>;
  listEvents(
    query?: EventsQuery,
    options?: RequestOptions,
  ): Promise<EventPageResponse>;
  getEventDetail(
    id: string,
    options?: RequestOptions,
  ): Promise<EventDetailResponse>;
  listRules(
    query?: RulesQuery,
    options?: RequestOptions,
  ): Promise<RulePageResponse>;
  createRule(
    body: CreateRuleRequest,
    options?: RequestOptions,
  ): Promise<MonitoringRuleResponse>;
  updateRule(
    id: string,
    body: UpdateRuleRequest,
    options?: RequestOptions,
  ): Promise<MonitoringRuleResponse>;
  listIncidents(
    query?: IncidentsQuery,
    options?: RequestOptions,
  ): Promise<IncidentPageResponse>;
  getIncidentDetail(
    id: string,
    options?: RequestOptions,
  ): Promise<IncidentDetailResponse>;
  updateIncidentStatus(
    id: string,
    body: UpdateIncidentStatusRequest,
    options?: RequestOptions,
  ): Promise<IncidentDetailResponse>;
}
