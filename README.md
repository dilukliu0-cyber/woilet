<div align="center">
  <img src="assets/icon.png" width="88" alt="Woilet" />
  <h1>Woilet</h1>
  <p><strong>Point your camera at a receipt. See where your money actually goes.</strong></p>
  <p>
    <img src="https://img.shields.io/badge/React_Native-0.81-61DAFB?logo=react&logoColor=white" alt="React Native" />
    <img src="https://img.shields.io/badge/Expo-SDK_54-000020?logo=expo&logoColor=white" alt="Expo" />
    <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Supabase-Postgres_+_RLS-3ECF8E?logo=supabase&logoColor=white" alt="Supabase" />
    <img src="https://img.shields.io/badge/Gemini-2.5_Flash-4285F4?logo=google&logoColor=white" alt="Gemini" />
  </p>
  <p><a href="README.ru.md">Русская версия</a> · <a href="https://github.com/dilukliu0-cyber/woilet/releases/latest">Download APK</a></p>
</div>

---

## The problem

People abandon expense trackers within two weeks, and it is almost always the same reason: typing in every purchase is tedious. The apps that survive are the ones that remove data entry, not the ones that add charts.

Woilet removes the typing. A photo of a receipt becomes an itemised, categorised basket in a couple of seconds — store, date, every line item, price and category.

Everything else in the app follows from having that level of detail:

- **Item-level history, not "Groceries — €40."** You can see exactly what you bought, what it cost, and where the same item was cheaper last time.
- **One product, one record.** The app recognises `Birell 0.0 Pomelo` and `Birell 0.0 Помело` as the same purchase instead of two.
- **Household budgets.** A shared view across family members, without forwarding screenshots.
- **Reminders that arrive when the app is closed.** If an item sits unchecked in your shopping list for more than three hours, you get a push.

## What it does

| Feature | Detail |
| --- | --- |
| **Receipt scanning** | Photo → store, date, line items, prices, categories. Fully offline-tolerant: captures queue on device and upload when connectivity returns |
| **Spending analytics** | Donut and bar breakdowns by category, per-day calendar, and price history for an individual product across stores |
| **Budgets** | Per-category limits with a warning as you approach the threshold |
| **AI chat** | Ask about your own spending in plain language. The same chat builds shopping lists from requests like "make me a list for lasagna" |
| **Smart shopping** | "Running low" predictions derived from your actual purchase intervals, reusable templates, and automatic ticking of items found in a scanned receipt |
| **Family sharing** | Invite-based shared budget with per-member spending breakdown |
| **Wallet** | Income tracking and running balance, on the flip side of the chart card |

Three interface languages (English, Russian, Czech), dark and light themes.

## Architecture

```
React Native (Expo)   ──►   Supabase              ──►   Gemini 2.5 Flash
  screens, offline           Postgres + RLS,             receipt parsing,
  queue, theming             Storage, Auth,              spend analysis,
                             Edge Functions              list generation
```

Four decisions worth calling out, because they are the ones that would break the product if done naively.

**AI keys never reach the client.** The app uploads an image to an edge function; the function talks to the model. A key shipped in a mobile bundle is a key that has been leaked — it can be extracted from the APK in minutes.

**Entitlements are enforced server-side, before the model is called.** Every function that costs money checks the user's plan and quota first. Hiding a button in the UI is not access control; the underlying endpoint is still reachable. Subscription state lives in a table where the client has read access only — inserts and updates are restricted to the service role, so a user cannot grant themselves a paid plan with a single request.

**Data isolation is a database rule, not a code path.** Row Level Security scopes every query to the owner and their family group. Filtering in application code fails open the moment someone forgets a `where` clause; RLS fails closed.

**Reminders run without the app.** A `pg_cron` job calls an edge function hourly via `pg_net`. A client-triggered notification cannot work here by definition — the entire point is to reach the user while the app is shut.

### Deduplication

Vision models name the same product differently on every scan. String normalisation cannot fix that: `Pomelo` and `Помело` share no characters. So the app solves it in two layers.

At scan time, the model receives the user's recent product vocabulary and reports which known product each line matches. That answer is validated against the vocabulary before use — an invented "match" would create a new duplicate rather than merge one.

For history already accumulated, a scheduled function asks the model to group existing names. The prompt forbids merging across flavour, volume, weight or fat content, and every merge is journalled so it can be reversed — a wrong merge corrupts spending history far worse than a duplicate does.

### By the numbers

| | |
| --- | --- |
| Screens | 16 |
| Edge functions | 10 |
| Database migrations | 25 |
| TypeScript | ~16,800 lines |
| Interface languages | 3 |

## Tech stack

**Client** — React Native 0.81, Expo SDK 54, TypeScript (strict), Zustand, React Navigation, Reanimated, react-native-svg, react-native-gesture-handler

**Backend** — Supabase: Postgres with Row Level Security, Storage, Auth, Deno edge functions, `pg_cron` + `pg_net` for scheduling

**AI** — Google Gemini 2.5 Flash for receipt parsing, spend analysis and product deduplication

**Infrastructure** — EAS Build, GitHub Actions for iOS builds, Sentry

## Getting started

```bash
npm install
cp .env.example .env    # fill in your Supabase project values
npx expo start
```

You will need:

- **A Supabase project.** Apply the schema with `supabase db push` — 25 migrations covering tables, RLS policies, functions and scheduled jobs.
- **A Google Gemini API key**, stored as a server secret, never in the app: `supabase secrets set GEMINI_API_KEY=...`

Client environment variables:

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_SENTRY_DSN=      # optional
```

## Building

**Android** — `eas build --platform android --profile preview` produces an APK that installs directly on a device. A prebuilt one is attached to the [latest release](https://github.com/dilukliu0-cyber/woilet/releases/latest).

**iOS** — built in GitHub Actions ([`build-ios.yml`](.github/workflows/build-ios.yml)). The output is unsigned, which is enough to verify the project compiles for iOS but not to install on a device; that requires an Apple Developer Program membership.

## Privacy

Receipt photos live in a private bucket and are served only through short-lived signed URLs. Account deletion removes every row and every stored file, including profile images.

Full text: [Privacy Policy](docs/privacy-policy.ru.md) · [Terms of Use](docs/terms-of-service.ru.md) *(currently Russian only)*

## Current limitations

Stated plainly, because they are real:

- **In-app purchases are not wired up.** Store products require developer accounts that are not yet set up. Pro access is granted by promo code in the meantime; the entitlement system behind it is complete and enforced server-side.
- **Push notifications require a compiled build.** Expo Go does not issue push tokens, so reminders only arrive from an installed APK or a development build.
- **No automated test suite.** Reasonable for a solo project at this stage, though the quota and entitlement logic is the part that would most benefit from one.

## License

[MIT](LICENSE)
