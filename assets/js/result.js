/* ScamTrail result page: re-runs the check locally and renders it. */
(function () {
  "use strict";

  var A = window.ScamTrailAnalyser;
  var store = window.ScamTrailStore;
  var TYPE_NAMES = { link: "link", message: "message", phone: "phone number", screenshot: "screenshot" };

  function parse(raw) {
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      return data && data.type && typeof data.value === "string" ? data : null;
    } catch (e) {
      return null;
    }
  }

  function readInput() {
    var fromHash = null;
    if (window.location.hash.length > 1) {
      // The hash is only used when storage is blocked. Ignore ordinary anchors like #main.
      try { fromHash = parse(decodeURIComponent(window.location.hash.slice(1))); } catch (e) { fromHash = null; }
    }
    return fromHash || parse(store.get("sessionStorage", "scamtrail:check"));
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function icon(id) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS(ns, "use");
    use.setAttribute("href", "#" + id);
    svg.appendChild(use);
    return svg;
  }

  var input = readInput();
  var result = input ? A.analyse(input.type === "screenshot" ? "message" : input.type, input.value, input.context) : null;

  if (!input || !result || result.error) {
    document.getElementById("no-result").hidden = false;
    document.getElementById("result-intro").textContent = "Paste a link, message or phone number on the home page to see a result.";
    return;
  }

  var typeName = TYPE_NAMES[input.type] || "message";
  document.getElementById("result").hidden = false;
  document.getElementById("result-title").textContent = "Here's what we found in this " + typeName;
  if (input.type === "screenshot") {
    document.getElementById("result-intro").textContent = "We checked the words you typed from your screenshot for common warning signs.";
  }

  // What was checked. Links are shown "defanged" as plain text so they can't be tapped by accident.
  var shown = input.value;
  if (input.type === "link") {
    shown = A.defang(shown);
  } else {
    if (shown.length > 400) shown = shown.slice(0, 400) + "...";
    A.findLinks(shown).forEach(function (l) { shown = shown.split(l).join(A.defang(l)); });
  }
  if (input.type === "phone" && input.context) shown += "\nThey said: " + input.context.slice(0, 300);
  document.getElementById("checked-label").textContent = "The " + typeName + " you checked" + (input.type === "link" ? " (shown safely, it can't be opened)" : "");
  document.getElementById("checked-value").textContent = shown;
  document.getElementById("checked-item").hidden = false;

  // Risk level
  var card = document.getElementById("risk-card");
  card.setAttribute("data-level", String(result.level));
  document.getElementById("risk-level-text").textContent = "Risk level " + result.level + " of 4";
  document.getElementById("risk-label").textContent = result.label;
  document.getElementById("risk-meter").setAttribute("aria-label", "Risk level " + result.level + " of 4: " + result.label);
  document.getElementById("risk-summary").textContent = result.summary;
  document.querySelectorAll("#risk-meter span").forEach(function (s, i) {
    s.classList.toggle("on", i < result.level);
  });
  if (result.level > 1) {
    document.getElementById("risk-icon").setAttribute("href", "#i-alert");
    document.getElementById("risk-icon-wrap").classList.add("icon-badge-warn");
  }
  document.title = "Risk level " + result.level + ": " + result.label + " | ScamTrail";

  // Red flags
  var list = document.getElementById("flag-list");
  if (result.flags.length) {
    result.flags.forEach(function (f) {
      var li = el("li");
      var badge = el("span", "icon-badge");
      badge.appendChild(icon(f.weight >= 4 ? "i-alert" : "i-flag"));
      li.appendChild(badge);
      var body = el("div");
      var h = el("h3", "", f.title);
      h.appendChild(el("span", "flag-strength", f.strength));
      body.appendChild(h);
      body.appendChild(el("p", "", f.detail));
      li.appendChild(body);
      list.appendChild(li);
    });
  } else {
    document.getElementById("flags-title").textContent = "No common warning signs found";
    var li = el("li");
    var badge = el("span", "icon-badge");
    badge.style.background = "var(--tint)";
    badge.appendChild(icon("i-search"));
    li.appendChild(badge);
    var body = el("div");
    body.appendChild(el("h3", "", "This is not a guarantee"));
    body.appendChild(el("p", "", "Scammers keep inventing new tricks, and some scams look exactly like real messages. If it asks you to pay, log in or share details, check with the organisation directly first."));
    li.appendChild(body);
    list.appendChild(li);
  }

  var notes = document.getElementById("notes");
  result.notes.forEach(function (n) {
    var box = el("div", "info-note");
    box.appendChild(icon("i-eye"));
    box.appendChild(el("p", "", n));
    notes.appendChild(box);
  });

  // What to do now
  var todo = document.getElementById("todo-list");
  result.actions.forEach(function (a) {
    todo.appendChild(el("li", "", a));
  });

  if (result.recoveryType) {
    document.getElementById("recovery-link").href = "recovery.html?what=" + result.recoveryType;
  }

  // Share a warning (never shares the suspicious link itself)
  var shareBtn = document.getElementById("share-btn");
  var status = document.getElementById("share-status");
  var homeUrl = new URL("index.html", window.location.href).href;
  var signs = result.flags.slice(0, 3).map(function (f) { return f.title; });
  var text = "Scam warning: I checked a " + typeName + " with ScamTrail and it came back as \"" + result.label + "\" (level " + result.level + " of 4)." +
    (signs.length ? " Warning signs: " + signs.join("; ") + "." : "") +
    " If you get something similar, don't click links, reply or pay. Check it first:";

  shareBtn.addEventListener("click", function () {
    status.textContent = "";
    if (navigator.share) {
      navigator.share({ title: "Scam warning", text: text, url: homeUrl }).catch(function () { /* cancelled */ });
      return;
    }
    var full = text + " " + homeUrl;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(full).then(function () {
        status.textContent = "Warning copied. Paste it into a text, email or chat to share it.";
      }, function () {
        showManualCopy(full);
      });
    } else {
      showManualCopy(full);
    }
  });

  function showManualCopy(full) {
    status.textContent = "Copy this warning and paste it into a message:";
    var ta = el("textarea", "textarea");
    ta.value = full;
    ta.setAttribute("aria-label", "Warning text to copy");
    ta.readOnly = true;
    status.appendChild(ta);
    ta.focus();
    ta.select();
  }
})();
