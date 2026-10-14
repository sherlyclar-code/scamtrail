# ScamTrail

A calm, plain-English scam checker and recovery guide for Australians, designed for older people, migrants and people who have already been scammed.

## Pages

- `index.html`: checker (link, message, phone, screenshot), "Already sent money?" card, how it works, scam alerts, learn (quiz, warning signs, family guide).
- `result.html`: risk level 1 to 4 with a text label, warning signs, what to do now, report and share, link to recovery, disclaimer.
- `recovery.html`: "what happened" selector that changes step 1, five checkable steps, case-file notes, draft letter to the bank, recovery-scam warning.

## How it works

Static HTML, CSS and plain JavaScript. No build step and no backend.

- All checks run in the browser (`assets/js/analyser.js`). Nothing the user types is sent anywhere.
- The checker uses warning-sign heuristics (impersonated brand names in web addresses, risky domain endings, link shorteners, urgency, requests for codes, gift cards, safe-account transfers, remote access apps and so on). It can never say something is "safe"; the lowest level is "No warning signs found, still verify".
- Screenshots stay on the device. The user types the words they can see, because there's no on-device text recognition yet.
- Recovery ticks and case notes are kept in `localStorage` on that device only, with a "Clear notes" button.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Deploy by uploading the folder to any static host (GitHub Pages, Netlify, Cloudflare Pages).

## Check before launch

- Confirm the external links and phone numbers in the footer and on the recovery page are current (Scamwatch, ReportCyber, IDCARE, AFCA, Lifeline).
- Review the wording with someone from the target audience and, ideally, a consumer-law or financial-counselling adviser.
