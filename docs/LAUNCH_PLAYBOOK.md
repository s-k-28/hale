# HALE Launch Playbook

Research digest synthesized 2026-06-12 from four sourced web-research passes
(competitor launches, subscription benchmarks, channel tactics, category ASO).
Every claim carries its source; treat 'directional' items accordingly.

# HALE LAUNCH DIGEST — synthesized from 4 research reports (competitors / playbooks / channels / ASO)

Everything below is sourced from the reports. One framing fact governs all of it: even the best-evidenced quit app (Smoke Free) showed zero intent-to-treat benefit in its 2024 pragmatic RCT because 75% of people offered it never installed it (jmir.org/2024/1/e50963). **Uptake, not product efficacy, is the binding constraint.** Spend the weekend accordingly.

---

## 1. FIVE MOVES TO COPY THIS WEEKEND (ranked by expected impact)

**#1 — Run the Puff Count TikTok playbook tonight: reverse-engineer, don't invent.**
The only proven $0 install channel in this exact niche post-2021 (cross-cutting pattern, competitors report). Steven Cravotta built Puff Count to ~$40K MRR / ~1M downloads almost entirely on organic TikTok: he searched "vaping," saved every viral video into a spreadsheet, logged hook/value/shot style, then cloned proven formats — a "what's inside a vape" teardown clone hit 8.3M views and drove tens of thousands of installs (IBTimes interview; starterstory.com/steven; Cravotta YouTube breakdown). Mechanics: entertainment-first with a 2-second CTA at the end ("no one wants to watch a sales video"); feature-list videos are the #1 failure mode; post daily; third video = 80K views → 3,000 installs overnight. TikTok is interest-graph, not follower-graph — a zero-follower account can hit millions of views immediately (dataslayer algorithm guide), so starting Saturday is not a handicap. Two founders → run 2–4 accounts: one documents a real quit journey ("Day 1 of quitting, I built an app to force myself"), the other clones niche formats. Build the viral-video spreadsheet before launch. His conversion warning applies directly to HALE: most-viral ≠ best-converting — **the emotional video converted best** (beehiiv interview).

**#2 — Verify the paywall sits AFTER a value-priming sequence, not before it.**
Duolingo's placement test (cited in revenuecat.com/blog/growth/how-top-apps-approach-paywalls/): paywall buried after home = 2% trial opt-in; paywall immediately after welcome = 8%; welcome → 3-screen value carousel → paywall = **15% (7.5x)**. HALE's "hard paywall at onboarding peak" is the right instinct — the weekend check is that 3+ screens of personalized value (quiz → "your plan" pattern used by Flo, Cal AI, Quittr; funnelfox/Medium teardowns + startupspells.com) precede it. The hard-paywall model itself is validated: 10.7% median download-to-paid vs 2.1% freemium (5x), $3.09 vs $0.38 revenue/install at D60 (8x), with no long-run retention penalty — 27% vs 28% subscriber retention at 1 year (RevenueCat State of Subscription Apps 2026). Quittr tested freemium and "usage tanked" (startupspells.com, founder-reported).

**#3 — Ship a Blinkist-style "how your free trial works" timeline screen on the 14-day trial.**
The canonical case: adding a transparent trial timeline (with a "we'll remind you before it ends" promise) drove **+23% trial conversion, −55% support complaints, and push opt-in from 6% → 74%** (growth.design/case-studies/trial-paywall-challenge; purchasely.com Blinkist case). This is a one-screen build, doable before Saturday. It matters doubly for HALE because trial cancellations are front-loaded (84% of 3-day-trial cancels happen Day 0–1) and 35% of annual-plan cancellations occur within Month 1 (RevenueCat 2026) — transparency is the sourced mitigation. Bonus validation: your 14-day length is on the right side of the data — median trial-to-paid is 25.5% for ≤4-day trials, 37.4% for 5–9 days, 42.5% for 17–32 days (RevenueCat 2026); 14 days sits between the two best bands.

