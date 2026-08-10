# UX Audit — Status

From the full UI/UX audit of the app, dated 2026-08-07.

**Items #1–#23 closed earlier. #24–#32 and #34–#40 closed on 2026-08-08.** The only
numbered item still open is **#33**, deferred by decision.

The original wording of #24–#40 is in git history (this file before 2026-08-08) rather than
repeated here. What follows is what was actually done, where it diverged from what the item
asked for, and what's left.

---

## Still open

### #33 — The brand color changes identity between themes
Burnt orange `#B84F1E` in light, blue `#60A5FA` in dark — a different hue, not a lightness
adjustment, so the app reads as two products. Deferred deliberately: it needs a visual pass
over both themes rather than a blind change. `PlanCompleteOverlay`'s hardcoded gold
`STAR_COLOR` exists to dodge this and should go once the palette is coherent.

- `src/theme/colors.ts`
- Effort: **S** to change, plus a visual pass over both themes

### `accent` on `accentMuted` fails AA — 3.90:1
Found while measuring for #29. It's the pairing behind the example chips on New Plan, the
session banner on Login, and Avatar initials.

Lightening `accentMuted` can't fix it: `accent` needs it at `#FBF1E6` to clear 4.5:1, and at
that point the token is 1.06:1 against `background` — no visible fill at all. The fix is
darkening `accent` itself (`#A8461A` gives 4.58:1 on `accentMuted` and 5.60:1 on
`background`), which is a brand-colour decision, so it belongs with #33. Recorded as a
comment on the token.

### No `maxFontSizeMultiplier` policy
#31 fixed what was actually clipping — fixed heights and literal `lineHeight`s — but
nothing caps how far text can scale. Doing it properly means a shared `Text` wrapper the
whole app imports, which is a larger architectural call than the rest of #31.

### Off-scale spacing values
#35 snapped every value matching the spacing scale exactly. The off-scale ones (6, 10, 14,
18, 22, 28) were left literal — snapping them shifts layout, and that wants a visual check.

### VoiceOver verification
#30 was done as a static sweep: every control now has a role, a label, and a state where it
has one. The original item's advice to do it "with VoiceOver actually turned on" still
stands as a verification step.

### ~~The legal documents don't exist yet~~ — closed 2026-08-09
Both are now served by the backend at the paths `src/lib/legal.ts` already pointed at, as
Blade views sharing a `legal-layout` component, with the entity, contact address,
jurisdiction and last-updated date in `config/legal.php`. `LegalPagesTest` covers
reachability, the cross-links, and the presence of the professional-advice disclaimer.

**They are drafts written against what the code actually does, not reviewed by a lawyer.**
Get them reviewed before submission.

---

## Closed 2026-08-08

### #40 — No account deletion (was blocking release)
`DeleteAccountModal`: password-confirmed, maps the backend's 422 onto the password field.
Reached from a "Danger zone" section in Settings, kept visually separate from Log Out so
the two destructive rows can't be mistaken for each other.

On success the query cache is cleared and the session dropped through a new
`clearSession()` on AuthContext — `signOut()` would have POSTed to `/logout` with a token
the server had already revoked, and the persisted query cache would otherwise still hold
the deleted user's plans for whoever signs in next on the device.

Terms and privacy links now appear under the Sign Up button. See "Still open" — the
documents themselves don't exist.

- `src/components/DeleteAccountModal.tsx`, `src/screens/SettingsScreen.tsx`,
  `src/screens/LoginScreen.tsx`, `src/context/AuthContext.tsx`, `src/api/auth.ts`,
  `src/lib/legal.ts`

### #24 — The "+" on a featured plan card
Took option 1: the "+" is gone. `PlanCard` is now a single button that opens the preview,
and the preview's labelled "Add to My Plans" is the only way to add a plan.

Related Plans on Plan Detail had been using the card as an add-only affordance, so it
gained an `onPress` that crosses to the Explore stack's preview — dropping the "+" would
otherwise have left those cards inert. `useCopyPlan` is now used only by the two preview
screens.

### #25 — Native alerts used for field validation
`TextField` gained `error` and `hint` props: red border, message beneath, folded into the
field's accessibility label. Every validation alert on New Plan, Login, Account, Reset
Password and Forgot Password is now inline. Laravel's 422 `errors` object is mapped
per-field, so "The email has already been taken." lands under the email box instead of in
an alert covering the form it's talking about.

**Diverged from the item:** submit is *not* disabled until valid. A disabled button on an
untouched form gives the user no reason for being disabled. Pressing validates, shows the
inline errors, and focuses the first bad field — same protection, no dead control.

