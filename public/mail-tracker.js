(function () {
  var script = document.currentScript;
  var configuredEndpoint = script && script.dataset ? script.dataset.endpoint : null;
  var eventEndpoint = configuredEndpoint || window.MAIL_ADMIN_TRACKING_ENDPOINT || "/api/events";
  var sessionEndpoint = eventEndpoint.replace(/\/api\/events\/?$/, "/api/sessions");
  var sessionKey = "mail_admin_session_id";
  var anonymousKey = "mail_admin_anonymous_id";

  function randomId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "anon_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
  }

  function getAnonymousId() {
    try {
      var existing = window.localStorage.getItem(anonymousKey);
      if (existing) return existing;
      var created = randomId();
      window.localStorage.setItem(anonymousKey, created);
      return created;
    } catch (_) {
      return randomId();
    }
  }

  function captureAttributedSession() {
    var url = new URL(window.location.href);
    var sessionFromUrl = url.searchParams.get("mt_sid");

    if (sessionFromUrl) {
      try { window.sessionStorage.setItem(sessionKey, sessionFromUrl); } catch (_) {}
      url.searchParams.delete("mt_sid");
      window.history.replaceState({}, document.title, url.toString());
      return sessionFromUrl;
    }

    try { return window.sessionStorage.getItem(sessionKey); } catch (_) { return null; }
  }

  var sessionId = captureAttributedSession();
  var anonymousId = getAnonymousId();
  var ready;

  function startAnonymousSession() {
    if (sessionId) return Promise.resolve(sessionId);

    return fetch(sessionEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        anonymous_id: anonymousId,
        page_url: window.location.href,
        referrer: document.referrer || null
      })
    })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (result) {
        if (!result || !result.session_id) return null;
        sessionId = result.session_id;
        try { window.sessionStorage.setItem(sessionKey, sessionId); } catch (_) {}
        return sessionId;
      })
      .catch(function () { return null; });
  }

  ready = startAnonymousSession();

  function send(eventType, metadata) {
    if (!eventType) return Promise.resolve(false);

    return ready.then(function () {
      if (!sessionId) return false;
      return fetch(eventEndpoint, {
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
      }).then(function (response) { return response.ok; }).catch(function () { return false; });
    });
  }

  window.MailAdminTracker = {
    track: send,
    getSessionId: function () { return sessionId; },
    getAnonymousId: function () { return anonymousId; }
  };

  ready.then(function () {
    send("page_view", { title: document.title });
  });

  document.addEventListener("click", function (event) {
    var target = event.target && event.target.closest ? event.target.closest("[data-mail-track]") : null;
    if (!target) return;

    send(target.getAttribute("data-mail-track"), {
      label: target.getAttribute("data-mail-label") || target.textContent.trim().slice(0, 120)
    });
  });
})();
