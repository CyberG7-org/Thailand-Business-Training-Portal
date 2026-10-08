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