### #26 — Password-manager and keyboard basics
`textContentType`/`autoComplete` on every auth field — `username` + `current-password` when
logging in, `emailAddress` + `new-password` when signing up, the latter being what triggers
the OS strong-password generator. `returnKeyType`/`onSubmitEditing` chain the fields, with
`submitBehavior="submit"` so the keyboard doesn't drop between them. The show/hide toggle
lives in `TextField` itself, so every password box in the app gets one rather than each
screen remembering to ask. The 8+ character rule is now a persistent hint instead of a
post-hoc error.

### #27 — No default selected in Plan Duration
"1 month" is preselected. Checked `GeneratePlanSteps::DEFAULT_TARGET_DAYS` (30) first: this
makes the existing implicit default visible without changing what gets generated.

### #28 — Touch targets below 44pt
Chips on New Plan, Refine and the feedback overlay use `minHeight: 44` with a centred
label, which holds the floor without the chips growing when text wraps. The feedback stars
were 42pt wide (30pt glyph + 6pt horizontal slop); slop is now 7pt all round.

### #29 — Contrast on `textPlaceholder`
Measured every text token against all three surfaces in both themes, and the audit had
understated this:

| token | was | now |
|---|---|---|
| light `textPlaceholder` | `#96806F`, 3.54:1 | `#7A6355`, 5.32:1 |
| dark `textPlaceholder` | `#6B7280`, 3.97:1 | `#8A929E`, 6.11:1 |

The dark-theme failure was the same defect, and the original audit only caught the light
one. Both replacements also clear 4.5:1 on `surface` and `surfaceMuted`.

Two further findings: light `textMuted` on `surfaceMuted` is 4.43:1, a marginal fail whose
one real occurrence was the offline banner — fixed in #34 by moving that text to
`textSecondary` (7.9:1) rather than by moving the token. And `accent` on `accentMuted` is
3.90:1, which is in "Still open" because fixing it means touching the brand colour.

Ratios are now recorded as comments in `colors.ts` so the next change can see them.

### #30 — Missing roles and labels
Option chips are `radio` inside `radiogroup`s with `accessibilityState.selected`. The
multi-select tag chips on Refine and the feedback overlay are `checkbox` with `checked`.
Plan rows, swipe actions, resource links, the video close button and the auth screens' text
buttons all gained roles and labels.

`Button` — the app's primary control — had no role at all, and announced nothing mid-submit
because the label is replaced by a spinner; it now carries its label plus `busy`. The star
row announces the current rating as a whole rather than making the user step through five
stars to find out what's selected.

The progress bar already had `accessibilityRole` and `accessibilityValue`, contrary to the
item. It gained optional `label`/`valueText` so it says "3 of 6 steps complete" rather than
"50 percent" of nothing in particular.

### #31 — Fixed font sizes and fixed heights
Done together with #35, since both are "sizes come from one place".

Every literal `lineHeight` now derives from the same token as its `fontSize` — a fixed line
box is what actually crops scaled text. The header (68pt) and the FAB (52pt) became
`minHeight`, and the header title takes two lines instead of one. Remaining fixed heights
are graphics (checkboxes, emoji tiles, progress tracks), where fixed is correct.

See "Still open" for the missing scaling cap.

### #32 — Confetti reduce-motion
`AccessibilityInfo.isReduceMotionEnabled()`, plus a `reduceMotionChanged` subscription
since the setting can be toggled while the app runs. The state starts `true` so the first
frame can't fire 40 falling pieces before the async check resolves. Reduce Motion also
snaps the backdrop in rather than crossfading; the 🎉 and the card carry the celebration.

