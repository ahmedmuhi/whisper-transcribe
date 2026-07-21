---
version: alpha
name: Whisper Transcribe
description: Personal-first, browser-only speech transcription on Bring-your-own Azure. Soft Precision interface — calm, layered lavender-blue and deep-navy surfaces, mono working text, italic serif display accents.
colors:
  bg-primary: "#EEF0FB"
  bg-surface: "#FFFFFF"
  bg-inset: "#F5F6FC"
  border-color: "#E0E3F0"
  border-subtle: "#D1D5E8"
  text-primary: "#1E2A3A"
  text-secondary: "#6B7280"
  text-muted: "#9CA3AF"
  accent: "#5B6EF5"
  accent-glow: "rgba(91, 110, 245, 0.15)"
  accent-subtle: "rgba(91, 110, 245, 0.06)"
  recording: "#EF4444"
  recording-glow: "rgba(239, 68, 68, 0.3)"
  status-text: "#5B6478"
  status-error: "#C42B1C"
  status-success: "#0E7A6B"
  mic-hover-bg: "#4A5BD4"
  modal-backdrop: "rgba(30, 42, 58, 0.5)"
typography:
  display:
    fontFamily: Instrument Serif
    fontWeight: 400
  mono:
    fontFamily: Geist Mono
    fontSize: 14px
    lineHeight: 1.6
    fontWeight: 400
rounded:
  sm: 6px
  md: 12px
  lg: 16px
  full: 9999px
---

## Overview

Whisper Transcribe is a personal-first speech transcription application: a
browser-only single page where a User records or selects audio and reads the
transcript, with transcription running on the User's own Azure resource. Its
design language is Soft Precision — a calming, layered interface in a lavender
blue light theme and deep navy dark theme. The release is
interaction-and-experience-led: visual and motion decisions exist to keep
recording, review, and recovery calm and unambiguous.

## Colors

Backgrounds are a three-layer system: `{colors.bg-primary}` is the page,
`{colors.bg-surface}` is a raised card, and `{colors.bg-inset}` is a recessed
well inside a card. Give every new surface exactly one of these three roles
rather than introducing a new neutral. Hairlines use `{colors.border-color}`;
`{colors.border-subtle}` is the stronger step reserved for hovered or lifted
surfaces.

`{colors.accent}` is the only interactive hue. Filled primary actions use it
directly (hover shifts to `{colors.mic-hover-bg}`), hover tints and selected
rows use `{colors.accent-subtle}`, and focus rings and text selection use
`{colors.accent-glow}`. `{colors.recording}` is reserved for active capture and
for the hover state of destructive discard actions; it is never a general
error or emphasis color.

Status text uses only the dedicated accessible tokens: `{colors.status-text}`
for neutral status, `{colors.status-error}` for errors, and
`{colors.status-success}` for success. The raw accent and recording hues fail
contrast for status-size text, and the success hue is deliberately a
desaturated teal in the lavender/navy family rather than a green. Dialog
scrims use `{colors.modal-backdrop}`.

## Themes

The dark theme swaps token values only; components never branch on theme, so
any style written against the tokens above inherits both themes. Every new
color must be added as a light/dark pair. The User may choose light, dark, or
follow-system.

| Token | Dark value |
| --- | --- |
| bg-primary | #0C0F1A |
| bg-surface | #151929 |
| bg-inset | #1C2137 |
| border-color | #252A40 |
| border-subtle | #353B58 |
| text-primary | #E4E7F1 |
| text-secondary | #9CA3C4 |
| text-muted | #6B7294 |
| accent | #7B8FF7 |
| accent-glow | rgba(123, 143, 247, 0.2) |
| accent-subtle | rgba(123, 143, 247, 0.06) |
| recording | #EF4444 |
| recording-glow | rgba(239, 68, 68, 0.35) |
| status-text | #AEB6D6 |
| status-error | #FF8A80 |
| status-success | #5FD2C2 |
| mic-hover-bg | #95A5F9 |
| modal-backdrop | rgba(0, 0, 0, 0.7) |

