(function () {
  if (window.__MAIL_ADMIN_TRACKER_LOADED__) return;
  window.__MAIL_ADMIN_TRACKER_LOADED__ = true;

  var script = document.currentScript;
  var configuredEndpoint = script && script.dataset ? script.dataset.endpoint : null;
  var eventEndpoint = configuredEndpoint || window.MAIL_ADMIN_TRACKING_ENDPOINT || "/api/events";
  var sessionEndpoint = eventEndpoint.replace(/\/api\/events\/?$/, "/api/sessions");
  var sessionKey = "mail_admin_session_id";
  var anonymousKey = "mail_admin_anonymous_id";
  var sessionId = null;
  var lastTrackedUrl = null;

  function randomId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "anon_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
  }

  function readStorage(storage, key) {
    try { return storage.getItem(key); } catch (_) { return null; }
  }

  function writeStorage(storage, key, value) {
    try { storage.setItem(key, value); } catch (_) {}
  }

  function getAnonymousId() {
    var existing = readStorage(window.localStorage, anonymousKey);
    if (existing) return existing;
    var created = randomId();
    writeStorage(window.localStorage, anonymousKey, created);
    return created;
  }

  function captureAttributedSession() {
    var url = new URL(window.location.href);
    var fromUrl = url.searchParams.get("mt_sid");

    if (fromUrl) {
      writeStorage(window.sessionStorage, sessionKey, fromUrl);
      url.searchParams.delete("mt_sid");
      window.history.replaceState(window.history.state, document.title, url.toString());
      return fromUrl;
    }

    return readStorage(window.sessionStorage, sessionKey);
  }

  var anonymousId = getAnonymousId();
  sessionId = captureAttributedSession();

  function postJson(endpoint, payload) {
    return fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      credentials: "omit",
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (!response.ok) return null;
      return response.json().catch(function () { return {}; });
    }).catch(function () { return null; });
  }

  function startSession() {
    if (sessionId) return Promise.resolve(sessionId);

    return postJson(sessionEndpoint, {
      anonymous_id: anonymousId,
      page_url: window.location.href,
      referrer: document.referrer || null
    }).then(function (result) {
      if (!result || !result.session_id) return null;
      sessionId = result.session_id;
      writeStorage(window.sessionStorage, sessionKey, sessionId);
      return sessionId;
    });
  }

  var ready = startSession();

  function track(eventType, metadata) {
    if (!eventType || typeof eventType !== "string") return Promise.resolve(false);

    return ready.then(function () {
      if (!sessionId) return false;

      return postJson(eventEndpoint, {
        session_id: sessionId,
        event_type: eventType,
        page_url: window.location.href,
        referrer: document.referrer || null,
        metadata: metadata && typeof metadata === "object" ? metadata : {}
      }).then(function (result) { return Boolean(result); });
    });
  }

  function trackPageView(source) {
    var currentUrl = window.location.href;
    if (currentUrl === lastTrackedUrl) return;
    lastTrackedUrl = currentUrl;
    track("page_view", { title: document.title, source: source || "load" });
  }

  function patchHistoryMethod(name) {
    var original = window.history[name];
    if (typeof original !== "function") return;

    window.history[name] = function () {
      var result = original.apply(this, arguments);
      window.setTimeout(function () { trackPageView("history"); }, 0);
      return result;
    };
  }

  window.MailAdminTracker = {
    track: track,
    getSessionId: function () { return sessionId; },
    getAnonymousId: function () { return anonymousId; }
  };

  ready.then(function () { trackPageView("load"); });

  patchHistoryMethod("pushState");
  patchHistoryMethod("replaceState");
  window.addEventListener("popstate", function () { trackPageView("popstate"); });

  document.addEventListener("click", function (event) {
    var target = event.target && event.target.closest ? event.target.closest("[data-mail-track]") : null;
    if (!target) return;

    var eventName = target.getAttribute("data-mail-track");
    if (!eventName) return;

    track(eventName, {
      label: target.getAttribute("data-mail-label") || (target.textContent || "").trim().slice(0, 120)
    });
  });
})();
