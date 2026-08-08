"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Mail Admin runtime error", error);
  }, [error]);

  return (
    <main className="loginPane" style={{ minHeight: "100vh" }}>
      <div className="loginCard">
        <div className="loginBrand">
          <div className="brandMark">M</div>
          <div>
            <div className="brandName">Mail Admin</div>
            <div className="brandMeta">System error</div>
          </div>
        </div>
        <h2>Something went wrong</h2>
        <p>The workspace hit an unexpected error. Try the page again before changing any configuration.</p>
        <button className="button buttonPrimary loginButton" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
