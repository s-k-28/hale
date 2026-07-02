# Plugins / Connectors — Master List for App Generation & Hackathons

> 175+ curated plugins, connectors, APIs and services for rapidly building apps, hackathon products, and MVPs. No MCPs — just plug-and-play services with SDKs/APIs. Last updated: July 2026.

---

## 1. Auth & Identity (drop-in login)

1. **Clerk** — https://clerk.com — Drop-in React/Next.js/Expo auth components (sign-in, user profile, orgs). Fastest auth setup in a hackathon.
2. **Auth0** — https://auth0.com — Enterprise-grade universal login, social providers, generous free tier.
3. **Supabase Auth** — https://supabase.com/auth — Email/OAuth/magic-link auth built into Supabase, integrates with Postgres row-level security.
4. **Firebase Authentication** — https://firebase.google.com/products/auth — Google's battle-tested auth for web + mobile, free for most usage.
5. **Better Auth** — https://better-auth.com — Open-source TypeScript auth framework, self-hosted, no vendor lock-in.
6. **Stytch** — https://stytch.com — Passwordless-first auth (magic links, OTP, passkeys) via API.
7. **Kinde** — https://kinde.com — Auth + feature flags + billing entitlements in one SDK.
8. **WorkOS** — https://workos.com — SSO/SAML/SCIM connector for "make it enterprise-ready" demos; AuthKit is free up to 1M users.

## 2. Payments & Monetization

9. **Stripe** — https://stripe.com — The default payments API; Checkout + Payment Links get you charging in minutes; great test mode for demos.
10. **Lemon Squeezy** — https://lemonsqueezy.com — Merchant-of-record payments for SaaS/digital products (handles global tax for you).
11. **Paddle** — https://paddle.com — Merchant-of-record billing for SaaS, subscriptions and licensing.
12. **Polar** — https://polar.sh — Open-source Stripe wrapper / MoR built for devs; monetize with a few lines of code.
13. **RevenueCat** — https://revenuecat.com — In-app purchase/subscription infrastructure for iOS/Android/React Native/Expo.
14. **Plaid** — https://plaid.com — Bank account linking + financial data for fintech demos (great sandbox).
15. **PayPal Developer** — https://developer.paypal.com — Ubiquitous checkout button + payouts API.

## 3. Backend-as-a-Service & Databases

16. **Supabase** — https://supabase.com — Postgres + auth + storage + realtime + edge functions + pgvector. The open-source Firebase.
17. **Convex** — https://convex.dev — Reactive TypeScript backend; realtime sync to clients with zero sync code. Excellent for live-updating hackathon demos.
18. **Firebase** — https://firebase.google.com — Firestore, realtime DB, auth, hosting, cloud functions; still the mobile king.
19. **Appwrite** — https://appwrite.io — Open-source all-in-one backend (auth, DB, storage, functions, messaging, hosting).
20. **PocketBase** — https://pocketbase.io — Entire backend in one Go binary (SQLite + auth + realtime + admin UI). Perfect for tiny projects.
21. **Neon** — https://neon.tech — Serverless Postgres with instant branching; free tier spins up in seconds.
22. **Turso** — https://turso.tech — Edge-hosted SQLite (libSQL); huge free tier, per-user databases.
23. **Upstash** — https://upstash.com — Serverless Redis + Kafka + QStash (scheduled/queued jobs) with per-request pricing.
24. **MongoDB Atlas** — https://mongodb.com/atlas — Managed Mongo with free cluster + Atlas Vector Search.
25. **Nhost** — https://nhost.io — Postgres + Hasura instant GraphQL backend.
26. **PlanetScale** — https://planetscale.com — Serverless MySQL/Postgres with branching workflows.
27. **InstantDB** — https://instantdb.com — Realtime client-side database (Firebase-style) with offline support, open source.

## 4. AI — LLM APIs & Inference

