import type { MonitorApi } from "../../services/monitorApi.ts";
import type { ApplicationResponse } from "../../types/api.ts";

// Fetch every contract page, once per page rather than once per displayed rule.
export async function applicationDirectory(
  api: MonitorApi,
  signal?: AbortSignal,
) {
  const items: ApplicationResponse[] = [];
  let page = 0;
  for (;;) {
    const result = await api.listApplications(
      { page, size: 100, sort: "createdAt,desc" },
      { signal },
    );
    items.push(...result.items);
    if (++page >= result.totalPages) return items;
  }
}
