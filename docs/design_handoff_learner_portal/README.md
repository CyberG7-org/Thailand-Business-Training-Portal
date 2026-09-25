# Handoff: Learner portal redesign (dashboard + 5 step screens)

Repo: `CyberG7-org/Thailand-Business-Training-Portal` (main). Stack: Next.js 16 App Router, React 19, Tailwind v4 (CSS-first `@theme`), next-intl (th / en / zh).

## Overview
This handoff is a redesign of the learner area. The learner is a Thai company director who has to get through five steps in order: study → quiz → exam → name card → bank verification call. It covers the dashboard and one page for each step. The look should feel calm, official and premium: a navy band across the top, solid white surfaces for content, and gold kept for moments the learner has earned.

## About the design files
The `.dc.html` files are **design references built in HTML**. They show the intended look and behaviour, but they are not production code. Rebuild them inside the existing Next.js pages and components listed in the screen map below. Keep all the server logic, actions, `data-testid`s and next-intl keys as they are. Only the markup and styling change.

## Fidelity
**High-fidelity.** Colours, type, spacing, radii, shadows and motion are final. Recreate them closely, using Tailwind v4 utilities that point at the tokens in `tokens.proposed.css`. Never use raw hex values in the components.

## Step 0: tokens
Merge `tokens.proposed.css` into `app/globals.css`. It holds the `@theme` colours, radii, shadows, the `.glass` / `.glass-strong` classes with their fallbacks, focus ring and reduced-motion rules. Load the fonts with `next/font/google`:
- `Trirong` 400/500/600 → `--font-display` (headings, key numbers)
- `IBM Plex Sans Thai` 400/500/600 → `--font-body` (everything else)
- zh locale: keep Noto Sans SC as the body fallback.

## Shared shell (every learner page)
- **Page background:** dot grid `radial-gradient(rgb(28 52 112/.13) 1px, transparent 1.5px) 0 0/24px 24px` over `#e6edf8` (brand-50-ish). Mobile uses a 20px grid.
- **Navy band:** padding 16/24/40, bottom radius 36px (28px on mobile), text white.
  - Background: `repeating-radial-gradient(circle at 92% 0%, rgb(255 255 255/.07) 0 1px, transparent 1px 34px)`, then `radial-gradient(900px 420px at 85% 0%, rgb(36 88 198/.55), transparent 60%)`, then `linear-gradient(165deg, brand-900, brand-700)`.
  - Dashboard and exam result also have an SVG grain layer (see Dashboard v4).
- **Header** (`.glass`, radius 16, shadow `0 8px 24px rgb(12 26 58/.18)`):
  - Left: "BT" monogram, 40px, brand-900 background, gold-100 text, inset gold ring. Next to it the app name in Trirong 17/600 with the Thai name in 14px below.
  - Language switcher: segmented control, brand-100 track, active segment brand-700.
  - User: avatar, name and "Sign out", separated by a left border.
- **Sub-bar** (inside the band):
  - Back pill: 44px tall, fully rounded, `rgb(255 255 255/.12)` background, `rgb(255 255 255/.22)` border, arrow + label.
  - Right side: "Step n of 5" plus five 28×4 segments. Completed = gold-500, current = white, upcoming = `rgb(255 255 255/.25)`.
- **Page title:** Trirong 32/1.35/500 white. Intro text 16/1.75 in brand-100, max width ~680.
- **Content area:** padding 28px 48px. Cards are white, radius 16, shadow `0 2px 6px rgb(12 26 58/.06), 0 12px 32px rgb(12 26 58/.08)`. Card headers use a brand-50 background, a brand-100 bottom border and an H2 in Trirong 22/600 brand-900.
- **Mobile header:** a single glass bar with a 44px back icon, the page title in Trirong 16 and the language button.

## Buttons
- **Primary:** brand-600 background, white text, 48px tall (52px full-width on mobile), padding 0 24, radius 8, 16/600. Hover: brand-700. Focus: 2px brand-600 outline, 2px offset.
- **Secondary:** white background, 1px ink-300 border, brand-700 text. Hover: brand-50 background.
- **On navy:** white background with brand-900 text, or ghost style (1px `rgb(255 255 255/.35)` border). Focus ring gold-100.
- **Destructive (hang up):** bad-600 background, white text.

