/* ScamTrail recovery page: "what happened" selector, step checklist, case file and bank letter. */
(function () {
  "use strict";

  var store = window.ScamTrailStore;
  var KEYS = { what: "scamtrail:what", steps: "scamtrail:steps", notes: "scamtrail:case" };

  var STEP1 = {
    bank: {
      title: "Call your bank now",
      payment: "Bank transfer",
      items: [
        "Call your bank straight away on the number on the back of your card or in its official app. Don't use any number the scammer gave you.",
        "Say: \"I've been scammed and I need to stop or recall a payment.\" Ask them to contact the bank that received the money.",
        "Ask them to block further payments and check for new payees or changes to your account.",
        "Write down the time, the name of the person you spoke to and any reference number."
      ]
    },
    card: {
      title: "Call your card provider now",
      payment: "Credit or debit card",
      items: [
        "Call the number on the back of your card. Ask them to block the card and send you a new one.",
        "Ask about a \"chargeback\". This is a way to dispute a card payment and try to get the money back.",
        "Check your statement for any other payments you don't recognise.",
        "Write down the time, the name of the person you spoke to and any reference number."
      ]
    },
    crypto: {
      title: "Contact the gift card or crypto company now",
      payment: "Cryptocurrency or gift cards",
      items: [
        "Gift cards: contact the company that issued the card, using the number on its official website. Give them the card numbers and receipt and ask them to freeze the balance.",
        "Crypto: contact the exchange or crypto ATM company you used. Give them the wallet address you sent to and ask them to freeze the transfer.",
        "If you bought the gift cards or crypto with your bank card or a bank transfer, call your bank too.",
        "Don't send any more money, even if they say it will \"unlock\" what you've lost. Keep every receipt and screenshot."
      ]
    },
    id: {
      title: "Lock down your accounts now",
      payment: "No payment yet (personal details shared)",
      items: [
        "If you shared a bank password, code or card number, call your bank now on the number on the back of your card.",
        "Change your email password first, then banking and other important accounts. Use a device the scammer hasn't touched.",
        "Call IDCARE on 1800 595 160 for a free plan to protect your identity.",
        "If you shared your myGov sign-in details, contact Services Australia using the details on its official website."
      ]
    },
    remote: {
      title: "Disconnect the device now",
      payment: "Remote access to my device",
      items: [
        "Turn off the internet on the device: switch off Wi-Fi and mobile data, or unplug the cable. You can also turn the device off.",
        "Don't sign in to banking or email on that device until it has been checked.",
        "Call your bank from a different phone. Tell them someone had access to your device.",
        "Change your passwords on a different device, then have the device checked or reset by a technician you trust (not anyone who contacted you)."
      ]
    }
  };

  // ---------- What happened ----------
  var radios = Array.prototype.slice.call(document.querySelectorAll('input[name="what"]'));
  var step1Title = document.getElementById("step1-title");
  var step1Body = document.getElementById("step1-body");
  var paymentField = document.getElementById("cf-payment");

  function renderStep1(key, announce) {
    var data = STEP1[key] || STEP1.bank;
    step1Title.textContent = data.title;
    var ul = document.createElement("ul");
    data.items.forEach(function (t) {
      var li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
    step1Body.innerHTML = "";
    step1Body.setAttribute("aria-live", announce ? "polite" : "off");
    step1Body.appendChild(ul);

    var defaults = Object.keys(STEP1).map(function (k) { return STEP1[k].payment; });
    if (!paymentField.value || defaults.indexOf(paymentField.value) !== -1) {
      paymentField.value = data.payment;
      saveNotes();
    }
  }

  var params = new URLSearchParams(window.location.search);
  var initial = params.get("what");
  if (!STEP1[initial]) initial = store.get("localStorage", KEYS.what);
  if (!STEP1[initial]) initial = "bank";
  radios.forEach(function (r) {
    r.checked = r.value === initial;
    r.addEventListener("change", function () {
      if (!r.checked) return;
      store.set("localStorage", KEYS.what, r.value);
      renderStep1(r.value, true);
    });
  });

  // ---------- Step checklist ----------
  var checks = Array.prototype.slice.call(document.querySelectorAll("[data-done]"));
  var fill = document.getElementById("progress-fill");
  var progressText = document.getElementById("progress-text");
  var saved = {};
  try { saved = JSON.parse(store.get("localStorage", KEYS.steps) || "{}") || {}; } catch (e) { saved = {}; }

  function updateProgress() {
    var done = 0;
    var state = {};
    checks.forEach(function (c) {
      var n = c.getAttribute("data-done");
      state[n] = c.checked;
      if (c.checked) done++;
      c.closest(".r-step").classList.toggle("is-done", c.checked);
      c.nextElementSibling.textContent = c.checked ? "Step " + n + " done" : "Mark step " + n + " as done";
    });
    fill.style.width = (done / checks.length) * 100 + "%";
    progressText.textContent = done + " of " + checks.length + " steps done" + (done === checks.length ? ". Well done for working through them." : "");
    store.set("localStorage", KEYS.steps, JSON.stringify(state));
  }
  checks.forEach(function (c) {
    c.checked = !!saved[c.getAttribute("data-done")];
    c.addEventListener("change", updateProgress);
  });

  // ---------- Case file ----------
  var form = document.getElementById("case-form");
  var caseStatus = document.getElementById("case-status");
  var fields = Array.prototype.slice.call(form.elements).filter(function (f) { return f.name; });
  var saveTimer = null;

  function readNotes() {
    var out = {};
    fields.forEach(function (f) { out[f.name] = f.value.trim(); });
    return out;
  }

  function saveNotes() {
    var ok = store.set("localStorage", KEYS.notes, JSON.stringify(readNotes()));
    return ok;
  }

  try {
    var notes = JSON.parse(store.get("localStorage", KEYS.notes) || "{}") || {};
    fields.forEach(function (f) { if (notes[f.name]) f.value = notes[f.name]; });
  } catch (e) { /* start empty */ }

  form.addEventListener("input", function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      caseStatus.textContent = saveNotes() ? "Saved on this device." : "Couldn't save in this browser. Download your notes to keep them.";
    }, 400);
  });

  var LABELS = {
    name: "Name", bank: "Bank or card provider", date: "Date it happened", amount: "Amount lost (AUD)",
    contact: "How they contacted me", who: "Who they said they were", payment: "How I paid",
    refs: "Transaction or receipt numbers", reports: "Report numbers", story: "What happened"
  };

  function notesText() {
    var n = readNotes();
    var lines = ["ScamTrail case file", "Written: " + new Date().toLocaleDateString("en-AU"), ""];
    Object.keys(LABELS).forEach(function (k) {
      lines.push(LABELS[k] + ": " + (n[k] || "(not filled in)"));
    });
    return lines.join("\n");
  }

  function download(name, text) {
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  document.getElementById("case-download").addEventListener("click", function () {
    download("scamtrail-case-file.txt", notesText());
    caseStatus.textContent = "Your notes were downloaded as a text file.";
  });
  document.getElementById("case-print").addEventListener("click", function () { window.print(); });
  document.getElementById("case-clear").addEventListener("click", function () {
    if (!window.confirm("Clear all case file notes from this device? This can't be undone.")) return;
    fields.forEach(function (f) { f.value = ""; });
    store.remove("localStorage", KEYS.notes);
    var current = radios.filter(function (r) { return r.checked; })[0];
    paymentField.value = STEP1[current ? current.value : "bank"].payment;
    caseStatus.textContent = "Notes cleared from this device.";
  });

  // ---------- Draft letter ----------
  var letterText = document.getElementById("letter-text");
  var letterStatus = document.getElementById("letter-status");

  var CONTACT_PHRASES = {
    "Phone call": "by phone", "Text message": "by text message", "Email": "by email",
    "Social media or chat app": "through social media or a chat app", "Website or online ad": "through a website or online ad",
    "Dating or friendship app": "through a dating or friendship app", "In person": "in person"
  };

  function or(v, placeholder) { return v ? v : "[" + placeholder + "]"; }

  function formatDate(v) {
    if (!v) return "[date it happened]";
    var d = new Date(v + "T00:00:00");
    return isNaN(d) ? v : d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  }

  function buildLetter() {
    var n = readNotes();
    var amount = n.amount ? "$" + n.amount.replace(/^\$/, "") : "[amount]";
    var paid = n.payment && n.payment.indexOf("No payment") === -1 && n.payment.indexOf("Remote access") === -1;
    var parts = [
      new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }),
      "",
      "To the Complaints Team (Internal Dispute Resolution)",
      or(n.bank, "Bank name"),
      "",
      "Subject: Formal complaint about scam " + (paid ? "payment" : "activity") + " on my account",
      "",
      "Account holder: " + or(n.name, "Your full name"),
      "Account number: [BSB and account number, or last 4 digits of card]",
      "",
      "Dear Complaints Team,",
      "",
      "I am writing to make a formal complaint. I have been the victim of a scam, and I ask you to treat this as a complaint under your internal dispute resolution process.",
      "",
      "What happened",
      "On " + formatDate(n.date) + ", someone claiming to be " + or(n.who, "who they said they were") + " contacted me " + (CONTACT_PHRASES[n.contact] || "[by phone, text, email...]") + ".",
      n.story ? n.story : "[Describe what happened in your own words.]",
      "",
      paid
        ? "As a result, I paid " + amount + " by " + n.payment.toLowerCase() + ". Transaction details: " + or(n.refs, "dates, amounts and reference numbers") + "."
        : "Details of what was affected: " + or(n.payment, "what was shared or accessed") + ". Relevant references: " + or(n.refs, "any reference numbers") + ".",
      "",
      "I have reported this scam. Report numbers: " + or(n.reports, "ReportCyber, police or other report numbers") + ".",
      "",
      "What I am asking for",
      "1. Investigate these transactions and contact the receiving bank or provider to try to recover my money.",
      "2. Tell me what checks or warnings were applied before the payment(s) were processed.",
      "3. Consider reimbursing my loss.",
      "4. Protect my account from further unauthorised activity.",
      "5. Give me your final response in writing.",
      "",
      "I understand you should give me a final response within 30 days. If I am not satisfied with your response, I may take my complaint to the Australian Financial Complaints Authority (AFCA).",
      "",
      "Please contact me at [your phone number] or [your email address].",
      "",
      "Yours sincerely,",
      "",
      or(n.name, "Your full name")
    ];
    return parts.join("\n");
  }

  document.getElementById("letter-make").addEventListener("click", function () {
    letterText.value = buildLetter();
    letterStatus.textContent = "Letter created. Fill in anything in [square brackets] before you send it.";
    letterText.focus();
    letterText.setSelectionRange(0, 0);
    letterText.scrollTop = 0;
  });

  document.getElementById("letter-copy").addEventListener("click", function () {
    if (!letterText.value) letterText.value = buildLetter();
    var done = function () { letterStatus.textContent = "Letter copied. Paste it into an email or your bank's complaint form."; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(letterText.value).then(done, function () {
        letterText.select();
        letterStatus.textContent = "Press Ctrl+C (or Cmd+C on a Mac) to copy the selected letter.";
      });
    } else {
      letterText.select();
      letterStatus.textContent = "Press Ctrl+C (or Cmd+C on a Mac) to copy the selected letter.";
    }
  });

  document.getElementById("letter-download").addEventListener("click", function () {
    if (!letterText.value) letterText.value = buildLetter();
    download("letter-to-my-bank.txt", letterText.value);
    letterStatus.textContent = "Your letter was downloaded as a text file.";
  });

  // Initial render
  renderStep1(initial, false);
  updateProgress();
})();
