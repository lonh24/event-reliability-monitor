import { Activity, FlaskConical, X } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { navigationItems } from "../../app/navigation";

interface SidebarProps {
  onNavigate?: () => void;
  onClose?: () => void;
}

export function Sidebar({ onNavigate, onClose }: SidebarProps) {
  return (
    <div className="sidebar-content">
      <div className="brand-row">
        <Link
          to="/"
          className="brand"
          aria-label="ERM Overview"
          onClick={onNavigate}
        >
          <span className="brand-symbol">
            <Activity size={23} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="brand-name">
            ERM<span>Event Reliability Monitor</span>
          </span>
        </Link>
        {onClose && (
          <button
            className="icon-button drawer-close"
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        )}
      </div>
      <nav aria-label="Main navigation" className="sidebar-nav">
        <p className="eyebrow nav-label">Workspace</p>
        {navigationItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={onNavigate}
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-note">
        <FlaskConical size={18} aria-hidden="true" />
        <div>
          <strong>Prototype workspace</strong>
          <p>
            Explore the interface.
            <br />
            Data integration is pending.
          </p>
        </div>
      </div>
      <div className="sidebar-footer">
        <span className="small-mark" aria-hidden="true">
          E
        </span>
        <span>
          Event Reliability Monitor
          <small>Observe. Investigate. Understand.</small>
        </span>
      </div>
    </div>
  );
}
