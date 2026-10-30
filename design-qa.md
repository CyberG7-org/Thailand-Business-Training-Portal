# Manager Header Design QA

**Source visual truth**

- `C:\Users\cyber\Downloads\Thailand Business Training Portal design\design_handoff_manager_header\screens\01-overview.png`
- `C:\Users\cyber\Downloads\Thailand Business Training Portal design\design_handoff_manager_header\screens\02-mobile-language-open.png`
- `C:\Users\cyber\Downloads\Thailand Business Training Portal design\design_handoff_manager_header\screens\03-mobile-profile-open.png`
- `C:\Users\cyber\AppData\Local\Temp\codex-clipboard-29287948-bbdf-47e2-bbec-52a3cf61a206.png` — user-highlighted language-menu width mismatch.
- `C:\Users\cyber\AppData\Local\Temp\codex-clipboard-c9235c10-f3f2-49b0-a9dc-42207774d1d7.png` — user-highlighted profile-menu width mismatch.
- Source captures: 920 × 540 px each.

**Rendered implementation**

- `design-qa-evidence/implementation-mobile-overview.png` — 390 × 190 px crop.
- `design-qa-evidence/implementation-mobile-language.png` — 390 × 340 px crop.
- `design-qa-evidence/implementation-mobile-profile.png` — 390 × 340 px crop.
- `design-qa-evidence/implementation-desktop-overview.png` — 1280 × 150 px crop.
- `design-qa-evidence/implementation-mobile-language-equal-width.png` — current in-app Browser capture.
- `design-qa-evidence/implementation-mobile-profile-equal-width.png` — current in-app Browser capture.
- Browser-rendered at `http://localhost:3000/th/admin`.
- Mobile viewport: 390 × 844 CSS px, device scale factor 1.
- Desktop viewport: 1280 × 900 CSS px, device scale factor 1.

**Comparison evidence**

- `design-qa-evidence/comparison-mobile-header.png` combines all three source states with the equivalent mobile implementation states in one 1340 × 1620 px image.
- `design-qa-evidence/comparison-desktop-header.png` combines the source overview with the desktop implementation in one 1280 × 820 px image.
- `design-qa-evidence/comparison-equal-width-menus.png` combines the two user-provided mismatch references with the corrected 140 px menu states in one 860 × 740 px image.
- No density normalization was needed: implementation captures use DPR 1. The handoff is a presentation board rather than a 1:1 viewport capture, so comparisons use visible component proportions, alignment, typography, colors, and interaction states rather than pixel-difference scoring.

**State**

- Authenticated Owner/staff shell in Thai.
- Closed header, language listbox open, profile menu open, and desktop closed header.
- Primary interactions tested: language and profile open/close, mutual exclusion, five language options, arrow-key semantics, Escape close, focus restoration, fixed trigger/menu dimensions, and responsive alignment.
- Browser console warnings/errors checked: none.

**Findings**

- No actionable P0, P1, or P2 mismatch.
- Fonts and typography: the implementation uses the existing Trirong display face and IBM Plex Sans Thai body stack, with the requested 15 px mobile title, 20 px desktop title, and 14 px controls. Thai content naturally wraps differently from the English mock; hierarchy and optical weight remain equivalent.
- Spacing and layout rhythm: mobile uses the specified two-column/two-row grid, 16 px column gap, 12 px row gap, 16/16/16/20 padding, 16 px radius, fixed 140 × 44 px controls, and matching 140 px dropdown surfaces. Desktop uses the specified horizontal layout and 12 px action gap.
- Colors and visual tokens: the existing brand, ink, gold, border, glass, focus, danger, and elevation tokens visibly match the handoff. No raw component colors were introduced.
- Image quality and asset fidelity: the target contains no required raster artwork or logo. The requested BT monogram removal is complete; interface icons use the project's existing vector icon library.
- Copy and content: localized app title, role, profile actions, and language aria label are present in all five enabled locales. Native language labels appear in the requested order and use “Malay” as specified.

**Focused region comparison**

- Separate overview, language-listbox, and profile-menu captures were required because menu typography, row height, checkmark, icons, solid surfaces, and overlap are too small to judge in the full board. Each state was compared in `comparison-mobile-header.png`.
- The mobile menu overlap is intentional and matches the supplied handoff: menus stack above the second header row and page content.
- The equal-width follow-up uses a focused comparison because panel-to-trigger edge alignment is the only changed visual invariant. Both menu edges now align exactly with their 140 px trigger edges, and the longest Thai profile action remains readable without overflow.

**Comparison history**

- Pass 1: no P0/P1/P2 findings. The first complete combined comparison used browser-rendered overview and both open-menu states; no visual fix was required after this pass.
- Desktop follow-up: confirmed the single-line title/role stack and right-aligned 140 px controls against the desktop target; no additional finding.
- Equal-width follow-up: the user identified the wider 160 px language and 220 px profile panels as a mismatch. Both panels were changed to 140 px, action spacing/type was tightened without clipping, fresh in-app Browser captures were compared in `comparison-equal-width-menus.png`, and the finding is resolved.

**Open Questions**

- None.

**Implementation Checklist**

- [x] Match mobile and desktop compositions.
- [x] Preserve accessible listbox/menu keyboard behavior.
- [x] Ensure only one menu can be open.
- [x] Localize new header labels in all enabled locales.
- [x] Verify browser rendering, console, responsive geometry, and focused interaction states.
- [x] Match each dropdown panel width to its 140 px trigger.

**Follow-up Polish**

- None required for this handoff.

final result: passed
