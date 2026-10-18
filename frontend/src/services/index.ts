import { createMockMonitorApi } from "./mockMonitorApi.ts";
import { createHttpMonitorApi } from "./httpMonitorApi.ts";
import type { MonitorApi } from "./monitorApi.ts";

export interface DataSourceConfig {
  dataSource?: string;
  apiBaseUrl?: string;
}
export function createMonitorApi(config: DataSourceConfig = {}): MonitorApi {
  const mode = config.dataSource ?? "mock";
  if (mode === "mock") return createMockMonitorApi().api;
  if (mode === "http")
    return createHttpMonitorApi({ baseUrl: config.apiBaseUrl ?? "/api/v1" });
  throw new Error(`Unsupported VITE_DATA_SOURCE: expected mock or http.`);
}

export const monitorApi = createMonitorApi({
  dataSource: import.meta.env?.VITE_DATA_SOURCE,
  apiBaseUrl: import.meta.env?.VITE_API_BASE_URL,
});
export type { MonitorApi } from "./monitorApi.ts";
export { MonitorApiError, TransportError } from "./apiErrors.ts";
