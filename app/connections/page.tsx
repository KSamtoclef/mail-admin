import ConnectionsManager from "@/components/ConnectionsManager";

export default function ConnectionsPage() {
  return (
    <main className="workspace" style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div className="workspaceBar">
        <div className="breadcrumb"><span>Mail Admin</span><b>/</b><strong>Connections</strong></div>
      </div>
      <header className="pageHeader">
        <div>
          <h1>Connections</h1>
          <p>Manage tracking sites and email-provider connectivity.</p>
        </div>
      </header>
      <ConnectionsManager />
    </main>
  );
}