**#4 — Take the "quit vaping / quit nicotine" ASO wedge + milestone-gated review prompts.**
"Stop smoking" is the old, defended term (incumbents with 57K–180K ratings); "quit vaping" is winnable (top app ~11.5K ratings) and "quit nicotine"/"quit pouches"/"quit zyn" are nearly uncontested — apps with <500 ratings rank top-10 (ASO report, iTunes Search API pull 2026-06-12). Winning formula: Title = Brand + exact-match action phrase ("Puff Count: Quit Vaping Now"), Subtitle = secondary keyword cluster or trust claim, no keyword duplication across fields (apptweak.com keyword-research guide). For HALE: "HALE: Quit Vaping & Nicotine" + a buddy/accountability subtitle. Screenshots: frame 1 = outcome (streak/money-saved), frame 2 = mechanic (quit-buddy pairing), frame 3 = social proof — first 3 frames decide everything, 10–25% CVR lift (apptweak; screenshotwhale, directional); H&F median page CVR 18.52% (SplitMetrics). Reviews: gate SKStoreReviewController on milestone screens (first 24h nicotine-free, 7-day streak, money-saved) — maps exactly to Apple's "completed a task" guidance (developer.apple.com ratings guidance; avanderlee.com gating pattern); systematic prompting "quadruples ratings within a very short period" (appfigures.com), and fresh review velocity often outweighs average rating (appradar/splitmetrics, directional).

**#5 — File the Apple Featuring Nomination tonight; launch PH Sat/Sun 12:01 AM PT with the founder story as the maker comment; Show HN same morning.**
Apple needs 2–3 weeks minimum notice, so featuring won't happen launch day — submit now anyway, written as a story not a changelog ("two founders built a quit-buddy app so a craving can be beaten from the lock screen"), citing accessibility and health-data privacy posture, which editors explicitly weigh (developer.apple.com/app-store/getting-featured/; nomination help pages). PH expectations: only ~10% of launches get featured; even featured = ~1,000–5,000 visitors (awesome-directories 2025 algorithm guide) — the prize is the Product of the Day badge + backlink feeding the Apple nomination, and **weekend launches face a lower bar to rank** (PH forums; onassemble guide). Self-hunt (no penalty — Dub, Cal.com both self-hunted to #1), scheduled personal maker first comment ("I was addicted, so I built this"), gallery images > video, personal DMs not "please upvote," reply to everything, momentum updates (dub.co/blog/product-hunt; Flexprice case study). Show HN has direct precedent: a solo dev's quit-smoking iOS app got constructive traction (news.ycombinator.com/item?id=43806766).

---

## 2. DASHBOARD BENCHMARKS (Health & Fitness, latest datasets)

| Metric | Median | Top quartile / strong | HALE note | Source |
|---|---|---|---|---|
| Download → trial start (D30) | 6.9% (RC) / 9.5% global, 14.5% NA (Adapty) | >23% (RC) | Target 7–10%+; hard paywall at onboarding should beat median | RevenueCat State of Subscription Apps 2026; adapty.io H&F benchmarks |
| Day-0 trial share | 82.1% of H&F trials start Day 0 | — | If trial doesn't start at first open, it almost never does — instrument Day 0 | RevenueCat 2026 |
| Trial → paid | 37.7% (RC) / 42.2% (Adapty) | >51.4% (RC) | 14-day trial sits between 5–9d band (37.4%) and 17–32d band (42.5%) | RevenueCat 2026; Adapty 2026 |
| Download → paid (D35) | 2.9% H&F (all-category 2.0%) | >6.2%; hard-paywall apps: 10.7% median, top 10% = 38.7% | Hard-paywall median (10.7%) is HALE's real comp | RevenueCat 2026 |
| D1 retention (usage) | — | 35–45% strong performers | All-category strong = 30–40% | UXCam aggregation of AppsFlyer/Adjust/data.ai |
| D7 retention | — | 15–22% strong | All-category strong = 10–15% | UXCam aggregation |
| D30 retention | ~2.78% in some H&F datasets (avg) | 8–12% strong | Wide variance by dataset definition | UXCam; Sendbird/AppsFlyer |
| Annual plan share | 68% of H&F subs sold are annual; median annual price $39.94 | — | $79.99 = 2x category median annual — watch paywall CVR closely | RevenueCat 2026 |
| Annual churn | 35% of annual cancels in Month 1; ~72% cancel within Year 1 | — | Blinkist transparency is the sourced mitigation | RevenueCat 2026 |
| First renewal rate | 67.7% | — | — | Adapty 2026 |
| Revenue/install & LTV | D14 RPI $0.48, D60 $0.66; Year-1 LTV per payer $35.64 | Hard paywall D60 RPI $3.09 | — | RevenueCat 2026 |

