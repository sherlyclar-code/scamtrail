/* ScamTrail shared UI: navigation, dialogs, home page checker and quiz. */
(function () {
  "use strict";

  var STORE_KEY = "scamtrail:check";

  // Storage can be blocked (private mode, strict settings), so every call is guarded.
  var safeStore = {
    get: function (area, key) {
      try { return window[area].getItem(key); } catch (e) { return null; }
    },
    set: function (area, key, value) {
      try { window[area].setItem(key, value); return true; } catch (e) { return false; }
    },
    remove: function (area, key) {
      try { window[area].removeItem(key); } catch (e) { /* ignore */ }
    }
  };
  window.ScamTrailStore = safeStore;

  // ---------- Mobile navigation ----------
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("is-open", !open);
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        toggle.setAttribute("aria-expanded", "false");
        nav.classList.remove("is-open");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        toggle.setAttribute("aria-expanded", "false");
        nav.classList.remove("is-open");
        toggle.focus();
      }
    });
  }

  // ---------- Dialogs ----------
  var lastOpener = null;
  document.querySelectorAll("[data-open]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var dlg = document.getElementById(btn.getAttribute("data-open"));
      if (!dlg) return;
      lastOpener = btn;
      if (dlg.id === "quiz-dialog") startQuiz();
      if (typeof dlg.showModal === "function") dlg.showModal();
      else dlg.setAttribute("open", "");
    });
  });
  document.querySelectorAll("dialog").forEach(function (dlg) {
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg || e.target.closest("[data-close]")) closeDialog(dlg);
    });
    dlg.addEventListener("close", function () {
      if (lastOpener) lastOpener.focus();
    });
  });
  function closeDialog(dlg) {
    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
  }

  // ---------- Checker tabs ----------
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () { selectTab(tab, false); });
    tab.addEventListener("keydown", function (e) {
      var next = null;
      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") next = tabs[0];
      else if (e.key === "End") next = tabs[tabs.length - 1];
      if (next) {
        e.preventDefault();
        selectTab(next, true);
      }
    });
  });

  // ---------- Checker forms ----------
  var A = window.ScamTrailAnalyser;
  var errorIds = { link: "link-error", message: "message-error", phone: "phone-error", screenshot: "shot-error" };

  document.querySelectorAll("form[data-type]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var type = form.getAttribute("data-type");
      var field = form.querySelector('[name="value"]');
      var contextField = form.querySelector('[name="context"]');
      var value = field.value.trim();
      var context = contextField ? contextField.value.trim() : "";
      var errorEl = document.getElementById(errorIds[type]);
      var analyseType = type === "screenshot" ? "message" : type;

      var result = A.analyse(analyseType, value, context);
      if (result.error) {
        if (type === "screenshot") {
          result.error = "Please type the words you can see in the screenshot. We can't read pictures automatically yet.";
        }
        errorEl.textContent = result.error;
        field.setAttribute("aria-invalid", "true");
        field.focus();
        return;
      }
      errorEl.textContent = "";
      field.removeAttribute("aria-invalid");

      var payload = JSON.stringify({ type: type, value: value, context: context });
      if (safeStore.set("sessionStorage", STORE_KEY, payload)) {
        window.location.href = "result.html";
      } else {
        // Storage blocked: fall back to the URL fragment, which is never sent to a server.
        window.location.href = "result.html#" + encodeURIComponent(payload);
      }
    });

    form.querySelectorAll(".input, .textarea").forEach(function (el) {
      el.addEventListener("input", function () {
        if (el.getAttribute("aria-invalid") === "true") {
          el.removeAttribute("aria-invalid");
          var err = document.getElementById(errorIds[form.getAttribute("data-type")]);
          if (err) err.textContent = "";
        }
      });
    });
  });

  // ---------- Screenshot preview (stays on device) ----------
  var shotInput = document.getElementById("shot-input");
  if (shotInput) {
    var preview = document.getElementById("shot-preview");
    var img = document.getElementById("shot-img");
    var nameEl = document.getElementById("shot-name");
    var objectUrl = null;
    shotInput.addEventListener("change", function () {
      var file = shotInput.files && shotInput.files[0];
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (!file || !/^image\//.test(file.type)) {
        preview.hidden = true;
        return;
      }
      objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
      nameEl.textContent = file.name;
      preview.hidden = false;
      document.getElementById("shot-text").focus();
    });
    document.getElementById("shot-remove").addEventListener("click", function () {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      shotInput.value = "";
      img.removeAttribute("src");
      preview.hidden = true;
      shotInput.focus();
    });
  }

  // ---------- Quiz ----------
  var QUIZ = [
    {
      q: "A text says your Linkt toll is unpaid and links to linkt-payments.info. What should you do?",
      options: [
        "Tap the link and pay quickly to avoid a fine",
        "Ignore the link and check your account by typing the official website address yourself"
      ],
      answer: 1,
      why: "The address isn't Linkt's real website (linkt.com.au). Toll and fine texts with payment links are one of the most common scams."
    },
    {
      q: "Your bank calls. They say your account is hacked and you need to move your money to a new \"safe account\" today.",
      options: [
        "Hang up, then call the number on the back of your card",
        "Move the money to protect it, then call the bank later"
      ],
      answer: 0,
      why: "Banks never ask you to move money to keep it safe. Scammers can make their number look like your bank's real number."
    },
    {
      q: "A message from a new number says: \"Hi Mum, I broke my phone. Can you pay this bill for me? I'll pay you back.\"",
      options: [
        "Pay it, they sound stressed",
        "Call your child on the number you already have saved"
      ],
      answer: 1,
      why: "\"Hi Mum\" scams rely on you wanting to help quickly. A quick call to the number you know clears it up."
    },
    {
      q: "Someone you met online asks you to buy gift cards and send them photos of the codes.",
      options: [
        "It's a scam. Real people and businesses don't ask for gift card codes",
        "It's fine if you've been talking for a long time"
      ],
      answer: 0,
      why: "Gift card payments are almost impossible to trace or reverse, which is why scammers ask for them."
    },
    {
      q: "A caller says they're from your phone company and asks you to read out a code that was just texted to you.",
      options: [
        "Read it out, they need to verify you",
        "Don't share it. Hang up"
      ],
      answer: 1,
      why: "That code is the key to your account. Sharing it can let a scammer take over your phone number, email or bank account."
    }
  ];

  var quizIndex = 0;
  var quizScore = 0;
  var quizBody = document.getElementById("quiz-body");

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function startQuiz() {
    if (!quizBody) return;
    quizIndex = 0;
    quizScore = 0;
    renderQuestion();
  }

  function renderQuestion() {
    var item = QUIZ[quizIndex];
    quizBody.innerHTML = "";
    quizBody.appendChild(el("p", "quiz-progress", "Question " + (quizIndex + 1) + " of " + QUIZ.length));
    quizBody.appendChild(el("p", "quiz-q", item.q));
    var opts = el("div", "quiz-options");
    var feedback = el("div", "quiz-feedback");
    feedback.setAttribute("role", "status");
    var nextBtn = el("button", "btn btn-primary");
    nextBtn.type = "button";
    nextBtn.hidden = true;
    nextBtn.textContent = quizIndex === QUIZ.length - 1 ? "See my score" : "Next question";

    item.options.forEach(function (text, i) {
      var b = el("button", "quiz-option");
      b.type = "button";
      b.appendChild(el("span", "", text));
      b.addEventListener("click", function () {
        var correct = i === item.answer;
        if (correct) quizScore++;
        opts.querySelectorAll("button").forEach(function (ob, j) {
          ob.disabled = true;
          if (j === item.answer) {
            ob.classList.add("is-correct");
            ob.appendChild(el("span", "mark", "Best answer"));
          } else if (j === i) {
            ob.classList.add("is-wrong");
            ob.appendChild(el("span", "mark", "Not the best answer"));
          }
        });
        feedback.innerHTML = "";
        feedback.appendChild(el("strong", "", correct ? "That's right. " : "Not quite. "));
        feedback.appendChild(document.createTextNode(item.why));
        nextBtn.hidden = false;
        nextBtn.focus();
      });
      opts.appendChild(b);
    });

    nextBtn.addEventListener("click", function () {
      quizIndex++;
      if (quizIndex < QUIZ.length) renderQuestion();
      else renderScore();
    });

    quizBody.appendChild(opts);
    quizBody.appendChild(feedback);
    quizBody.appendChild(nextBtn);
    var first = opts.querySelector("button");
    if (first) setTimeout(function () { first.focus(); }, 0);
  }

  function renderScore() {
    quizBody.innerHTML = "";
    quizBody.appendChild(el("p", "quiz-progress", "Quiz complete"));
    quizBody.appendChild(el("p", "quiz-q", "You chose the best answer " + quizScore + " out of " + QUIZ.length + " times."));
    quizBody.appendChild(el("p", "", quizScore === QUIZ.length
      ? "Great scam sense. Share the quiz with someone you care about."
      : "Every question you got wrong here is one you won't fall for in real life. The key habit: stop, then check using details you find yourself."));
    var row = el("div", "btn-row");
    var again = el("button", "btn btn-secondary", "Try again");
    again.type = "button";
    again.addEventListener("click", startQuiz);
    var signs = el("a", "btn btn-primary", "Check a real message");
    signs.href = "#check";
    signs.addEventListener("click", function () { closeDialog(document.getElementById("quiz-dialog")); });
    row.appendChild(again);
    row.appendChild(signs);
    quizBody.appendChild(row);
    again.focus();
  }
})();
