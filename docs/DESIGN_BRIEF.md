# Design brief for Codex / ChatGPT

You design the look of INO ERP. You do not write business logic. The owner is not a designer: you propose, the owner picks, then the choice is frozen.

## The product
A retail ERP for several businesses, each with several branches. Runs on Google Apps Script, built as one HTML file (React 19, Vite, Tailwind 4, Recharts 3). Language: Indonesian first, English second.

Users:
- **Branch staff**: mostly on phones or small PCs, entering sales, receiving goods, counting stock. Speed and large tap targets matter.
- **Business admins and managers**: desktop, many tables, filters by branch.
- **Executives and accountants**: read-only dashboards across all branches.

Goal of the look: calm, dense, quiet, easy to scan. ERPNext/Odoo-like utility, not a marketing site.

## Hard constraints
- Start from the template already chosen in the PRD (Tremor Blocks, MIT) and adapt it. Do not invent a new visual language: no gradients, illustrations, decorative shapes, or animations longer than 150 ms.
- No new dependencies.
- Components take **props only**. No `google.script.run`, no data fetching, no business rules. Do not edit `Code_ERP.gs`, `src/App.tsx`, or `src/dataService.ts`.
- Format money, numbers, and dates only via `src/i18n/format.ts`. UI text goes in the language catalogs. Use logical CSS (`ms-*`, `me-*`, `text-start`). Leave 30% extra room for longer translations. Follow `.agents/rules/ui-dashboard-i18n.md`.
- Color is never the only signal. Every chart has a table alternative.
- Mobile first: layout works at 360 px wide; bottom navigation on narrow screens; tap targets at least 44 px.

## Density defaults (adjust only with a reason)
Base font 13 px; table row 32 px; card padding 12 px; sidebar 220 px (56 px collapsed); radius 6 px; one accent color plus neutrals; status colors for ok/warn/error.

## Density is enforced in code, not by good intentions
Put the scale in `src/ui/tokens.css` so every Tailwind class inherits it (verify the variable names against the installed Tailwind 4 version with a build):
```css
@theme {
  --spacing: 0.2rem;              /* default 0.25rem: all p-*, gap-*, h-* shrink 20% */
  --text-xs: 0.6875rem;           /* 11px */
  --text-sm: 0.75rem;             /* 12px */
  --text-base: 0.8125rem;         /* 13px */
  --text-lg: 0.9375rem;           /* 15px */
  --text-xl: 1.0625rem;           /* 17px */
  --text-2xl: 1.25rem;            /* 20px, largest allowed (page title) */
}
```
Rules: tables and dashboards use the full width (no centered narrow columns, no hero spacing). No font above 20 px anywhere. Card padding and gaps at most 12 px. Table rows, inputs, and buttons at most 32 px on desktop; 44 px tap targets only on phones.

**Measurable acceptance** (every screen, with screenshots at 1366x768 and 360x800 and a list of measured vs target values): at 1366x768 the dashboard shows the header, filters, 4 KPI cards, and at least 12 table rows without scrolling. A screen that fails these numbers is rejected, regardless of how it looks.

## Process (do not skip steps)
1. **Design system only.** Produce two variants (A and B) of tokens, the primitive components (button, input, select, table, card, badge, tabs, modal, toast), and three sample screens as static previews: the app shell, a filtered dashboard, and a data table. Then **stop and wait** for the owner to pick.
2. **Freeze.** Write the chosen system to `docs/DESIGN_SYSTEM.md` and `src/ui/tokens.css`. From here on it counts as the owner-approved template. Tokens change only with the owner's approval.
3. **Screens**, in this order, only inside the frozen system.

## Screens
1. **Login**: username, password, error state, forced password change.
2. **App shell**: sidebar from menu data; at the top a **context switcher** (group > business > branch) that is hidden for single-branch users; a bottom bar on phones.
3. **Dashboard**: one page with a business/branch filter and period filter; KPI cards, a trend chart, a table. A branch staff view has fewer cards.
4. **User and access list** (admin): table plus create/edit form; role and scope picker.
5. **Product list** with per-branch active toggle and price rule badge.
6. **Blind stock count (phone)**: one item at a time, large numeric keypad, progress, **no system quantity shown**, save draft.
7. **Review queue**: items waiting for review (count differences, reversals, large discounts), each with reason, who, when, and approve/reject.

## Deliverable
Components under `src/ui/`, each with typed props and a preview with mock data. List every prop each screen needs in `docs/ui-contract.md`; the coding agent wires data to it.