Seasonality caveat: H&F has the largest seasonal swing (January spike) — compare same-quarter cohorts only (UXCam). January is also the niche demand peak: 67% of nicotine users 18–24 say this year is their quit year (Truth Initiative survey).

---

## 3. THREE COMPETITOR MISTAKES HALE IS STRUCTURALLY EXPOSED TO

**Mistake 1: Uptake cold-start kills everything downstream — especially a paired-buddy mechanic.**
Smoke Free's 2024 pragmatic RCT failed on intent-to-treat solely because 75.7% of people offered the app never installed it (jmir.org/2024/1/e50963); Puff Count generated almost no revenue for its first 4–6 months (IBTimes/Starter Story). HALE is *more* exposed than either: the quit-buddy and "3 paired invites" referral loop are worthless at low user density. **Cheap guard:** daily TikTok volume from day 1 (the Puff Count lesson: "all it takes is one viral TikTok," but 4–6 months of nothing is normal), plus the proven first-1,000-users motion — $50 payments to "underrated" micro-creators in the niche (RizzGPT: two $50 creators → hundreds of thousands of downloads; Quittr: one $50 Christian micro-creator → ~$1,000/day; whop.com; startupspells.com — founder-reported). That's a sub-$200 line item even on a $0-ish budget.

**Mistake 2: Consumer-paid cessation has never worked at premium prices — and the tempting fix (fake discounts) backfires.**
No competitor cracked consumer-paid cessation: Smoke Free's consumers "refused to pay," forcing the NHS/B2G pivot (Yahoo Finance interview); QuitNow converted 2.15% at €2.99 one-time (lasdrogas.info press release); Puff Count topped out ~$40K MRR and sold (OEB Digital). HALE's $79.99/yr is 2x the H&F annual median of $39.94 (RevenueCat 2026) and above Quittr's $45/yr. The graveyard's wrong answer is I Am Sober's permanent $119.88→$39.99 strike-through, called out by reviewers as a manufactured discount (oarhealth.com review). **Cheap guard:** no fake anchor pricing; instead the Blinkist transparent-trial screen (+23% conversion, −55% complaints — growth.design); set a dashboard tripwire on download-to-paid vs the 10.7% hard-paywall median (RevenueCat 2026) and be ready to test price downward — Cravotta A/B-tested price and Superwall paywall iteration grew Cal AI revenue 3x in 10 months (IBTimes; superwall.com case study, vendor-reported).

**Mistake 3: Getting banned from the niche's home communities by promoting the referral loop there.**
HALE's invite mechanic creates a structural temptation to drop links exactly where it's prohibited. Verbatim rules (fetched June 2026): r/QuitVaping Rule 4 — "Advertising is prohibited. This includes surveys."; Rule 8 bans AI-sounding posts; r/stopsmoking Rule 6 — "No spamming… or asking people to click links to your program to quit smoking." Founders get banned for "I built an app, check it out," link drops, and DM-spamming (launch-channels report). **Cheap guard:** the disclosed-founder journey play — authentic quit-story and milestone posts with no link, app name only if asked or in bio; support-*providing* posts earn 3x the upvotes of support-seeking ones (JMIR 2024 content analysis, jmir.org/2024/1/e52129); message mods first for anything explicit like promo codes (wisp anti-spam playbook); route all explicit promotion to r/SideProject, r/iosapps, r/AppHookup, and Show HN instead.

---

## 4. SEVEN-DAY POST-LAUNCH CONTENT CALENDAR (TikTok / Reddit / PH — every format evidence-backed)

Standing cadence: 1–2 TikToks/day per account, 2–4 accounts across both founders (TikTok + Reels reposts); raw iPhone footage beats production; first 1–3 seconds decide completion rate, the main ranking signal (flarecut; houseofmarketers). Expect nothing in week 1 — the model is volume until one hits (Puff Count).

