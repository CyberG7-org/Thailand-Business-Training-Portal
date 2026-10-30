# Manager layout design QA

## Source of truth

- Handoff: `C:\Users\cyber\Downloads\design_handoff_manager_layout\README.md`
- Desktop states: `screens/01-desktop-expanded.png`, `screens/02-desktop-profile-menu.png`, and `screens/03-desktop-collapsed.png` (906 × 540 each)
- Mobile states: `screens/04-mobile-closed.png`, `screens/05-mobile-drawer.png`, and `screens/06-mobile-drawer-profile.png` (924 × 540 each; the supplied mobile canvas places the 267 px application viewport at the left)

## Browser-rendered implementation evidence

All implementation captures were produced from the optimized production build while authenticated as a manager on `/en/admin/submanagers`.

- `design-qa-evidence/manager-layout-desktop-expanded.png` — 1280 × 900, expanded sidebar
- `design-qa-evidence/manager-layout-desktop-profile.png` — 1280 × 900, profile menu open upward
- `design-qa-evidence/manager-layout-desktop-collapsed.png` — 1280 × 900, collapsed sidebar
- `design-qa-evidence/manager-layout-mobile-closed.png` — 390 × 844, drawer closed
- `design-qa-evidence/manager-layout-mobile-drawer.png` — 390 × 844, drawer open with scrim
- `design-qa-evidence/manager-layout-mobile-profile.png` — 390 × 844, drawer and upward profile menu open

## Comparison evidence

- `design-qa-evidence/manager-layout-comparison-desktop.png` — full expanded-shell comparison. The handoff and implementation are normalized to 540 px high and shown side by side.
- `design-qa-evidence/manager-layout-comparison-mobile-drawer.png` — focused drawer comparison. The handoff's 267 px application area and the implementation's 288 px drawer are normalized to 540 px high and shown side by side.

The focused comparison is used for mobile because the supplied 924 × 540 handoff image intentionally leaves most of its canvas blank to demonstrate the drawer/scrim relationship. Other states were checked individually against their paired handoff screenshots.

## Findings

- Desktop hierarchy, spacing, active navigation treatment, compact breadcrumb header, language control, and bottom-anchored profile match the supplied structure.
- The application uses the specified 248 px expanded and 64 px collapsed desktop widths. Collapse state persists in local storage.
- The mobile drawer is 288 px, keeps the active item visible, applies a scrim, traps keyboard focus, closes with Escape or route navigation, and restores focus after dismissing it.
- Profile actions remain inside the sidebar and open upward in both desktop and mobile states.
- Existing role-based navigation and real page content are preserved; the handoff's placeholder content is intentionally replaced by the working submanager form.
- The implementation retains the project's established fonts, tokens, Phosphor icon set, and 44 px minimum interactive targets.
- No P0, P1, or P2 visual mismatch remains.

## Iteration history

1. Replaced the horizontal staff navigation with the full-height responsive shell and preserved the existing role permissions.
2. Added desktop collapse persistence, compact header breadcrumbs, mobile drawer focus management, and upward profile menus.
3. Fixed route navigation so the drawer closes only after the selected page changes.
4. Updated record-side layout assertions for the new full-height application sidebar.
5. Verified all six states in the in-app browser and at exact Playwright viewports.
6. Re-captured the final evidence from a production build to exclude development-only overlays.

## Final result

passed

# Learner layout design QA

## Source of truth

- Handoff: `C:\Users\cyber\Downloads\design_handoff_learner_layout\README.md`
- Desktop states: `screens/01-desktop-home.png` through `screens/07-desktop-profile-menu.png`
- Mobile states: `screens/08-mobile-home.png` through `screens/11-mobile-interview.png`

## Browser-rendered implementation evidence

All implementation captures were produced from the optimized production build while authenticated as a learner.

- `design-qa-evidence/learner-layout-desktop-home.png` — 1280 × 900, expanded dashboard
- `design-qa-evidence/learner-layout-desktop-collapsed.png` — 1280 × 900, collapsed sidebar
- `design-qa-evidence/learner-layout-desktop-profile.png` — 1280 × 900, profile menu open upward
- `design-qa-evidence/learner-layout-desktop-study.png` — 1280 × 900, study
- `design-qa-evidence/learner-layout-desktop-quiz.png` — 1280 × 900, quiz
- `design-qa-evidence/learner-layout-desktop-interview.png` — 1280 × 900, interview
- `design-qa-evidence/learner-layout-desktop-namecard.png` — 1280 × 900, namecard
- `design-qa-evidence/learner-layout-mobile-home.png` — 390 × 844, dashboard with drawer closed
- `design-qa-evidence/learner-layout-mobile-drawer.png` — 390 × 844, drawer open with scrim
- `design-qa-evidence/learner-layout-mobile-profile.png` — 390 × 844, drawer and profile menu open
- `design-qa-evidence/learner-layout-mobile-interview.png` — 390 × 844, interview

## Comparison evidence

- `design-qa-evidence/learner-layout-comparison-desktop-home.png` — supplied desktop dashboard and production implementation, normalized to equal comparison canvases and shown side by side
- `design-qa-evidence/learner-layout-comparison-mobile-drawer.png` — supplied mobile drawer and production implementation, normalized and shown side by side
- `design-qa-evidence/learner-layout-comparison-mobile-profile.png` — supplied mobile profile state and production implementation, normalized and shown side by side

The supplied handoff images are presentation canvases rather than raw viewport captures, so the comparisons preserve each source's aspect ratio within equal-size tiles. Exact implementation dimensions are listed above.

## Findings

- The learner experience now uses one shared shell across dashboard, study, quiz, interview, and namecard routes; the obsolete horizontal stage navigation is removed.
- Desktop navigation uses the specified 248 px expanded and 64 px collapsed widths, with collapse state persisted as `learner-sidebar-collapsed`.
- The 56 px header provides route-aware breadcrumbs and the existing language control without duplicating learner identity in the header.
- The mobile drawer is 288 px wide, applies a scrim, traps focus, closes on Escape or route navigation, and restores focus to its trigger.
- Profile actions stay anchored to the bottom of the sidebar and open upward. Profile settings remains visibly present but correctly disabled because no learner profile route exists.
- Dashboard stage cards retain icons on desktop and use compact numbered markers on mobile, matching the handoff's responsive hierarchy.
- Existing learner content, progress logic, route permissions, interview viewport locking, and 44 px minimum interactive targets are preserved.
- The 21st review reported only heuristic fixed-width and token notices. Each flagged max-width is guarded by `w-full` or a responsive container, the 288 px drawer is intentionally fixed by the handoff, and no horizontal overflow was found at 390 px.
- No P0, P1, or P2 visual mismatch remains.

## Iteration history

1. Consolidated learner navigation into a shared responsive shell while preserving the existing page bodies and server-owned route data.
2. Added route-aware breadcrumbs, desktop collapse persistence, mobile focus management, and upward profile behavior.
3. Reworked the dashboard's mobile hierarchy to match the supplied navy hero, progress card, and numbered step tiles.
4. Updated learner journey assertions to target the shared sidebar rather than the removed horizontal tabs.
5. Corrected the disabled profile item's contrast while retaining honest disabled semantics.
6. Verified 21 affected learner E2E scenarios, 694 unit tests, formatting, lint, TypeScript, and the production build.
7. Captured and visually inspected the final production states at 1280 × 900 and 390 × 844.

final result: passed
