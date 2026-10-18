import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/ui/PageHeader";
import { ErrorState } from "../components/ui/ErrorState";

export function NotFoundPage() {
  return (
    <>
      <PageHeader
        title="Page not found"
        description="The requested URL does not match a page in this workspace."
      />
      <section className="panel not-found-panel">
        <span className="not-found-code" aria-hidden="true">
          404
        </span>
        <ErrorState
          title="404 · This page does not exist"
          description="Use the workspace navigation or return to Overview to continue."
        />
        <Link to="/" className="button button-primary">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to Overview
        </Link>
      </section>
    </>
  );
}