## Typography

The interface uses exactly two families. `{typography.mono.fontFamily}` is the
working voice: body text, controls, labels, the transcript, and the timer. The
timer additionally uses tabular numerals so time readouts do not jitter.
Utility actions and field labels may use the recurring micro-label treatment —
uppercase mono at a small size with wide tracking.

`{typography.display.fontFamily}` is reserved for named surfaces: the product
wordmark and the titles of cards, dialogs, and menu details. Display type is
always italic at regular weight; it is never used for body text, controls, or
status. Weight above regular is reserved for mono emphasis such as button
labels and the launcher initials.

## Layout

The app is a single centered narrow column of stacked cards under a compact
sticky header; it remains one column at every width. The User menu floats
above the page from the bottom-left as an initials launcher opening panel
surfaces. On wide layouts the menu root and a detail panel sit adjacent; at
narrow widths the detail replaces the root and an explicit Back action
restores it, returning focus to the invoking control. Every button preserves
the minimum touch target enforced in the base stylesheet, regardless of its
visual size.

## Elevation & Depth

Depth has three shadow steps carried by shared tokens: cards rest on the small
step and lift to the medium step on hover; the control island lifts to medium
while recording; the launcher, menu panels, and dialogs float on the large
step. Light-theme shadows are accent-tinted; the dark theme switches to
deeper neutral shadows. A fixed full-viewport noise film (slightly stronger in
dark) textures every surface and must remain click-through. Dialogs sit
behind a blurred scrim using the backdrop token.

## Shapes

The pill is the signature shape: the control island, every button inside it,
and the transcript utility buttons all use `{rounded.full}`. Cards, panels,
and dialogs use `{rounded.lg}`; recessed wells such as the visualizer, the
transcript field, and file rows use `{rounded.md}`; menu rows, form fields,
and the save action use `{rounded.sm}`. At narrow widths cards step down from
`{rounded.lg}` to `{rounded.md}`. Avatars, the launcher, and indicator dots
are full circles.

## Components

### Control island

The recording controls are one reshaping pill: a single surface that morphs
size and radius with recording state while its contents cross-fade. Buttons
inside keep fixed geometry — the island animates around them, never scaling
them. At rest the island sits near-flush on `{colors.bg-inset}`; while
recording it lifts onto `{colors.bg-surface}` with the stronger border and
medium shadow, and the timer folds into its leading edge behind a pulsing
recording dot. The size morph is JavaScript-owned (FLIP); CSS owns only each
state's resting shape and the cross-fade. The steady recording breath pulses
an inset box-shadow ring so the island's clipping cannot crop it.

### Buttons

Each surface has at most one filled accent primary; all sibling actions are
ghosts that tint with `{colors.accent-subtle}` on hover. Discard is the
quietest control, taking `{colors.recording}` treatment only on hover. While
recording, the primary itself turns `{colors.recording}`. Every interactive
element replaces the native outline with the shared accent focus ring.

### Status and dialogs

The status line communicates type only through the status modifier classes
bound to the accessible tokens — never inline colors. Discard confirmation is
proportional: a short microphone recording discards immediately, while a
substantial or Unsent Recording gets one dialog that names what is at stake.

## Do's and Don'ts

- Do render the recording controls from recording-state events; do not style
  individual control buttons imperatively per event.
- Do style exclusively through the shared color, radius, shadow, and
  transition tokens; do not introduce literal colors, radii, or durations in
  component styles.
- Don't animate a button's geometry or hit target; decorative motion is
  limited to box-shadow and opacity.
- Don't color status text with the raw accent or recording hues; use the
  dedicated status tokens.
- Don't ship motion that fails reduced-motion: under `prefers-reduced-motion`
  every animation must land in its correct end state immediately.
- Don't pose a rote "are you sure?"; challenge only in proportion to what is
  at stake and name it.
- Don't start navigation, submission, or discard automatically; network and
  destructive actions require a visible User action.