## Status tags
Fully rounded, 14/500, padding 1px 10px.
- Completed / Passed: gold-100 background, `#6e4c10` text.
- In progress / Viewed: brand-100 background, brand-700 text.
- Not passed / partial: warn-50 background, `#8a4f06` text.
- New / Locked: ink-100 background, ink-700 text.
- Call "Completed": ok-50 background, ok-600 text.

## Screens

Screen map from design to repo file:

| # | Design | Repo file(s) |
|---|---|---|
| — | Dashboard v4 | `dashboard/page.tsx`, `components/stage-card.tsx` |
| 01 | Study list | `study/page.tsx` |
| 02 | Study card | `study/[key]/page.tsx`, `components/read-aloud-player` |
| 03 | Quiz question | `quiz/[attemptId]/page.tsx`, `quiz/question-card.tsx` |
| 04 | Exam question | `exam/[attemptId]/page.tsx` (reuses QuestionCard, `instantFeedback={false}`) |
| 05 | Exam result | `exam/[attemptId]/result/page.tsx`, `components/answer-review` |
| 06 | Name card | `name-card/page.tsx`, `name-card-forms.tsx` |
| 07 | Bank call | `bank-call/page.tsx`, `call-panel.tsx` |
| 08–09 | Mobile TH quiz / study card | same files, mobile breakpoint |

### Login (`Login.dc.html`) → `app/[locale]/login/page.tsx` (or wherever `auth.*` renders)
- Desktop: grid `560px 1fr`, full height. Left: navy panel (right radius 36, rings + blue glow from bottom-right), monogram + app name top, `home.title` in Trirong 36/500 bottom, and the five `stages.titles` as a vertical list (32px circles, last one gold). Right: language switcher top-right (white track), centred form card max-width 420, radius 24, padding 36.
- Form: H2 `auth.title` Trirong 28/600; labelled 48px inputs (`autocomplete=username/current-password`); password has a 44px show/hide eye button inside the field; full-width 52px primary submit.
- Error: `role="alert"` bad-50 box above the fields with `auth.invalidCredentials` / `auth.accountDisabled`; offending input gets 2px bad-600 border + `aria-invalid`.
- Mobile: navy band with monogram, language pill, title; form card overlaps the band by 32px.
- Hero photo: full-bleed behind the navy panel (desktop) / band (mobile), `object-fit: cover`, with a navy scrim for 4.5:1 text contrast: desktop `linear-gradient(180deg, rgb(12 26 58/.72) 0%, rgb(12 26 58/.35) 30%, rgb(12 26 58/.82) 58%, rgb(12 26 58/.94) 88%, rgb(12 26 58/.5) 100%)`; mobile `linear-gradient(180deg, rgb(12 26 58/.78), rgb(12 26 58/.6) 45%, rgb(12 26 58/.9))`. Use `next/image` with `fill`, `priority`, `sizes="(min-width:1024px) 560px, 100vw"`. Copy `assets/photo-*.jpg` to `public/images/login/`; default is `photo-skyline.jpg` (others are alternates). Photos are from Pexels (free licence).
- Title block and form are vertically centred in their columns.
- Description under the title and hint under "Sign in". New keys: `home.description`, `auth.hint`, `auth.showPassword`, `auth.hidePassword` (Thai drafts in the mock need native review).

### Dashboard (`Dashboard v4.dc.html`)
- **Hero:** a two-column grid, `1fr 380px`. On the left: a small pill with the company name, the welcome H1, a next-step line and two CTAs. On the right: a `.glass-strong` progress card with a 120px ring (brand-600 stroke on a brand-100 track), the last exam score and the passing mark.
- **Stepper:** a 5-column `.glass` card inside the band, with a connecting line whose filled part is brand-700.
  - Circles are 44px. Done = gold-500 with a check, current = brand-900 with a pulse, available = white with a brand-600 border, locked = ink-100 with a lock icon.
- **Below the band:** a `7fr 5fr` grid.
  - "Your steps" list: rows at least 76px tall. The current row has a brand-100 → brand-50 gradient and a 4px brand-700 inset bar on the left. The locked row has a diagonal hatch.
  - Company card: a brand-700 → brand-600 gradient header with rings, stat tiles, a `dl` of details and a "Open certificate (PDF)" primary button.