28. **Anthropic Claude API** — https://anthropic.com/api — Claude models for chat, agents, tool use, coding copilots.
29. **OpenAI API** — https://platform.openai.com — GPT models, embeddings, images, TTS/STT under one key.
30. **Google Gemini API** — https://ai.google.dev — Multimodal models with a genuinely free tier (great for hackathons); also embeddings.
31. **Groq** — https://groq.com — Ultra-fast LPU inference for open models; free tier makes realtime AI demos snappy.
32. **OpenRouter** — https://openrouter.ai — One API key for 300+ models across every provider; easy model switching.
33. **Together AI** — https://together.ai — Fast hosted open-source models (Llama, Qwen, FLUX) with credits for new users.
34. **Replicate** — https://replicate.com — Run thousands of community AI models (image, video, audio) with one API call.
35. **fal.ai** — https://fal.ai — Blazing-fast generative media inference (FLUX, video models) built for realtime apps.
36. **Hugging Face Inference** — https://huggingface.co/inference-endpoints — Serverless inference for any HF model + free Spaces hosting for demos.
37. **Mistral AI** — https://mistral.ai — European LLMs with a free API tier (La Plateforme).
38. **Cerebras Inference** — https://cerebras.ai — Fastest open-model token speeds available over API.

## 5. AI — Voice, Vision, Video & Media

39. **ElevenLabs** — https://elevenlabs.io — Best-in-class text-to-speech, voice cloning, and conversational voice agents.
40. **Deepgram** — https://deepgram.com — Fast, cheap speech-to-text + voice agent API; $200 free credits.
41. **AssemblyAI** — https://assemblyai.com — Speech-to-text with summarization, sentiment, and speaker labels built in.
42. **PlayHT (PlayAI)** — https://play.ht — Low-latency streaming TTS for realtime voice apps.
43. **Vapi** — https://vapi.ai — Build phone/web voice AI agents by wiring together any STT/LLM/TTS.
44. **Retell AI** — https://retellai.com — Voice agent platform with the fastest setup for AI phone calls.
45. **HeyGen** — https://heygen.com — AI avatar video generation API (talking-head demos, localization).
46. **Runway** — https://runwayml.com — Gen-4 video generation API for creative products.
47. **Luma AI (Dream Machine)** — https://lumalabs.ai — Text/image-to-video generation API.
48. **Stability AI** — https://stability.ai — Stable Diffusion family image generation APIs.
49. **Black Forest Labs (FLUX)** — https://bfl.ai — State-of-the-art FLUX image generation and editing API.
50. **Mux** — https://mux.com — Video hosting, live streaming, and playback analytics via API — video infra in an afternoon.
51. **Cloudinary** — https://cloudinary.com — Image/video upload, transformation and optimization CDN with generous free tier.

## 6. Automation Platforms & Universal Connectors

52. **Zapier** — https://zapier.com — 7,000+ app connectors; trigger workflows from your app via webhooks, no backend glue code.
53. **Make** — https://make.com — Visual automation builder with complex branching; cheaper than Zapier for heavy flows.
54. **n8n** — https://n8n.io — Open-source, self-hostable workflow automation with 400+ connectors + AI agent nodes.
55. **Pipedream** — https://pipedream.com — Code-level workflow automation; instantly consume any of 2,500+ app APIs with managed auth.
56. **Composio** — https://composio.dev — 250+ tool/app integrations with managed OAuth, purpose-built for wiring AI agents to real apps.
57. **Trigger.dev** — https://trigger.dev — Open-source background jobs and AI workflows in TypeScript (no infra).
58. **Inngest** — https://inngest.com — Durable workflows, queues and scheduled functions triggered by events; great free tier.
59. **Activepieces** — https://activepieces.com — Open-source Zapier alternative with AI pieces, MIT licensed.
60. **Windmill** — https://windmill.dev — Open-source platform to turn scripts into internal workflows/UIs.

## 7. Communication — Email, SMS, Push, Realtime

