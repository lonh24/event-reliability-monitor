import { MonitorApiError } from "../../services/apiErrors.ts";
import type { CreateApplicationRequest } from "../../types/api.ts";

export function applicationInput(name: string, environment: string) {
  const trimmed = name.trim();
  const errors: Partial<Record<keyof CreateApplicationRequest, string>> = {};
  if (Array.from(trimmed).length < 1 || Array.from(trimmed).length > 100)
    errors.name = "Enter a name containing 1–100 characters after trimming.";
  if (environment !== "SANDBOX" && environment !== "DEVELOPMENT")
    errors.environment = "Choose SANDBOX or DEVELOPMENT.";
  const body: CreateApplicationRequest | null =
    Object.keys(errors).length === 0 &&
    (environment === "SANDBOX" || environment === "DEVELOPMENT")
      ? { name: trimmed, environment }
      : null;
  return { body, errors };
}

export function configurationFailure(error: unknown) {
  if (error instanceof MonitorApiError) {
    return {
      uncertain: false,
      title:
        error.code === "VALIDATION_ERROR"
          ? "Check the application fields"
          : "Change rejected",
      message: `The API rejected this request (${error.status} · ${error.code}). Your input and the last confirmed state are preserved.`,
      fieldErrors: error.response.fieldErrors,
    };
  }
  return {
    uncertain: true,
    title: "Save outcome uncertain",
    message:
      "The response was not confirmed. The server may have saved this change. Reload the list to compare its current state before deciding whether to submit again. No write has been retried.",
    fieldErrors: [],
  };
}