### #34 — Offline messaging styled three ways
One `OfflineNotice` component in the design system, used by all four screens. The inset
card is the surviving look, with a `fullWidth` variant that squares the corners for the one
place it sits flush under a header. Text moved to `textSecondary` — both of the colours the
old versions used failed AA on `surfaceMuted` (see #29).

### #35 — Design system half-adopted
~90 literal `fontSize`s across 21 files now come from `typography`, and `borderRadius` and
spacing likewise.

Off-scale font sizes were mapped to the nearest step, which shifts a few by 0.5–1pt
(17→16, 19→18, 11.5→12) — that's the consolidation the scale was designed for. Emoji, logo
and avatar glyph sizes were left literal: they're graphics, not the text scale. Decorative
radii (2, 3, 4 on confetti and progress caps) likewise.

See "Still open" for the off-scale spacing values.

### #36 — Empty states have no action
`EmptyState` takes optional `actionLabel`/`onAction`. All Plans now has a title, an
explanation and a "Create a plan" button instead of one bare sentence and a floating FAB to
notice. The two "isn't available" dead ends also got a way out — Shared Plan points at the
feed rather than at a back button, since a dead share link is often the first screen the app
opens on and there may be no history behind it.

### #37 — No pull-to-refresh on Plan Detail
`refreshing`/`onRefresh` on the step `FlatList`.

### #38 — No haptics on step completion
`expo-haptics` added. Light impact on check, softer on uncheck (a correction, not an
accomplishment), success notification when the last step lands. Fired from `onMutate` so
the tap coincides with the optimistic checkmark rather than a round-trip later. Every call
is failure-swallowed — feedback should never turn checking off a step into an error.

### #39 — Long titles truncate in the header
Used the item's own suggestion: Step Detail's header is "Step 3 of 6" instead of repeating
the H1 directly beneath it. The header title also wraps to two lines now, which the new
`minHeight` accommodates.

---

## Follow-ups discovered during implementation

These weren't in the original audit. They came out of doing #1–#23.

### Refinement still destroys progress
#2 added an accurate warning, but the underlying behavior is unchanged:
`GeneratePlanSteps` deletes every step on refinement, so `completed_at` is lost. The fuller
fix is to match new steps against old ones and carry completion across where they
correspond. Note the backend already does a partial version — a *failed* refinement leaves
the plan untouched, so only successful ones reset progress.

- `backend/app/Jobs/GeneratePlanSteps.php`
- Effort: **M**, and needs a matching heuristic decided first

### `SLOW_AFTER_MS` is a guess
#3's 45-second "taking longer than usual" threshold was calibrated off the staged animation
(~12.8s), not measured generation times. Tune it to the real p95 once there's data.

- `src/screens/GeneratingScreen.tsx`
- Effort: **XS**

### Retry is unbounded
The `POST /plans/{plan}/retry` endpoint added in #4 deliberately doesn't consume the
generation allowance, since the user already paid for the failed attempt. It also has no cap
— a plan that keeps failing can be retried indefinitely, each attempt costing a real LLM
call. Failures should be rare and a user can't easily force them, so this is low risk, but
it's unguarded by design and worth a deliberate decision.

- `backend/app/Http/Controllers/Api/PlanController.php::retry`
- Effort: **XS** if you want a cap (needs a counter column)

### Dead code: the copy-limit modal
Copying is unlimited on every tier (`PlanController::copy`), so `useCopyPlan`'s 429 →
`PlanLimitModal` branch is unreachable. Still unreachable after #24, which narrowed
`useCopyPlan` to the two preview screens but didn't touch the 429 branch.

- `src/hooks/useCopyPlan.ts`
- Effort: **XS**

### `FeaturedPlanScreen` and `SharedPlanScreen` overlap
Both are read-only plan previews with an add button. They differ in data source (plan id vs.
share token) and copy endpoint, so they were kept separate rather than merged behind a flag.
If a third preview variant ever appears, extract a shared presentational component.

- Effort: **S**

### Is the manual "done" flag earning its keep?
#22 made `completed_at` and "all steps checked" visually distinguishable, but the deeper
question stands: a manual done-flag independent of step progress is a second, invisible axis
of state. The alternative is making it an explicit **Archive** ("put this away"), which is
orthogonal to progress rather than competing with it. Clearer, but it's a column rename plus
migration and API change — a product decision, not a refactor.

- Effort: **M**, mostly migration and naming

### Unidentified dev warning
The simulator shows a persistent **"Open debugger to view warnings"** banner. It predates
the Stage B navigation work and couldn't be read from the simulator's `os_log` — RN warnings
go to the JS console, so it's only visible in the Metro terminal or React DevTools. Dev-only
(won't appear in a release build), but worth a look.

---

## Corrections to the original audit

Recorded so the original list isn't trusted where it was wrong:

- **#5** was written against `max_plans`, which had already been dropped. Copying is
  unlimited; the only real limit is monthly AI generations.
- **#12** was framed as "spending a slot." There are no slots — the actual problem was
  deciding to add a plan without seeing its contents.
- **#4** understated the cost. The real issue wasn't retyping the form, it was that the
  generation allowance is charged on dispatch and never refunded, so starting over billed
  the user twice for one plan.
- **#21** understated the hazard. Reset wasn't merely "adjacent" to Complete — it rendered
  *first*, meaning the destructive action was the one a short swipe uncovered.
- **#7** dissolved rather than being fixed: the dead `activeTintColor` was a symptom of
  hand-rolled `DrawerItem`s, and tabs track the active route natively.
- **#29** understated the problem twice over: the identical contrast failure existed in the
  dark theme, which the item didn't mention, and `accent` on `accentMuted` fails too.
- **#30** listed the progress bar as having no `accessibilityValue`; it already had one.
  `Button` having no role at all was the more serious gap, and wasn't listed.
- **#31 and #35** are numbered in the wrong order — #35 is a prerequisite for #31, as #35's
  own text says. They were done as one pass, #35 first.