### 01 Study list
- **Layout:** grid `1fr 340px`.
- **List rows** (at least 80px): the index "n/5" in Trirong 20/600 (gold-700 once completed), the title, the type ("Card"/"PDF"), a state tag and a chevron.
- **"Continue here" row:** the first row that isn't completed gets the current-row treatment.
- **Side card:** "Completed", "3 of 5" in Trirong 28, and a 5-segment bar (gold = completed, brand-600 = viewed, ink-100 = new). Below it the primary button "Continue with card n".

### 02 Study card
- **Layout:** grid `1fr 380px`.
- **Article:** white, padding 32/36, 16/1.75.
  - The Markdown table gets a brand-50 header row and ink-100 row dividers.
  - Tips go under an H3 (Trirong 18).
  - Footer: "Mark as completed" (primary, with a check icon) on the left and a link to the next card on the right.
- **Evidence aside ("From your documents"):** radius 24, gradient header. Each passage is a bordered item with the source ("{document} · page {page}") in 12/500 ink-500.
- **Read-aloud (th only):** a pill on the navy band with a 44px white round play button and a label.
- **Mobile:** the Markdown table is shown as a stacked `dl` (the question as the label, the answer below).

### 03 Quiz question / 04 Exam question
- **Question card:** centred, max width 780, padding 28/32.
- **Progress:** "Question n of N" plus a 6px bar. Brand-600 for the quiz, brand-700 for the exam.
- **Prompt:** Trirong 22/600 brand-900.
- **Options:** full-width buttons, at least 56px tall, radius 8, grid `32px 1fr 20px` (letter / text / icon).
  - Idle: 1px ink-300 border.
  - Quiz after answering: the correct option gets a 2px ok-600 border, ok-50 background and a check; the wrong pick gets a 2px bad-600 border, bad-50 background and an X; the rest are shown in ink-500 with an ink-100 border.
  - Exam after answering: the selected option gets a 2px brand-900 border, brand-50 background and a filled radio dot. Never show whether it is correct.
- **Quiz feedback box:** bad-50 or ok-50 background, radius 8. The title is 16/600 in the status colour; the explanation is 14px.
- **Exam extras:** "Answer saved" status with a check, and a band-right glass chip showing Questions / Passing mark / Attempt.
- **Thai locale:** use ก./ข./ค./ง. as option letters (check what `optionLabel` returns).

### 05 Exam result (passed)
- **Band:** a gold variant. Replace the blue radial glow with `rgb(200 150 62/.28)` and the rings with `rgb(200 150 62/.12)`.
- **Result badge:** `.glass-strong` with an inset gold ring. It holds a 112px gold medallion (radial gold gradient, 6px gold-100 halo) with a check that pops in, the "Passed" tag, "8 / 9" in Trirong 32 and the score line.
- **Not passed:** uses the normal blue band, with a warn tag in place of the medallion.
- **CTAs:** the next step in white, "Dashboard" as a ghost button.
- **Review list:** solid, max width 880, with resultNote as the header subtitle.
  - Each item has a 28px ✓ (ok) or ✗ (bad) circle and the question in 16/600.
  - The correct option is an ok-50 chip; the learner's wrong pick is a bad-50 chip with strikethrough.

### 06 Name card
- **Layout:** grid `380px 1fr`.
- **Form card:** the label (14/600), a 48px input (1px ink-300 border, radius 8, tabular-nums, focus in brand-600) and the hint in 14px ink-500.
  - Success status: ok-50 box.
  - Button: secondary "Create a new version" (primary when there is no card yet).
- **Blocked states:** warn-50 notice in place of the form.
- **Preview card:**
  - Header: "Preview" plus the meta line.
  - Body: ink-50 stage with padding 40. **Use the real PDF iframe here**; the mock business card in the design is only a placeholder.
  - Footer: Download PDF (primary) and Send to Telegram (secondary), with the queued status in ok-600.

### 07 Bank call
- **Layout:** grid `1fr 420px`.
- **Call panel:** radius 24. Its top is a navy area with:
  - an 88px mic circle that pulses while live
  - the phase line (green dot + `phase.*` + "Officer speaking")
  - a timer in Trirong 36, tabular
  - seven level bars animated with scaleY (decorative, `aria-hidden`)
