/*
 * ScamTrail analyser.
 * Runs entirely in the browser. Nothing the person types is sent anywhere.
 * These are warning-sign heuristics, not a guarantee. A low result never means "safe".
 */
(function (root) {
  "use strict";

  var LEVELS = {
    1: {
      label: "No warning signs found, still verify",
      summary:
        "We didn't spot common warning signs. That doesn't mean it's safe. Scammers change their tricks often, so check it another way before you act."
    },
    2: {
      label: "Some warning signs",
      summary:
        "We found some warning signs. Treat this with caution and check it another way before you click, reply or pay."
    },
    3: {
      label: "High risk",
      summary:
        "This has several warning signs that scammers often use. Don't click, reply, call back or pay until you've checked with the organisation directly."
    },
    4: {
      label: "Very high risk, likely a scam",
      summary:
        "This shows strong signs of a scam. Don't engage with it. If you've already acted on it, go to the recovery steps now."
    }
  };

  // Brands often impersonated in Australia, with their official domains.
  var BRANDS = [
    { name: "myGov", keys: ["mygov"], domains: ["my.gov.au", "gov.au"] },
    { name: "the ATO", keys: ["ato"], token: true, domains: ["ato.gov.au", "gov.au"] },
    { name: "the ATO", keys: ["australiantaxation", "taxoffice"], domains: ["ato.gov.au"] },
    { name: "Services Australia", keys: ["servicesaustralia", "centrelink", "medicare"], domains: ["servicesaustralia.gov.au", "gov.au"] },
    { name: "Australia Post", keys: ["auspost", "australiapost"], domains: ["auspost.com.au"] },
    { name: "Linkt", keys: ["linkt"], domains: ["linkt.com.au"] },
    { name: "a toll road company", keys: ["etoll", "e-toll", "tollpay", "tollroad"], domains: ["linkt.com.au", "gov.au"] },
    { name: "CommBank", keys: ["commbank", "netbank", "commonwealthbank"], domains: ["commbank.com.au"] },
    { name: "Westpac", keys: ["westpac"], domains: ["westpac.com.au"] },
    { name: "NAB", keys: ["nab"], token: true, domains: ["nab.com.au"] },
    { name: "ANZ", keys: ["anz"], token: true, domains: ["anz.com.au", "anz.com"] },
    { name: "Telstra", keys: ["telstra"], domains: ["telstra.com.au", "telstra.com"] },
    { name: "Optus", keys: ["optus"], domains: ["optus.com.au"] },
    { name: "PayPal", keys: ["paypal"], domains: ["paypal.com", "paypal.com.au"] },
    { name: "Netflix", keys: ["netflix"], domains: ["netflix.com"] },
    { name: "Amazon", keys: ["amazon"], domains: ["amazon.com.au", "amazon.com"] },
    { name: "Apple", keys: ["apple", "icloud"], prefix: true, domains: ["apple.com", "icloud.com"] }
  ];

  var SHORTENERS = [
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "cutt.ly",
    "rb.gy", "tiny.cc", "shorturl.at", "rebrand.ly", "t.ly", "s.id", "v.gd", "bl.ink"
  ];

  var RISKY_TLDS = [
    "top", "xyz", "click", "live", "icu", "buzz", "shop", "vip", "cc", "sbs", "cfd",
    "online", "site", "lol", "rest", "monster", "info", "tk", "ml", "ga", "cf", "gq",
    "pw", "work", "support", "cyou", "bond", "win", "loan", "link", "help", "today"
  ];

  var TWO_PART_SUFFIXES = [
    "com.au", "net.au", "org.au", "gov.au", "edu.au", "asn.au", "id.au",
    "co.uk", "org.uk", "co.nz", "com.cn", "com.br", "co.in", "com.sg", "com.hk"
  ];

  // TLDs we accept when spotting a bare web address inside a message.
  var KNOWN_TLDS = ["com", "net", "org", "au", "biz", "io", "co", "me", "app", "ly", "gl", "gd",
    "us", "uk", "nz", "in", "cn", "ru", "at", "id", "gy", "to"].concat(RISKY_TLDS);

  function flag(id, title, detail, weight) {
    return { id: id, title: title, detail: detail, weight: weight };
  }

  function strengthLabel(weight) {
    if (weight >= 4) return "Strong sign";
    if (weight >= 2) return "Warning sign";
    return "Minor sign";
  }

  function registrableDomain(host) {
    var labels = host.split(".");
    var lastTwo = labels.slice(-2).join(".");
    var count = TWO_PART_SUFFIXES.indexOf(lastTwo) !== -1 ? 3 : 2;
    return labels.slice(-count).join(".");
  }

  function hostMatches(host, domain) {
    return host === domain || host.slice(-(domain.length + 1)) === "." + domain;
  }

  function defang(text) {
    return String(text).replace(/\./g, "[.]").replace(/^http/i, "hxxp");
  }

  // ---------- Links ----------

  function parseLink(raw) {
    var text = String(raw || "").trim();
    if (!text) return null;
    var hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
    var candidate = hasScheme ? text : "http://" + text;
    var url;
    try {
      url = new URL(candidate);
    } catch (e) {
      return null;
    }
    var host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!host || (host.indexOf(".") === -1 && !/^\[/.test(host))) return null;
    return { url: url, host: host, hasScheme: hasScheme, raw: text };
  }

  function analyseLink(raw) {
    var parsed = parseLink(raw);
    if (!parsed) {
      return { error: "That doesn't look like a web address. Try copying the whole link, for example: example.com.au/page" };
    }
    var url = parsed.url;
    var host = parsed.host;
    var flags = [];
    var notes = [];
    var labels = host.split(".");
    var tld = labels[labels.length - 1];
    var reg = registrableDomain(host);
    var tokens = host.split(/[.-]/);
    var squashedHost = host.replace(/[^a-z0-9]/g, "");
    var path = (url.pathname + url.search).toLowerCase();
    var official = null;

    BRANDS.forEach(function (b) {
      b.domains.forEach(function (d) {
        if (!official && hostMatches(host, d) && d !== "gov.au") official = b.name;
      });
    });
    if (!official && hostMatches(host, "gov.au")) official = "an Australian government website";

    if (parsed.hasScheme && url.protocol === "http:") {
      flags.push(flag("http", "Not a secure web address",
        "It starts with \"http\" instead of \"https\". Real banks and government sites use secure addresses. (Many scam sites use https too, so https alone doesn't prove a site is real.)", 1));
    }

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\[/.test(host)) {
      flags.push(flag("ip", "Uses numbers instead of a website name",
        "Real organisations use a name like example.com.au, not a string of numbers.", 3));
    }

    if (host.indexOf("xn--") !== -1) {
      flags.push(flag("punycode", "Uses look-alike letters",
        "The address contains special characters that can make a fake site look like a real one.", 3));
    }

    if (url.username) {
      flags.push(flag("userinfo", "Hides the real address",
        "Everything before the \"@\" sign is ignored. The link really goes to " + defang(host) + ".", 3));
    }

    if (SHORTENERS.indexOf(host) !== -1 || SHORTENERS.indexOf(reg) !== -1) {
      flags.push(flag("shortener", "Shortened link hides where it goes",
        "Link shorteners hide the real website. Banks and government agencies rarely send them.", 2));
    }

    if (!official) {
      var impersonated = null;
      BRANDS.forEach(function (b) {
        if (impersonated) return;
        var hit = b.keys.some(function (k) {
          if (b.token) return tokens.indexOf(k) !== -1;
          if (b.prefix) return tokens.some(function (t) { return t.indexOf(k) === 0; });
          return squashedHost.indexOf(k.replace(/[^a-z0-9]/g, "")) !== -1 || (k.length > 4 && path.indexOf(k) !== -1);
        });
        if (hit) impersonated = b.name;
      });
      if (impersonated) {
        flags.push(flag("brand", "Uses the name of " + impersonated + " but isn't their website",
          "The real website here is " + defang(reg) + ". Scammers put well-known names in fake addresses to look trustworthy.", 4));
      }

      if (tokens.indexOf("gov") !== -1 || tokens.indexOf("govau") !== -1 || /gov-?au/.test(host)) {
        flags.push(flag("fakegov", "Pretends to be a government website",
          "Australian government websites end in .gov.au. This one doesn't.", 4));
      }
    }

    if (RISKY_TLDS.indexOf(tld) !== -1) {
      flags.push(flag("tld", "Unusual website ending (." + tld + ")",
        "Addresses ending in ." + tld + " are cheap to set up and often used for scam sites.", 2));
    }

    var regName = reg.split(".")[0];
    if ((regName.match(/-/g) || []).length >= 2) {
      flags.push(flag("hyphens", "Lots of dashes in the website name",
        "Names like \"secure-account-update\" are a common scam pattern.", 1));
    }

    if (labels.length - reg.split(".").length >= 3) {
      flags.push(flag("subdomains", "Long, layered address",
        "Extra words before the real website name can be used to look official. The real website is " + defang(reg) + ".", 1));
    }

    if (/(login|log-in|signin|sign-in|verify|verification|update|secure|unlock|confirm|wallet|refund|payment|billing|toll)/.test(path) && !official) {
      flags.push(flag("pathwords", "Asks you to log in, verify or pay",
        "Links that take you straight to a login or payment page are a common way to steal details.", 1));
    }

    if (parsed.raw.length > 120) {
      flags.push(flag("long", "Very long link",
        "Very long links can hide where they really go.", 1));
    }

    if (official && flags.length === 0) {
      notes.push("This looks like an official address for " + official + ". Scam sites can copy real ones, so it's still safest to type the address yourself or use the official app.");
    }
    notes.push("Where this link really goes: " + defang(reg));

    return { flags: flags, notes: notes, host: host, domain: reg, official: official };
  }

  // ---------- Messages ----------

  var NEGATION = /(never|not|n't|won't|cannot|will not)\b[^.!?\n]{0,40}$/i;

  function matchUnlessNegated(text, re) {
    var g = new RegExp(re.source, re.flags.indexOf("g") === -1 ? re.flags + "g" : re.flags);
    var m;
    while ((m = g.exec(text)) !== null) {
      var before = text.slice(Math.max(0, m.index - 45), m.index);
      if (!NEGATION.test(before)) return m[0];
      if (m[0].length === 0) g.lastIndex++;
    }
    return null;
  }

  var MESSAGE_RULES = [
    {
      id: "giftcard", weight: 4, negatable: true,
      re: /\b(gift ?cards?|itunes cards?|google play cards?|steam cards?|apple gift|vouchers? codes?|bitcoin|crypto(currency)?|usdt|tether|western union|moneygram|bitcoin atm)\b/i,
      title: "Involves gift cards, crypto or money transfer services",
      detail: "Real organisations don't ask you to pay with gift cards, cryptocurrency or Western Union, and \"free\" gift card offers are common bait. Once sent, this money is very hard to get back."
    },
    {
      id: "safeaccount", weight: 4, negatable: true,
      re: /\b(safe account|secure account|holding account|move (all )?(your |the )?(money|funds|savings)|transfer (all )?(your |the )?(money|funds|savings))\b/i,
      title: "Asks you to move your money",
      detail: "Banks and police will never ask you to move money to a \"safe account\". This is one of the most common bank scams."
    },
    {
      id: "codes", weight: 4, negatable: true,
      re: /\b(send|share|tell|give|read( out)?|provide|reply with|forward|confirm|what is)\b[^.!?\n]{0,30}\b(code|pin|password|passcode|otp)\b/i,
      title: "Asks for a code, PIN or password",
      detail: "One-time codes and passwords unlock your accounts. No real bank, government agency or company will ask you to share them."
    },
    {
      id: "remote", weight: 4, negatable: true,
      re: /\b(anydesk|teamviewer|quick ?support|quick ?assist|ultraviewer|rustdesk|supremo|remote (access|control|desktop)|screen ?shar(e|ing)|(install|download) (this|the|an|our) app)\b/i,
      title: "Asks to get into your device",
      detail: "Apps like AnyDesk or TeamViewer let someone control your phone or computer and see your banking. Never let a stranger connect."
    },
    {
      id: "personal", weight: 3, negatable: true,
      re: /\b(date of birth|tax file number|tfn|medicare (card )?number|passport (number|details)|driver'?s? licen[cs]e|bank (account )?details|card (number|details)|bsb|account number|cvv|security questions?)\b/i,
      title: "Asks for personal or banking details",
      detail: "Scammers use these details to steal money or take out loans in your name."
    },
    {
      id: "family", weight: 3,
      re: /\b((hi|hey|hello),? (mum|mom|mam|dad|mama|papa|nan|nana|grandma|grandpa|aunty|uncle)\b|new (phone )?number|lost my phone|broke my phone|phone (is |got )?(broken|smashed)|this is my new)/i,
      title: "\"Hi Mum\" or new number message",
      detail: "Scammers pretend to be a family member with a new number, then ask for money. Call your family member on the number you already have."
    },
    {
      id: "prize", weight: 3,
      re: /\b(you('ve| have)? won|winner|prize|lottery|jackpot|inheritance|claim your (reward|prize|gift)|congratulations|selected to receive)\b/i,
      title: "Says you've won something",
      detail: "Prizes you didn't enter for, inheritances from strangers and surprise rewards are classic scam hooks."
    },
    {
      id: "investment", weight: 3,
      re: /\b(guaranteed (returns?|profits?|income)|double your money|investment opportunit(y|ies)|trading platform|returns? of \d+ ?%|\d+ ?% (returns?|profit)|passive income|crypto (trading|investment)|risk[- ]free|get rich)\b/i,
      title: "Promises big or guaranteed returns",
      detail: "No real investment can guarantee high returns. Check any offer on ASIC's Moneysmart website first."
    },
    {
      id: "secrecy", weight: 3,
      re: /\b(don'?t tell|do not tell|keep (this|it) (a )?(secret|confidential|between us|private)|don'?t (discuss|mention) (this|it))\b/i,
      title: "Asks you to keep it secret",
      detail: "Scammers ask for secrecy so family, friends or your bank can't warn you."
    },
    {
      id: "threat", weight: 3,
      re: /\b(arrest(ed)?|warrant|police will|legal action|court (action|case|date)|deport(ed|ation)?|visa (will be )?(cancel|cancelled|problem|issue)|immigration (problem|issue|case)|criminal (charges?|case))\b/i,
      title: "Threatens arrest, fines or visa trouble",
      detail: "Government agencies and police don't threaten arrest or deportation by text or phone call, or demand immediate payment."
    },
    {
      id: "urgency", weight: 2,
      re: /\b(urgent(ly)?|immediately|act now|within (24|48|12) ?(hours|hrs|h)|today only|final (notice|warning|reminder)|last chance|expires? (today|soon|tonight)|right away|asap|as soon as possible)\b/i,
      title: "Rushes you to act fast",
      detail: "Pressure to act quickly is a scammer's main tool. It stops you from thinking or checking."
    },
    {
      id: "account", weight: 2,
      re: /\b(suspend(ed)?|locked|blocked|deactivat(ed|e)|disabled|frozen|restricted|unusual (activity|sign[- ]in)|suspicious (activity|transaction|login)|unauthori[sz]ed|(is|are) at risk|compromised|hacked)\b/i,
      title: "Says your account has a problem",
      detail: "Messages saying your account is locked or at risk are designed to scare you into clicking or calling."
    },
    {
      id: "payment", weight: 2,
      re: /\b(pay now|payment (is )?(due|required|failed|overdue|declined)|outstanding (balance|amount|fee|toll)|unpaid|overdue|redelivery fee|customs fee|admin(istration)? fee|toll (notice|invoice|payment)|fine of|penalty)\b/i,
      title: "Asks you to pay a fee, fine or bill",
      detail: "Unexpected bills, tolls and delivery fees with a link to pay are among the most common scam texts."
    },
    {
      id: "refund", weight: 2,
      re: /\b(refund|rebate|tax return|owed (money|to you)|cash ?back|reimburse(ment)?|overpaid)\b/i,
      title: "Offers a refund or money owed to you",
      detail: "Fake refunds are used to get your bank or card details."
    },
    {
      id: "job", weight: 2,
      re: /\b(work from home|earn \$?\d[\d,]* ?(a|per) (day|hour|week)|part[- ]time (job|work)|easy money|simple tasks?|task(s)? (job|work)|hiring now|no experience needed)\b/i,
      title: "Job offer that seems too easy",
      detail: "Fake jobs promise easy money for simple online tasks, then ask you to pay to unlock earnings."
    },
    {
      id: "romance", weight: 2,
      re: /\b(my (love|darling|dear)|i love you|stuck overseas|stranded|hospital bills?|plane tickets?|military doctor|oil rig)\b/i,
      title: "Emotional story with a money request",
      detail: "Romance scammers build trust online, then invent emergencies that need money."
    }
  ];

  var ORGS = [
    ["mygov", "myGov"], ["\\bato\\b", "the ATO"], ["tax office", "the ATO"], ["centrelink", "Centrelink"],
    ["medicare", "Medicare"], ["services australia", "Services Australia"], ["aus ?post", "Australia Post"],
    ["australia post", "Australia Post"], ["linkt", "Linkt"], ["e-?toll", "a toll road company"],
    ["commbank|commonwealth bank|netbank", "CommBank"], ["westpac", "Westpac"], ["\\bnab\\b", "NAB"],
    ["\\banz\\b", "ANZ"], ["bendigo", "Bendigo Bank"], ["\\bing\\b", "ING"], ["telstra", "Telstra"],
    ["optus", "Optus"], ["amazon", "Amazon"], ["netflix", "Netflix"], ["paypal", "PayPal"],
    ["\\bafp\\b|federal police", "the police"], ["\\bpolice\\b", "the police"], ["home affairs", "Home Affairs"],
    ["\\bdhl\\b", "DHL"], ["fedex", "FedEx"], ["your bank", "your bank"]
  ];

  var LINK_RE = /\b(?:https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,10}(?:\/[^\s<>"']*)?)/gi;

  function findLinks(text) {
    var out = [];
    var m;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(text)) !== null) {
      var candidate = m[0].replace(/[.,;:!?)\]]+$/, "");
      var explicit = /^(https?:\/\/|www\.)/i.test(candidate);
      var hostPart = candidate.replace(/^https?:\/\//i, "").split(/[/?#]/)[0];
      var tld = hostPart.split(".").pop().toLowerCase();
      if (explicit || KNOWN_TLDS.indexOf(tld) !== -1) out.push(candidate);
    }
    return out;
  }

  function analyseMessage(raw) {
    var text = String(raw || "").trim();
    if (text.length < 4) {
      return { error: "Please paste or type the message so we can check it." };
    }
    var flags = [];
    var notes = [];

    MESSAGE_RULES.forEach(function (rule) {
      var hit = rule.negatable ? matchUnlessNegated(text, rule.re) : (text.match(rule.re) || [null])[0];
      if (hit) flags.push(flag(rule.id, rule.title, rule.detail, rule.weight));
    });

    var org = null;
    ORGS.some(function (o) {
      if (new RegExp(o[0], "i").test(text)) {
        org = o[1];
        return true;
      }
      return false;
    });

    var links = findLinks(text);
    var linkResults = links.slice(0, 3).map(analyseLink).filter(function (r) { return !r.error; });
    var allOfficial = linkResults.length > 0 && linkResults.every(function (r) { return r.official && r.flags.length === 0; });

    if (links.length) {
      flags.push(flag("haslink", "Contains a link",
        "Banks, myGov and the ATO say they won't send you links to log in. Don't tap links in unexpected messages. Type the address yourself instead.",
        allOfficial ? 1 : 2));
      var seen = {};
      linkResults.forEach(function (r) {
        r.flags.forEach(function (f) {
          if (seen[f.id] || f.weight < 2) return;
          seen[f.id] = true;
          flags.push(flag("link-" + f.id, "Link: " + f.title, f.detail, f.weight));
        });
        notes.push("A link in this message really goes to: " + defang(r.domain));
      });
    }

    if (org) {
      var w = flags.length ? 1 : 0;
      if (w) {
        flags.push(flag("org", "Claims to be from " + org,
          "Scammers often pretend to be trusted organisations. Contact " + org + " using details you find yourself, not ones in this message.", 1));
      } else {
        notes.push("This mentions " + org + ". If you're unsure, contact them using a number or website you find yourself.");
      }
    }

    return { flags: flags, notes: notes };
  }

  // ---------- Phone numbers ----------

  function analysePhone(raw, context) {
    var input = String(raw || "").trim();
    var digits = input.replace(/[^\d+]/g, "");
    var flags = [];
    var notes = [];
    if (digits.replace(/\+/g, "").length < 6) {
      return { error: "Please enter the full phone number, for example 0412 345 678." };
    }

    var intl = false;
    var local = digits;
    if (/^\+61/.test(digits)) {
      local = "0" + digits.slice(3).replace(/^0/, "");
    } else if (/^0011/.test(digits) || (/^\+/.test(digits))) {
      intl = true;
    } else if (/^00/.test(digits)) {
      intl = true;
    } else if (/^61\d{9}$/.test(digits)) {
      local = "0" + digits.slice(2);
    }

    if (intl) {
      flags.push(flag("intl", "International number",
        "If you don't know anyone in that country, be careful. Don't call back: some international numbers charge you a lot per minute.", 2));
    } else if (/^190/.test(local)) {
      flags.push(flag("premium", "Premium-rate number (starts with 190)",
        "Calling 190 numbers can cost a lot. Scammers use them to make money from your call.", 3));
    } else {
      var valid = /^04\d{8}$/.test(local) || /^0[2378]\d{8}$/.test(local) ||
        /^1[38]00\d{6}$/.test(local) || /^13\d{4}$/.test(local) || /^05\d{8}$/.test(local);
      if (!valid) {
        flags.push(flag("format", "Doesn't look like a normal Australian number",
          "The number has an unusual length or start. It may be faked or international.", 2));
      }
    }

    notes.push("Scammers can fake caller ID, so a call or text can look like it's from a real bank or government number. If in doubt, hang up and call the official number yourself.");

    var ctx = String(context || "").trim();
    if (ctx.length >= 4) {
      var msg = analyseMessage(ctx);
      if (!msg.error) {
        flags = flags.concat(msg.flags);
        notes = notes.concat(msg.notes);
      }
    } else {
      notes.push("We can only check the number's format. Adding what they said or asked for gives a better check.");
    }

    return { flags: flags, notes: notes, number: input };
  }

  // ---------- Scoring and advice ----------

  function levelFor(flags) {
    var score = 0;
    var critical = false;
    flags.forEach(function (f) {
      score += f.weight;
      if (f.weight >= 4) critical = true;
    });
    if (critical || score >= 7) return 4;
    if (score >= 3) return 3;
    if (score >= 1) return 2;
    return 1;
  }

  function has(flags, ids) {
    return flags.some(function (f) {
      return ids.some(function (id) { return f.id === id || f.id === "link-" + id; });
    });
  }

  function actionsFor(type, level, flags) {
    var a = [];
    if (has(flags, ["remote"])) {
      a.push("If someone already connected to your device, turn off the internet on it now (switch off Wi-Fi or unplug it) and call your bank from a different phone.");
    }
    if (has(flags, ["codes", "personal"])) {
      a.push("If you already shared a code, password or card details, call your bank now using the number on the back of your card.");
    }
    if (has(flags, ["giftcard", "safeaccount"])) {
      a.push("Don't buy gift cards, send crypto or move money for anyone who contacted you. If you already paid, call your bank or the card company straight away.");
    }
    if (type === "link") {
      a.push("Don't open the link. If you already did, don't enter any details.");
      a.push("Go to the organisation's website by typing the address yourself, or use its official app.");
    } else if (type === "phone") {
      a.push("Don't call the number back. If it claims to be your bank or a government agency, hang up and call the number from their official website or the back of your card.");
      a.push("Block the number on your phone.");
    } else {
      a.push("Don't tap any links, reply or call numbers in the message.");
      a.push("Contact the organisation or person directly, using details you find yourself.");
    }
    if (has(flags, ["family"])) {
      a.push("Call your family member on the number you already have saved before doing anything.");
    }
    if (level >= 2) {
      a.push("Report it to Scamwatch to help warn others. Then delete the message or block the sender.");
    } else {
      a.push("If something still feels wrong, trust that feeling. Ask someone you trust or call the organisation directly.");
    }
    if (level >= 3) {
      a.push("Tell family and friends so they can watch out for the same scam.");
    }
    return a;
  }

  function analyse(type, value, context) {
    var r;
    if (type === "link") r = analyseLink(value);
    else if (type === "phone") r = analysePhone(value, context);
    else r = analyseMessage(value);
    if (r.error) return { type: type, error: r.error };

    var flags = r.flags.slice().sort(function (a, b) { return b.weight - a.weight; });
    var level = levelFor(flags);
    return {
      type: type,
      level: level,
      label: LEVELS[level].label,
      summary: LEVELS[level].summary,
      flags: flags.map(function (f) {
        return { id: f.id, title: f.title, detail: f.detail, weight: f.weight, strength: strengthLabel(f.weight) };
      }),
      notes: r.notes || [],
      actions: actionsFor(type, level, flags),
      recoveryType: has(flags, ["remote"]) ? "remote" :
        has(flags, ["giftcard"]) ? "crypto" :
        has(flags, ["codes", "personal"]) ? "id" :
        has(flags, ["safeaccount"]) ? "bank" : ""
    };
  }

  var api = {
    analyse: analyse,
    analyseLink: analyseLink,
    analyseMessage: analyseMessage,
    analysePhone: analysePhone,
    findLinks: findLinks,
    defang: defang,
    LEVELS: LEVELS
  };

  root.ScamTrailAnalyser = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
