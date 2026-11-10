# ClearNews UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign ClearNews UI with a Hallmark-style editorial approach - cleaner typography, better hierarchy, refined spacing, and improved visual storytelling while preserving all functionality.

**Architecture:** Incremental redesign starting from design tokens, then shell/navigation, then key pages (Landing, Feed, Story) and components. Maintain existing React Router structure, data fetching patterns, and API contracts. Use CSS custom properties for theming.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, React Router, TanStack Query, D3/Recharts

## Global Constraints

- Preserve all existing functionality and routes
- Maintain light/dark theme support
- Keep API contracts unchanged
- Use existing fonts (Source Serif 4, IBM Plex Mono) or refine them
- No breaking changes to data models
- All animations must respect prefers-reduced-motion
- Follow Hallmark floor rules: use tokens, no transition:all, proper focus states, no invented metrics

---

### Task 1: Enhance Design Tokens

**Files:**
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: existing token structure
- Produces: enhanced token system with better spacing, typography scale, refined colors

- [ ] **Step 1: Read current tokens and understand structure**
  Read the full index.css to understand all tokens.

- [ ] **Step 2: Enhance token system**
  Add refined spacing scale, typography scale, elevation/shadows, border radius tokens while keeping existing ones for compatibility.

- [ ] **Step 3: Add base styles for better typography**
  Improve body font, add better line heights, letter spacing refinements.

- [ ] **Step 4: Test tokens compile**
  Run: `cd frontend && npx tsc --noEmit`
  Expected: No type errors

- [ ] **Step 5: Commit**
```bash
git add frontend/src/index.css
git commit -m "feat: enhance design tokens for cleaner editorial aesthetic"
```

---

### Task 2: Redesign App Shell & Navigation

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: existing nav structure, auth, theme
- Produces: cleaner header with better typography and spacing

- [ ] **Step 1: Read current App.tsx structure**
  Understand header, nav, auth buttons.

- [ ] **Step 2: Redesign header**
  Cleaner logo treatment, refined nav pills, better spacing, improved theme toggle.

- [ ] **Step 3: Improve mobile responsiveness**
  Ensure nav works well on mobile.

- [ ] **Step 4: Test build**
  Run: `cd frontend && npx tsc --noEmit`
  Expected: No errors

- [ ] **Step 5: Commit**
```bash
git add frontend/src/App.tsx
git commit -m "feat: redesign app shell and navigation"
```

---

### Task 3: Redesign Landing Page

**Files:**
- Modify: `frontend/src/pages/Landing.tsx`

**Interfaces:**
- Consumes: existing components, theme tokens
- Produces: cleaner hero, better story card, refined sections

- [ ] **Step 1: Read full Landing.tsx**
  Understand all sections.

- [ ] **Step 2: Redesign hero section**
  Cleaner typography, better hierarchy, refined CTA buttons.

- [ ] **Step 3: Redesign TrackedStoryCard**
  Cleaner data visualization, better spacing.

- [ ] **Step 4: Refine other sections**
  Improve LifecycleCards and other sections for better readability.

- [ ] **Step 5: Test build**
  Run: `cd frontend && npx tsc --noEmit`
  Expected: No errors

- [ ] **Step 6: Commit**
```bash
git add frontend/src/pages/Landing.tsx
git commit -m "feat: redesign landing page with cleaner editorial layout"
```

---

### Task 4: Redesign Feed/Stories Page

**Files:**
- Modify: `frontend/src/pages/Feed.tsx`
- Modify: `frontend/src/components/StoryBits.tsx` (if needed)

**Interfaces:**
- Consumes: existing data structure
- Produces: cleaner story list with better cards

- [ ] **Step 1: Read Feed.tsx and StoryBits.tsx**
  Understand current implementation.

- [ ] **Step 2: Redesign story cards**
  Cleaner layout, better typography, improved spacing.

- [ ] **Step 3: Refine filters and empty states**
  Better visual treatment.

- [ ] **Step 4: Test build**
  Run: `cd frontend && npx tsc --noEmit`
  Expected: No errors

- [ ] **Step 5: Commit**
```bash
git add frontend/src/pages/Feed.tsx frontend/src/components/StoryBits.tsx
git commit -m "feat: redesign feed page with cleaner story cards"
```

---

### Task 5: Polish Remaining Pages & Components

**Files:**
- Modify: `frontend/src/pages/Story.tsx` (review and polish)
- Modify: `frontend/src/components/Loading.tsx` (refine)
- Modify: `frontend/src/components/BiasBar.tsx` (polish if needed)

**Interfaces:**
- Consumes: existing patterns
- Produces: consistent refined aesthetic

- [ ] **Step 1: Review key pages for consistency**
  Check Story.tsx, Chat.tsx for style consistency.

- [ ] **Step 2: Polish components**
  Refine Loading, ensure consistent spacing/typography.

- [ ] **Step 3: Test build**
  Run: `cd frontend && npx tsc --noEmit`
  Expected: No errors

- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/Story.tsx frontend/src/components/Loading.tsx frontend/src/components/BiasBar.tsx
git commit -m "feat: polish story page and components for consistency"
```

---

### Task 6: Final Review & Verification

**Files:**
- Review all modified files

**Interfaces:**
- Consumes: all changes
- Produces: verified clean build

- [ ] **Step 1: Run TypeScript check**
  Run: `cd frontend && npx tsc --noEmit`
  Expected: No errors

- [ ] **Step 2: Run linter**
  Run: `cd frontend && npm run lint 2>&1 | tail -30`
  Expected: No critical errors

- [ ] **Step 3: Test build**
  Run: `cd frontend && npm run build 2>&1 | tail -40`
  Expected: Build succeeds

- [ ] **Step 4: Review changes**
  `git diff --stat` to see all changes

- [ ] **Step 5: Commit if needed**
  If any fixes were made, commit them.

---

## Execution Notes

- This is a visual redesign focused on typography, spacing, hierarchy, and polish
- All existing functionality, routes, API calls, and data structures remain unchanged
- Theme system (light/dark) is preserved and enhanced
- Animations respect reduced motion preferences
- Follows editorial aesthetic with serif headings, monospace metadata
