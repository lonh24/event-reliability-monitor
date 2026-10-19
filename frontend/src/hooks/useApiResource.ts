import { useEffect, useState } from "react";

type Resource<T> =
  | { phase: "loading" }
  | { phase: "success"; data: T }
  | { phase: "error"; error: unknown };

// Memoize load with useCallback. Query changes hide previous results immediately.
// Cancellation and the active guard both protect against out-of-order responses.
export function useApiResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    load: typeof load;
    revision: number;
    resource: Resource<T>;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void Promise.resolve()
      .then(() => load(controller.signal))
      .then(
        (data) => {
          if (active)
            setResult({ load, revision, resource: { phase: "success", data } });
        },
        (error: unknown) => {
          if (active)
            setResult({ load, revision, resource: { phase: "error", error } });
        },
      );
    return () => {
      active = false;
      controller.abort();
    };
  }, [load, revision]);
  const resource: Resource<T> =
    result?.load === load && result.revision === revision
      ? result.resource
      : { phase: "loading" };
  return { ...resource, retry: () => setRevision((value) => value + 1) };
}