61. **Resend** — https://resend.com — Modern transactional email API; pairs with react-email for beautiful templates in JSX.
62. **Twilio** — https://twilio.com — SMS, WhatsApp, voice calls, and phone numbers via API.
63. **SendGrid** — https://sendgrid.com — High-volume email delivery with a free daily allowance.
64. **Postmark** — https://postmarkapp.com — Fastest transactional email delivery + inbound email webhooks.
65. **Loops** — https://loops.so — Email for SaaS: marketing + transactional in one simple editor/API.
66. **OneSignal** — https://onesignal.com — Free push notifications (mobile + web), email, SMS, in-app messages.
67. **Knock** — https://knock.app — Notification orchestration layer (in-app feed, push, email, Slack) with user preferences.
68. **Novu** — https://novu.co — Open-source notification infrastructure with in-app inbox components.
69. **Pusher** — https://pusher.com — Hosted WebSockets for realtime features (chat, presence, live updates) in minutes.
70. **Ably** — https://ably.com — Serious realtime messaging/pub-sub with a generous free tier.
71. **Stream** — https://getstream.io — Drop-in chat, activity feeds, and video SDKs — full chat UI in an hour.
72. **LiveKit** — https://livekit.io — Open-source realtime audio/video (WebRTC) + agents framework for voice AI.
73. **Daily** — https://daily.co — Video call API/SDK — embed multiparty video with prebuilt UI.

## 8. Deployment, Hosting & Dev Infra

74. **Vercel** — https://vercel.com — Zero-config deploys for Next.js/frontends, preview URLs perfect for demos.
75. **Netlify** — https://netlify.com — Static/JAMstack hosting with serverless functions and instant rollbacks.
76. **Railway** — https://railway.app — Deploy any app + database from GitHub in one click; hackathon favorite.
77. **Render** — https://render.com — Managed web services, Postgres, cron jobs and workers with free tiers.
78. **Fly.io** — https://fly.io — Run full-stack apps and databases close to users worldwide.
79. **Cloudflare Workers/Pages** — https://workers.cloudflare.com — Edge functions, static hosting, R2 storage, D1 SQLite, Workers AI — huge free tier.
80. **Expo EAS** — https://expo.dev/eas — Build, submit and update React Native apps over-the-air (this project uses it).
81. **ngrok** — https://ngrok.com — Expose localhost to the internet for webhooks and live demos.
82. **Coolify** — https://coolify.io — Open-source self-hosted Vercel/Heroku on any $5 VPS.
83. **GitHub Actions** — https://github.com/features/actions — Free CI/CD for builds, tests, cron jobs, and deploys.

## 9. Data, Search & Content APIs

84. **Open-Meteo** — https://open-meteo.com — Free weather API, no API key required — instant weather features.
85. **Mapbox** — https://mapbox.com — Beautiful maps, geocoding and navigation SDKs with free tier.
86. **Google Maps Platform** — https://developers.google.com/maps — Maps, Places, Directions, $200/month free credit.
87. **Exa** — https://exa.ai — AI-native web search API (semantic search over the web) for agent/RAG apps.
88. **Tavily** — https://tavily.com — Search API built for LLMs and RAG pipelines; free 1,000 calls/month.
89. **Firecrawl** — https://firecrawl.dev — Turn any website into clean LLM-ready markdown (scraping/crawling API).
90. **SerpAPI** — https://serpapi.com — Structured Google search results via API.
91. **Unsplash API** — https://unsplash.com/developers — Free high-quality photos for placeholder/real content.
92. **TMDB API** — https://developer.themoviedb.org — Free movie/TV metadata — great demo dataset.
93. **Spotify Web API** — https://developer.spotify.com — Music metadata, playlists and playback control.
94. **Algolia** — https://algolia.com — Instant search-as-you-type with drop-in UI components.
95. **Meilisearch** — https://meilisearch.com — Open-source, typo-tolerant search engine you can self-host or use in the cloud.

## 10. Product Glue — CMS, Analytics, Files, UI

96. **Sanity** — https://sanity.io — Headless CMS with realtime collaboration and generous free tier.
97. **Airtable API** — https://airtable.com/developers — Spreadsheet-as-a-database backend; non-technical teammates can edit data live.
98. **Notion API** — https://developers.notion.com — Use Notion pages/databases as your CMS or data store.
99. **PostHog** — https://posthog.com — Open-source product analytics + session replay + feature flags + A/B tests, all free tier.
100. **Sentry** — https://sentry.io — Error tracking and performance monitoring for web + mobile in 5 minutes.
101. **UploadThing** — https://uploadthing.com — Dead-simple file uploads for full-stack TypeScript apps.
102. **shadcn/ui** — https://ui.shadcn.com — Copy-paste React component library; the default UI kit for fast, polished frontends.
103. **v0 by Vercel** — https://v0.app — Generate working React/Tailwind UI from prompts, then paste into your app.

