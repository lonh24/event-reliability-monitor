import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Header } from "../components/layout/Header";
import { Sidebar } from "../components/layout/Sidebar";
import { getPageContext } from "./navigation";

export function AppShell() {
  const { pathname } = useLocation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const context = getPageContext(pathname);

  useEffect(() => {
    document.title = `${context} · ERM`;
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname, context]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 960px)");
    const closeOnDesktop = () => {
      if (desktop.matches) dialogRef.current?.close();
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  function openNavigation() {
    dialogRef.current?.showModal();
    setNavigationOpen(true);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="desktop-sidebar">
        <Sidebar />
      </aside>
      <dialog
        ref={dialogRef}
        id="mobile-navigation"
        className="navigation-dialog"
        aria-label="Navigation"
        onClose={() => setNavigationOpen(false)}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = event.currentTarget.querySelectorAll<
            HTMLAnchorElement | HTMLButtonElement
          >("a[href], button:not([disabled])");
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
      >
        <Sidebar
          onNavigate={() => dialogRef.current?.close()}
          onClose={() => dialogRef.current?.close()}
        />
      </dialog>
      <div className="workspace">
        <Header
          context={context}
          onOpenNavigation={openNavigation}
          navigationOpen={navigationOpen}
        />
        <main ref={mainRef} id="main-content" tabIndex={-1}>
          <div className="content">
            <Outlet />
          </div>
        </main>
        <footer className="workspace-footer">
          <span>
            ERM <span aria-hidden="true">/</span> Dashboard prototype
          </span>
          <span>Demo changes will reset on reload.</span>
        </footer>
      </div>
    </div>
  );
}