**Day 1 (Sat) — Launch day.**
- 12:01 AM PT: PH launch (full 24h of PT calendar day; upvotes hidden first 4h — dub.co). Maker first comment = personal addiction story (Dub's most-upvoted asset). Gallery images, no reliance on video. Personal DMs: "we launched, would love your feedback" — never "please upvote" (Flexprice; Dub).
- Same morning: Show HN post (QuitFlow precedent, HN id 43806766).
- TikTok per founder: **GRWM quit announcement** — "get ready with me while I tell you I'm quitting" (Tyler Kidd's hit 119M views — goodgoodgood.co) + "Day 1: I built an app to force myself to quit" journey opener (launch-channels weekend play).
- Submit Apple Featuring Nomination (2–3 week lead time — developer.apple.com).
- All day: reply to every PH comment; post momentum updates ("we're #4!") for second waves (Dub).

**Day 2 (Sun).**
- TikTok: **"How much money I wasted on vaping" math reveal** — pairs natively with HALE's money-saved counter (goodgoodgood.co format list) + screen-recording/voiceover of the day counter, a top organic format (flarecut).
- Reddit: create accounts, start *participating only* (no links) in r/QuitVaping (59K, +42%/yr), r/QuittingZyn (11K, +99%/yr — fastest growing), r/stopsmoking (GummySearch stats). Human-written — Rule 8 bans AI-sounding posts.
- PH: final-hours push + thank-you comment.

**Day 3 (Mon).**
- TikTok: **vape teardown clone** — "what's actually inside a vape," the format Cravotta cloned from a 20M-view video into 8.3M views and tens of thousands of installs (Starter Story/IBTimes). Note: cannot cross-post to r/QuitVaping (Rule 6 bans vape imagery).
- Reddit: explicit promo where it's allowed — r/SideProject, r/iosapps founder post (launch-channels report).

**Day 4 (Tue).**
- TikTok: **emotional buddy-accountability video** — quitting *with* someone; Cravotta: the emotional video converted best even when not most viral (beehiiv). Plus Day-4 streak check-in (daily-counter streak videos are a proven niche format — goodgoodgood.co).
- Reddit: r/AppHookup free promo codes post; DM mods of one quit sub asking permission for a community promo-code thread — mod-approved is the only safe explicit route (wisp playbook).

**Day 5 (Wed).**
- TikTok: **comedy/self-roast about being addicted** (proven niche format — goodgoodgood.co) + the "dropping a vape in a glass of water" simple text-on-screen video that "absolutely crushed" for Puff Count (Starter Story).
- Update the viral-video spreadsheet with what's working; double down on the best hook (Cravotta method).

**Day 6 (Thu).**
- TikTok: **quit-kit unboxing** variant (goodgoodgood.co) + journey-account Day 6 entry.
- Reddit: monitor "is there an app for…" threads across quit subs; answer helpfully with disclosure — "full disclosure, I built one of these" — disclosure increases trust (replyagent; karmaguy 90/10 rule).

**Day 7 (Sun→Sat +7).**
- TikTok: **Day 7 milestone video** — streak screen on camera; this is the niche's native check-in format (goodgoodgood.co).
- In-app: 7-day-streak milestone is the day the SKStoreReviewController prompt should start firing (≥7 days since install + significant event + idle delay — avanderlee.com gating; Apple "moment of satisfaction" guidance).
- Reddit: founder posts a genuine 7-day milestone/support-providing story, no link (3x upvote evidence — JMIR 2024).
- Review the week: PH flop is recoverable — relaunch tolerated in 1–3 months (PH forum); organic winners become future paid creatives once there's $1 of budget (Cravotta).

**Dropped as unsourced/unverified per your instruction:** Quittr's 25% download-to-paid and 99% quiz completion, Cal AI's "30% retention," Funnelfox's +60% web2app lift, QuitSure's self-reported 71/81% success rate, and Starter Story's "left money on the table" quote — all flagged in the reports as founder/vendor self-reported with no independent audit. Don't benchmark against them.