## 11. AI Agent & RAG Infrastructure

104. **E2B** — https://e2b.dev — Cloud code-execution sandboxes for AI agents; free hobby tier with $100 credits.
105. **Modal** — https://modal.com — Serverless Python/GPU compute; run AI workloads with a decorator, $30/month free credits.
106. **Daytona** — https://daytona.io — Secure, fast sandboxes for running AI-generated code.
107. **Browserbase** — https://browserbase.com — Headless browsers in the cloud for AI agents; pairs with their Stagehand framework.
108. **Browser Use** — https://browser-use.com — Open-source library that lets any LLM drive a real browser.
109. **Steel** — https://steel.dev — Open-source browser API purpose-built for AI agent web automation.
110. **Pinecone** — https://pinecone.io — Managed vector database with free starter index for RAG apps.
111. **Qdrant** — https://qdrant.tech — Open-source vector DB with a free 1GB cloud cluster.
112. **Weaviate** — https://weaviate.io — Open-source vector DB with hybrid (keyword + vector) search.
113. **Chroma** — https://trychroma.com — Embedded, dev-friendly vector store — `pip install` and go.
114. **Mem0** — https://mem0.ai — Drop-in long-term memory layer for AI agents and chatbots.
115. **Langfuse** — https://langfuse.com — Open-source LLM tracing/observability; see every prompt, cost and latency.
116. **Helicone** — https://helicone.ai — One-line proxy for LLM logging, caching and cost tracking.
117. **Perplexity Sonar API** — https://sonar.perplexity.ai — Search-grounded LLM answers with citations via API.
118. **Jina Reader** — https://jina.ai/reader — Prefix any URL with r.jina.ai to get LLM-ready text, free.

## 12. Messaging Platforms & Bot APIs

119. **Telegram Bot API** — https://core.telegram.org/bots — The easiest bot platform on earth; free, no review process.
120. **Discord API** — https://discord.com/developers — Bots, slash commands, and embedded activities for communities.
121. **Slack API** — https://api.slack.com — Workspace bots, slash commands, and incoming webhooks.
122. **WhatsApp Cloud API** — https://developers.facebook.com/products/whatsapp — Send/receive WhatsApp messages programmatically.
123. **Intercom** — https://intercom.com — In-app messenger, support inbox and Fin AI agent.
124. **Crisp** — https://crisp.chat — Free live-chat widget with a clean API.
125. **Chatwoot** — https://chatwoot.com — Open-source customer support inbox (self-hostable Intercom).

## 13. Scheduling & Calendar

126. **Cal.com** — https://cal.com — Open-source Calendly; embed scheduling or use the API/atoms in your app.
127. **Nylas** — https://nylas.com — One API for email, calendar and contacts sync across providers.
128. **Cronofy** — https://cronofy.com — Calendar sync + real-time availability API.
129. **Google Calendar API** — https://developers.google.com/calendar — Free calendar read/write for any Google account.

## 14. Forms, Documents & E-signature

130. **Tally** — https://tally.so — Free-forever form builder with webhooks and integrations.
131. **Typeform API** — https://typeform.com/developers — Conversational forms + responses API.
132. **Documenso** — https://documenso.com — Open-source DocuSign alternative with an embedding-friendly API.
133. **DocuSign API** — https://developers.docusign.com — The enterprise e-signature standard, free dev sandbox.
134. **Anvil** — https://useanvil.com — Fill, generate and e-sign PDFs via API.
135. **APITemplate.io** — https://apitemplate.io — Generate PDFs and social images from templates via API.

## 15. Feature Flags & Experimentation

136. **GrowthBook** — https://growthbook.io — Open-source feature flags + A/B testing.
137. **Statsig** — https://statsig.com — Flags, experiments and analytics with a huge free tier.
138. **LaunchDarkly** — https://launchdarkly.com — The enterprise feature-flag standard.
139. **Flagsmith** — https://flagsmith.com — Open-source, self-hostable feature flags.

## 16. Security, Verification & Anti-abuse

