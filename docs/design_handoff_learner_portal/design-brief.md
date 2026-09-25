# Thailand Business Training Portal — design brief

Stack: Next.js 16 App Router, React 19, Tailwind v4 (CSS-first `@theme`, no tailwind.config.js), next-intl (th / en / zh). Fonts: Noto Sans Thai (th+latin), Noto Sans SC (zh).

## Style
Calm, official, trustworthy. Selective glassmorphism: glass on the shell, solid surfaces for anything read or typed.

## Tokens (use these, never raw hex)
Colour: brand-900/700/600/100/50 (navy), gold-500/100 (earned moments only), ok/warn/bad-600 + -50 (status), ink-900/700/500/300/100/50.
Radius: --radius-control 8px, --radius-card 16px, --radius-sheet 24px. Shadow: --shadow-glass, --shadow-raised.
NOTE: as of 2026-09-23 these are NOT yet in app/globals.css (only tailwind import + font stack).

## Typography
Display 32/1.35 · H1 28/1.4 · H2 22/1.45 · H3 18/1.5 · Body 16/1.75 · Small 14/1.7 · Caption 12/1.6. Weights 400/500/600 only.
Thai: line-height ≥1.7; no uppercase/letter-spacing; never below 14px; tabular-nums on data; buttons size to label.

## Glass
`.glass` / `.glass-strong`. Apply: header, back/home bar, dashboard stage cards, modals/sheets, name card, result badge, status bars, ask-documents panel.
Never: inputs, data tables, quiz/exam options, study-card body, PDF previews, review lists.
Max ~5 blurred layers/screen, no nesting, no animated blur, ink-900 text on glass. Keep `@supports not (backdrop-filter)` and `prefers-reduced-transparency` fallbacks.

## Components
Source from 21st.dev MCP first (search → shortlist → confirm pick → retrieve; 2 retrievals/day). Rewrite shadcn/Tailwind v3 class names onto tokens. If 21st is unavailable or 401, say so — don't silently hand-write.

## Non-negotiables
4.5:1 body contrast, brand-600 focus rings, 44px touch targets. Document dates/values shown exactly as printed (พ.ศ.). All strings via next-intl, 3 languages. Mobile first; admin tables scroll horizontally.
