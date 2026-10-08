# Simplified learning flow — visual QA

Date: 2026-10-08  
Viewport: 390 × 844, Chromium, Thai locale

## Evidence

- `artifacts/visual-qa/simplified-learning-flow/study-mobile.png`
- `artifacts/visual-qa/simplified-learning-flow/quiz-mobile.png`
- `artifacts/visual-qa/simplified-learning-flow/readiness-mobile.png`

## Checks

- Study shows the five-card syllabus, 5/5 completion, all four navigation destinations and no horizontal overflow.
- Quiz uses the same learner header/navigation and states one 27/30 pass threshold without a critical-question rule or retest band.
- Readiness uses the same header/navigation and clearly states 11 questions, 9 required, Thai language and unlimited practice.
- Cards, controls and body copy remain legible at phone width; the full page scrolls vertically without clipped actions.

The black circular `N` visible at the lower-left of the captures is the Next.js development indicator, not application UI, and does not appear in a production build.