- **Panel footer:** a hint on the left, with Hang up (destructive), Start call (primary) or Simulate (secondary, fake provider) on the right.
- **Tips:** three brand-50 tiles, each with a Trirong number.
- **Call history card:** each row shows the date (`toLocaleString(locale)`), a status tag and a `<details>` transcript on an ink-50 panel with speaker labels.
- **Blocked / not configured:** warn-50 / ink-50 notices in place of the panel.

## Motion
All motion uses the Web Animations API or CSS. Easing is `cubic-bezier(.2,.7,.2,1)` unless stated otherwise.

| Effect | Properties | Duration | Stagger / timing |
|---|---|---|---|
| rise (entrance) | opacity 0→1, translateY 18px→0 | 700ms | 80–100ms between items, top to bottom |
| ring fill | stroke-dasharray from 0 | 1400ms | — |
| line / progress bar | scaleX 0→1 from the left | 1100ms | — |
| pop (medallion, name-card preview) | scale .9→1 + fade | 800ms | — |
| pulse (current step, live mic) | box-shadow ring expanding and fading | 1.8s | infinite |
| call bars | scaleY .35↔1 | 900ms | infinite, offset per bar |

- The pop uses a different easing: `cubic-bezier(.3,1.4,.5,1)`.
- Under `prefers-reduced-motion: reduce`, turn everything off.
- Never animate `backdrop-filter`.

## Glass rules (from CLAUDE.md)
**Use glass on:** header, back pill, dashboard progress card and stepper, exam result badge, and the exam meta chip.

**Never use glass on:** inputs, option buttons, the study article, PDF previews or review lists.

**Limits:** no more than ~5 blurred layers per screen, and no glass nested inside glass. Keep the fallbacks from `tokens.proposed.css`.

## Accessibility
- **Contrast:** at least 4.5:1 for body text. Text on navy is white or brand-100.
- **Touch targets:** at least 44px, including language segments, back pill, `<summary>` and links.
- **Focus rings:** brand-600 (gold-100 on navy).
- **Numbers:** `tabular-nums` on all figures.
- **Thai typography:** line-height at least 1.7, no letter-spacing, no uppercase, nothing below 14px (12px only for Latin captions).
- **Stepper markup:** `aria-current="step"` on the current step, `aria-disabled` on locked rows, and `role="status"` on feedback, saved and sent messages.

## i18n
- **Keep existing keys:** every string already exists in `messages/*.json` (`study.*`, `quiz.*`, `exam.*`, `nameCard.*`, `bankCall.*`, `stages.*`). Keep using them.
- **New strings in these designs** (add to th/en/zh):

| New string | Suggested key |
|---|---|
| "Step {n} of 5" | `stages.stepOf` |
| "Card {n} of 5" | `study.cardOf` |
| "Continue with card {n}" | `study.continue` |
| "continue here" | `study.continueHere` |
| study list intro | `study.intro` |
| "Your answers" | `exam.reviewHeading` |
| "You passed. The bank verification call training is now open." | `exam.passedNext` |
| "Go to bank call training" | `exam.toBankCall` |
| Questions / Passing mark / Attempt | `exam.meta.*` |
| "Before you start" | `bankCall.tipsTitle` |
| "The officer asks in Thai. Answer in your own words." | `bankCall.panelHint` |
| Officer / You transcript labels | `bankCall.speaker.*` |

- **Dates:** show document dates exactly as printed (พ.ศ.).

## Sample data in the mocks
The following are placeholders and not real content:
- the quiz and exam questions, and the distractor names
- the evidence passages
- the transcript lines
- the name-card layout

Company facts come from the DBD record for บริษัท ธาราวาณิช จำกัด.

## Files
- `Dashboard v4.dc.html`: dashboard (desktop EN + mobile TH)
- `Learner Screens.dc.html`: screens 01–09
- `Login.dc.html`: sign-in (desktop EN + mobile TH error state)
- `tokens.proposed.css`: tokens to merge into `app/globals.css`
- `design-brief.md`: the standing design brief (copy to the repo root as `CLAUDE.md`)

- `assets/`: login hero photos (Pexels)

Open the `.dc.html` files in a browser (they need `support.js` and `image-slot.js` next to them).

## Suggested order for Claude Code
1. Tokens + fonts (Step 0), then the shared shell (header, band, back pill, step segments) as components.
2. Login.
3. Dashboard.
4. Study → quiz → exam → result → name card → bank call, one per session.
5. i18n pass: add new keys to th / en / zh, run type-check and tests.
