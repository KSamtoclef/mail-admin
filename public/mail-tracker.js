(function () {
  var script = document.currentScript;
  var configuredEndpoint = script && script.dataset ? script.dataset.endpoint : null;
  var endpoint = configuredEndpoint || window.MAIL_ADMIN_TRACKING_ENDPOINT || "/api/events";
  var storageKey = "mail_admin_session_id";

  function getSessionId() {
    var url = new URL(window.location.href);
    var sessionFromUrl = url.searchParams.get("mt_sid");

    if (sessionFromUrl) {
      try { window.sessionStorage.setItem(storageKey, sessionFromUrl); } catch (_) {}
      url.searchParams.delete("mt_sid");
      window.history.replaceState({}, document.title, url.toString());
      return sessionFromUrl;
    }

    try { return window.sessionStorage.getItem(storageKey); } catch (_) { return null; }
  }

  var sessionId = getSessionId();

  function send(eventType, metadata) {
    if (!sessionId || !eventType) return Promise.resolve(false);

    return fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        session_id: sessionId,
        event_type: eventType,
        page_url: window.location.href,
        referrer: document.referrer || null,
        metadata: metadata || {}
      })
    }).then(function () { return true; }).catch(function () { return false; });
  }

  window.MailAdminTracker = {
    track: send,
    getSessionId: function () { return sessionId; }
  };

  if (sessionId) {
    send("page_view", { title: document.title });
  }

  document.addEventListener("click", function (event) {
    var target = event.target && event.target.closest ? event.target.closest("[data-mail-track]") : null;
    if (!target) return;

    send(target.getAttribute("data-mail-track"), {
      label: target.getAttribute("data-mail-label") || target.textContent.trim().slice(0, 120)
    });
  });
})();
