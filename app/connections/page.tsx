import ConnectionsManager from "@/components/ConnectionsManager";
import CookiesPilotPanel from "@/components/CookiesPilotPanel";

export default function ConnectionsPage() {
  return (
    <main className="workspace" style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div className="workspaceBar">
        <div className="breadcrumb"><span>Mail Admin</span><b>/</b><strong>Connections</strong></div>
      </div>
      <header className="pageHeader">
        <div>
          <h1>Connections</h1>
          <p>Manage Cookies Pilot, tracking sites and Resend connectivity.</p>
        </div>
      </header>
      <CookiesPilotPanel />
      <ConnectionsManager />
    </main>
  );
}