140. **Cloudflare Turnstile** — https://cloudflare.com/products/turnstile — Free, invisible CAPTCHA alternative.
141. **Arcjet** — https://arcjet.com — Rate limiting, bot detection and email validation as an SDK.
142. **Persona** — https://withpersona.com — KYC/identity verification flows via API.
143. **Checkr** — https://checkr.com — Background checks API (marketplaces, gig apps).
144. **hCaptcha** — https://hcaptcha.com — Privacy-focused CAPTCHA with free tier.
145. **Have I Been Pwned API** — https://haveibeenpwned.com/API — Check emails/passwords against breach data.

## 17. Internal Tools & Admin Panels

146. **Retool** — https://retool.com — Drag-and-drop internal tools on top of any DB/API.
147. **Appsmith** — https://appsmith.com — Open-source internal tool builder.
148. **Budibase** — https://budibase.com — Open-source low-code apps and workflows.
149. **ToolJet** — https://tooljet.com — Open-source Retool alternative.

## 18. Finance, Data & Utility APIs

150. **Alpha Vantage** — https://alphavantage.co — Free stock/forex/crypto market data API.
151. **Polygon.io** — https://polygon.io — Real-time and historical market data with free tier.
152. **CoinGecko API** — https://coingecko.com/api — Free crypto prices and market data.
153. **ExchangeRate-API** — https://exchangerate-api.com — Simple, free currency conversion rates.
154. **DeepL API** — https://deepl.com/pro-api — Best-in-class machine translation, 500k chars/month free.
155. **ipinfo.io** — https://ipinfo.io — IP geolocation and ASN data, generous free tier.
156. **NewsAPI** — https://newsapi.org — Headlines and articles from 150k+ sources.

## 19. Web3 & Crypto

157. **Alchemy** — https://alchemy.com — Blockchain node/API infrastructure across chains.
158. **thirdweb** — https://thirdweb.com — Full-stack web3 SDK: contracts, wallets, payments.
159. **Privy** — https://privy.io — Embedded wallets + auth for consumer crypto apps.
160. **Coinbase Developer Platform** — https://coinbase.com/developer-platform — Wallets, onramps and stablecoin payment APIs (x402, AgentKit).

## 20. AI App Builders & Prototyping

161. **Lovable** — https://lovable.dev — Prompt-to-full-stack-app (React + Supabase) generator.
162. **Bolt.new** — https://bolt.new — In-browser AI full-stack app builder by StackBlitz.
163. **Replit** — https://replit.com — AI agent that builds and deploys apps from prompts, all in the browser.
164. **Firebase Studio** — https://firebase.studio — Google's AI workspace for building full-stack apps.
165. **a0.dev** — https://a0.dev — Prompt-to-React-Native mobile app generator.

## 21. Social & Content Platform APIs

166. **GitHub API** — https://docs.github.com/rest — Repos, issues, actions — free and ubiquitous.
167. **YouTube Data API** — https://developers.google.com/youtube — Search, channels and video metadata.
168. **Reddit API** — https://reddit.com/dev/api — Subreddit and post data (free tier for non-commercial).
169. **Twitch API** — https://dev.twitch.tv — Streams, clips, chat and EventSub webhooks.

## 22. Programmatic Media & Video

170. **Remotion** — https://remotion.dev — Write videos in React; render programmatically.
171. **Shotstack** — https://shotstack.io — Cloud video editing/rendering API.
172. **Bannerbear** — https://bannerbear.com — Auto-generate social cards, OG images and banners via API.
173. **ImageKit** — https://imagekit.io — Real-time image/video optimization CDN with free tier.

## 23. Uptime, Testing & QA

174. **Checkly** — https://checklyhq.com — Synthetic monitoring and API checks as code (Playwright-based).
175. **Better Stack** — https://betterstack.com — Uptime monitoring, incident alerts and log management.
176. **BrowserStack** — https://browserstack.com — Test on real browsers and devices in the cloud.

---

### Quick-pick "hackathon stack" (if you only bookmark 8)
Clerk (auth) · Supabase or Convex (backend) · Stripe (payments) · OpenRouter or Gemini (LLM) · ElevenLabs (voice) · Resend (email) · Railway or Vercel (deploy) · PostHog (analytics)
