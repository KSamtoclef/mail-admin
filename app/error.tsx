"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Mail Admin runtime error", error);
  }, [error]);

  return (
    <main className="systemState">
      <div className="systemStateBox">
        <div className="brandMark">M</div>
        <h1>Something went wrong</h1>
        <p>The admin workspace hit an unexpected error. Your database has not been changed by this screen.</p>
        <button className="button buttonPrimary" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
