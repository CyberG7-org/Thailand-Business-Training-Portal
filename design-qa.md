# Learner dashboard mobile design QA

## Evidence

- Source visual truth:
  - `C:\Users\cyber\AppData\Local\Temp\codex-clipboard-88b777e3-d719-4f59-81cb-c94cd28335d0.png` — compact dashboard reference, 236 × 373 px.
  - `C:\Users\cyber\AppData\Local\Temp\codex-clipboard-ed1b4bfc-a477-412b-b360-c0f0792d9db6.png` — full company-details reference, 390 × 1477 px.
- Browser-rendered implementation: `C:\Users\cyber\.codex\visualizations\2026\10\07\01a113e7-eec7-72c2-992f-3b5fe23ab068\learner-dashboard-full-details\learner-dashboard-full-details.png`, 390 × 1673 px.
- Combined comparison: `C:\Users\cyber\.codex\visualizations\2026\10\07\01a113e7-eec7-72c2-992f-3b5fe23ab068\learner-dashboard-full-details\comparison.png`.
- Arrow-overlap source: `C:\Users\cyber\AppData\Local\Temp\codex-clipboard-c4de6587-a2a3-44a3-a213-342fca56d4fc.png`.
- Revised mobile capture: `C:\Users\cyber\.codex\visualizations\2026\10\07\01a113e7-eec7-72c2-992f-3b5fe23ab068\learner-dashboard-no-arrows\learner-dashboard-mobile.png`, 390 × 1673 px.
- Arrow comparison: `C:\Users\cyber\.codex\visualizations\2026\10\07\01a113e7-eec7-72c2-992f-3b5fe23ab068\learner-dashboard-no-arrows\arrow-comparison.png`.
- Desktop capture: `C:\Users\cyber\.codex\visualizations\2026\10\07\01a113e7-eec7-72c2-992f-3b5fe23ab068\learner-dashboard-no-arrows\learner-dashboard-desktop.png`, captured at a 1440 × 1000 CSS px viewport.
- Viewport: 390 × 844 CSS px, device scale factor 1; the implementation capture is full-page at native CSS density.
- State: authenticated Thai learner, assigned company, study available, quiz available, interview locked, name card available; website absent and Facebook present.
- Primary interactions tested: four direct mobile actions expose the correct linked/locked states; the manager-owned appointment is absent from the learner actions.
- Browser console errors: none.
- Horizontal overflow: none.

## Full-view comparison

The combined comparison shows the same task-first hierarchy as the dashboard reference: compact identity header, short welcome, four-stage progress strip, 2 × 2 action grid, then company information. The company section follows the separate details reference with a branded company header and vertically stacked fact cards. The implementation is taller because it combines both selected references into one continuous learner page and shows the complete available record.

## Focused region comparison

- Dashboard controls: four equal tap targets, compact status pills, and familiar blue/gold/green state colors match the modern reference pattern.
- Dashboard controls after overlap correction: mobile chevrons are removed while the entire unlocked card remains the tap target. Desktop list-row chevrons remain visible where spacing supports them.
- Company header: English and Thai names, company mark, and DBD tag preserve the reference hierarchy.
- Company facts: registration number, capital, registered date, address, directors, shareholders, objective count, business nature, activities, and available social links each have a consistent icon-and-value card.
- Optional website: the seeded visual state intentionally has no website. No blank website row or orphaned globe icon appears.

## Required fidelity surfaces

- Fonts and typography: existing Trirong display and IBM Plex Sans Thai body families are retained. Heading, label, value, and helper-text weights remain readable at 390 px without clipped text.
- Spacing and layout rhythm: 12–16 px internal spacing, 10 px vertical card gaps, 16 px radii, and full-width cards provide the compact but scrollable rhythm shown in the references.
- Colors and visual tokens: existing brand navy/blue, pale-blue canvas, gold, success green, ink, radii, and elevation tokens are reused. No unrelated visual system was introduced.
- Image and icon fidelity: the UI uses the installed Phosphor icon set; no placeholder, emoji, handcrafted SVG, or rasterized UI substitute is present. The small black Next.js development badge visible in the capture is preview tooling, not product UI.
- Copy and content: labels are localized. The company data comes from the assigned DBD record/training snapshot. Website and Facebook rows are conditional.

## Findings

- No actionable P0, P1, or P2 mismatch remains for the requested state.

## Comparison history

- Earlier implementation: the complete company definition list was hidden on mobile, leaving only the company header, registration number, and capital.
- Fix: converted the mobile company area into a complete vertical fact-card list and connected registration date, address, directors, shareholders, objectives, nature, activities, Facebook, and optional website data.
- Post-fix evidence: the 390 px full-page capture and combined comparison listed above show the complete record with no empty website row.
- Later finding: mobile row chevrons occupied the same corner as the status pills and visibly overlapped them.
- Fix: hide the decorative chevrons below the desktop breakpoint while retaining the full-card mobile link and visible focus treatment.
- Post-fix evidence: `arrow-comparison.png` shows clear status pills with no adjacent arrows; the browser test also asserts the chevrons are hidden at 390 px.

