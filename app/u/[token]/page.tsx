export default async function UnsubscribePage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;

  return (
    <main className="standalonePage" style={{ maxWidth: 620 }}>
      <section className="panel" style={{ padding: 28 }}>
        <h1 style={{ marginTop: 0 }}>{done === "1" ? "You’re unsubscribed" : "Unsubscribe"}</h1>
        {done === "1" ? (
          <p className="bodyText">This email address has been removed from future campaign sends.</p>
        ) : (
          <>
            <p className="bodyText">Confirm that you no longer want to receive campaign emails from this sender.</p>
            <form method="post" action="/api/unsubscribe/confirm">
              <input type="hidden" name="token" value={token} />
              <button className="button buttonPrimary" type="submit">Unsubscribe</button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
