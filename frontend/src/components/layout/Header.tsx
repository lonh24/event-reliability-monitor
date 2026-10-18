import { ChevronRight, FlaskConical, Menu } from "lucide-react";

interface HeaderProps {
  context: string;
  onOpenNavigation: () => void;
  navigationOpen: boolean;
}

export function Header({
  context,
  onOpenNavigation,
  navigationOpen,
}: HeaderProps) {
  return (
    <header className="workspace-header">
      <div className="header-context">
        <button
          type="button"
          className="icon-button menu-button"
          aria-label="Open navigation"
          aria-controls="mobile-navigation"
          aria-expanded={navigationOpen}
          onClick={onOpenNavigation}
        >
          <Menu size={21} />
        </button>
        <span className="breadcrumb-root">Workspace</span>
        <ChevronRight
          className="breadcrumb-divider"
          size={14}
          aria-hidden="true"
        />
        <span className="current-context">{context}</span>
      </div>
      <span className="demo-label">
        <FlaskConical size={14} aria-hidden="true" />
        Demo data
      </span>
    </header>
  );
}