## Implementation checklist

- [x] Preserve the modern four-action mobile dashboard.
- [x] Show all available company details on mobile.
- [x] Keep long company content vertically scrollable.
- [x] Omit the website row when no website exists.
- [x] Keep desktop company details intact.
- [x] Verify responsive layout, interaction states, console, and overflow.

## Follow-up polish

- P3: production screenshots will not include the Next.js development indicator visible at the lower-left edge of the local capture.

final result: passed

---

# Design QA — learner desktop consolidation

## Inputs

- Dashboard request markup: `C:/Users/cyber/AppData/Local/Temp/codex-clipboard-3eaaa944-855f-4f49-a667-2e818e092d02.png`, 943 × 931 pixels.
- Study desktop reference: `C:/Users/cyber/AppData/Local/Temp/codex-clipboard-4c9cfd2d-ff42-4a5d-b74e-5741c5d16ac4.png`.
- Quiz desktop reference: `C:/Users/cyber/AppData/Local/Temp/codex-clipboard-b2e1eada-3e30-44ed-b9d6-2e294ae7e6af.png`.
- Readiness desktop reference: `C:/Users/cyber/AppData/Local/Temp/codex-clipboard-b3c1fa85-4b59-42f1-839e-089cb9813d5d.png`.
- Name-card desktop reference: `C:/Users/cyber/AppData/Local/Temp/codex-clipboard-edb85388-a9ab-42be-bda5-78164b03c3ad.png`.
- Dashboard implementation: `artifacts/design-qa/learner-dashboard-desktop.png`.
- Page implementations: `artifacts/design-qa/learner-study-desktop.png`, `artifacts/design-qa/learner-exam-desktop.png`, `artifacts/design-qa/learner-interview-desktop.png`, and `artifacts/design-qa/learner-name-card-desktop.png`.
- Combined dashboard comparison: `artifacts/design-qa/learner-dashboard-desktop-comparison.png`.
- Browser/CSS viewport: 1440 × 1000 pixels at device scale factor 1.
- State: authenticated Thai learner with an assigned company, passed quiz, current readiness stage, and rich company details.

## Full-view comparison

- The dashboard hero keeps the established glass account header and progress summary while removing both redundant hero actions and the desktop stepper.
- The stage list now occupies the full content width, followed by the company record rather than competing with it in a narrow side column.
- Company information retains the mobile fact-card hierarchy but uses two- and three-column desktop rows to avoid excessive scrolling and empty space.
- Study, Quiz, Readiness, and Name Card now render the same glass account header as the dashboard at the desktop breakpoint. Their compact mobile header remains unchanged.

## Focused review

| Area                  | Result | Notes                                                                                                                                               |
| --------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard hierarchy   | Pass   | Welcome and progress remain prominent; duplicate controls and the desktop stepper are absent.                                                       |
| Stage navigation      | Pass   | Four stages have one clear full-width list with visible state and direct actions.                                                                   |
| Company details       | Pass   | Record follows the stages and presents registration, capital, date, address, people, objectives, nature, activities, and links as responsive cards. |
| Shared desktop header | Pass   | All four primary learner pages use the dashboard glass header with the same language, identity, and sign-out placement.                             |
| Mobile preservation   | Pass   | The phone stepper and compact primary-page header remain available below the desktop breakpoint.                                                    |
| Responsive spacing    | Pass   | Content is constrained to 1240 px, fills the desktop canvas, and introduces no horizontal overflow.                                                 |

## Iteration history

1. Removed the dashboard hero's primary and secondary action buttons.
2. Hid the dashboard stepper at the desktop breakpoint while preserving it on phones.
3. Converted the dashboard content from a split 7/5 grid into a full-width vertical flow.
4. Rebuilt the desktop company record with the same icon-and-fact card language as mobile and responsive multi-column placement.
5. Switched primary learner pages to the dashboard glass header on desktop and retained the compact mobile override.
6. Added browser assertions for button removal, desktop stepper removal, company-card ordering, and shared-header styling.

## Findings

- No actionable P0, P1, or P2 visual mismatch remains for the requested desktop changes.
- P3: local captures contain generated E2E account names and may show the Next.js development badge; neither appears as customer content in production.

final result: passed

---

# Design QA — quiz attempt history

## Inputs

- Source issue: `C:/Users/cyber/AppData/Local/Temp/codex-clipboard-d15574e2-061d-4e3f-925f-2242f57e2736.png`.
- Fixed implementation: `artifacts/design-qa/quiz-attempt-history-fixed.png`.
- Browser/CSS viewport: 1280 × 720 pixels at device scale factor 1.
- State: authenticated Thai learner with two completed quiz attempts.

