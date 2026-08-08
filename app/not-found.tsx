export default function NotFound() {
  return (
    <main className="loginPane" style={{ minHeight: "100vh" }}>
      <div className="loginCard">
        <div className="loginBrand">
          <div className="brandMark">M</div>
          <div>
            <div className="brandName">Mail Admin</div>
            <div className="brandMeta">404</div>
          </div>
        </div>
        <h2>Page not found</h2>
        <p>The address does not match a Mail Admin route.</p>
        <a className="button buttonPrimary loginButton" href="/">Return to dashboard</a>
      </div>
    </main>
  );
}