## Finding and resolution

- Before: each row repeated the result in both the attempt summary and its status pill.
- After: the summary contains only the attempt number and score; the pill is the single source of the result label.
- Automated coverage verifies the exact summary text independently from each result state.

final result: passed

---

# Design QA — learner primary pages

## Inputs

- Reference: `C:/Users/cyber/AppData/Local/Temp/codex-clipboard-d8e51c75-e48f-4b69-b761-ca7474c6bdd9.png`
- Mobile implementation: `artifacts/design-qa/learner-quiz-mobile.png`
- Desktop implementation: `artifacts/design-qa/learner-quiz-desktop.png`
- Browser: Chromium through the project Playwright setup and the Codex in-app browser

## Render metadata

- Mobile viewport: 395 × 862 CSS pixels, device scale factor 1
- Desktop viewport: 1440 × 1000 CSS pixels, device scale factor 1
- States: authenticated learner, quiz landing page; name-card blocked state also inspected in-browser
- Reference locale/account: English example account
- Implementation locale/account: Thai local E2E learner

## Comparison

| Area                   | Result | Notes                                                                                                                     |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| Header                 | Pass   | BT mark, compact language selector, avatar, and sign-out stay on one row on mobile and expand cleanly on desktop.         |
| Hero                   | Pass   | Navy patterned band, back control, progress segments, title, and supporting copy preserve the reference hierarchy.        |
| Primary navigation     | Pass   | Four equal destinations, Home first, current page omitted, separators retained; centered and widened on desktop.          |
| Main content           | Pass   | White raised content card and blue primary action match the reference structure; desktop constrains reading width.        |
| Responsive behavior    | Pass   | No horizontal page overflow at 390 px; desktop replaces the old sidebar with the same navigation system.                  |
| Cross-page consistency | Pass   | Study, quiz, readiness, name card, quiz attempts/results, and readiness sessions now use the shared primary-stage layout. |

## Iteration history

1. Centralized primary-stage navigation in the shared learner shell and removed duplicated page-level strips.
2. Preserved the study overview's completion-first ordering through its page-owned placement of the same shared component.
3. Removed the desktop-only learner sidebar from primary stages and widened the mobile navigation pattern for desktop.
4. Tightened the mobile shell header so its controls remain on one row like the reference.
5. Re-rendered mobile and desktop screenshots and reran responsive/end-to-end checks.

## Final result: passed

The implementation matches the reference's layout, hierarchy, component styling, and responsive intent. Text and learner data differ only because the verification render uses the local Thai E2E account.

---

# Design QA — shared compact learner header

## Inputs

- Source visual truth: `C:/Users/cyber/AppData/Local/Temp/codex-clipboard-794c1892-8f74-4c6d-84de-c6e8f4d4296f.png`, 409 × 413 pixels.
- Quiz implementation: `artifacts/design-qa/learner-quiz-header-mobile.png`, 395 × 916 pixels.
- Readiness implementation: `artifacts/design-qa/learner-readiness-header-mobile.png`, 395 × 862 pixels.
- Name-card implementation: `artifacts/design-qa/learner-name-card-header-mobile.png`, 395 × 862 pixels.
- Browser/CSS viewport: 395 × 862 pixels at device scale factor 1.
- State: authenticated English learner; quiz available, readiness locked, and name card blocked by an incomplete company record.

## Full-view and focused comparison

- Header composition: the BT mark, compact three-language selector, and circular learner avatar sit directly on the navy patterned band, matching the Study reference. The prior mobile glass container and sign-out text are gone.
- Navigation: Home remains the first destination, the current page remains omitted, and the Back button is absent across Quiz, Readiness, and Name Card.
- Progress: the five-step progress label and segments remain visible and right-aligned without leaving a blank Back-button slot.
- Typography: the existing Trirong display face and IBM Plex Sans Thai body face preserve the reference's title/body hierarchy and optical weight.
- Spacing and rhythm: header controls use the same compact top spacing and rounded navy band as Study; the navigation strip retains the same separation from the hero.
- Colors and tokens: existing brand navy, pale-blue canvas, white surfaces, gold progress, and blue action tokens match the source design.
- Image/icon fidelity: the existing BT mark and Phosphor navigation icons are retained; no placeholder or newly approximated artwork was introduced.
- Copy/content: each page keeps its own localized title and supporting text while sharing the reference header structure.

## Comparison history

1. Earlier implementation used the default glass account header on Quiz, Readiness, and Name Card.
2. The shared shell now selects the Study header variant for every primary learner stage.
3. The remaining Back control was removed from primary learner pages, leaving Home as the consistent return destination.
4. Post-fix captures show the same compact header and no Back button on all three requested pages.

## Findings

- No actionable P0, P1, or P2 mismatch remains.
- P3: the small Next.js development badge in the lower-left corner is preview tooling and will not appear in production.

final result: passed
