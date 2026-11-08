# Design: AI teammate on the team board

The live design is the Claude Design canvas: https://claude.ai/artifact/Wh1XCBD4Bdw8Gr7kbAfq4t

`concept/` is a snapshot of its source, taken 2026-11-08 (canvas version `1794128165-09b4`). It is the first UI version the app builds toward.

## Artboards

| File | What it shows | Builds into |
| --- | --- | --- |
| `concept/Main.dc.html` | The board in the centre with PO, UX, FE, BE and the AI teammate around it. Lines show who works on which card, who asks whom, who reports back. Cycle log under the board. | `apps/web` board view |
| `concept/Lifecycle.dc.html` | One card from pick to done: work in the owner's mode, three checks, done or Needs input, answer, back to In progress. Every step is logged. | Card status rules in `apps/api` |
| `concept/Card.dc.html` | Card #151 waiting on the backend developer: open question, protocol (opens, asks, writes, decides), checks, card log, linked cards. | Card detail and answer flow |
| `concept/Profile.dc.html` | A frontend developer's chain of steps with a mode per step, when to bring them in, and what the AI may pick on its own. | Teammate profile |

`concept/canvas.json` holds the canvas layout. The card contents are invented examples.

## How to use the snapshot

- The `.dc.html` files render only inside Claude Design; they need its runtime. Read them as a reference for structure, copy, colors and spacing. Do not copy their markup into the app.
- Need a picture? Export the artboard from the canvas (Share › Export) and save it here, next to its source.
- When the canvas changes, take a new snapshot before building from the changed artboard, and update the date and version above.

## Tokens

Colors carry the same meanings as in the Team Process Map.

| Token | Value | Meaning |
| --- | --- | --- |
| `bg` | `#f3f5f8` | Page background |
| `surface` | `#ffffff` | Cards and panels |
| `fg` | `#161b26` | Text; the AI teammate's fill |
| `muted` | `#5b6475` | Secondary text, neutral lines |
| `line` | `#d9dee7` | Borders |
| `line-soft` | `#e8ebf1` | Dividers, avatar fill |
| `manual` / `manual-bg` | `#a8480a` / `#fbeee3` | I do it |
| `assist` / `assist-bg` | `#0b6b63` / `#dff3f0` | AI assists, I drive; also "reports back" and Done |
| `delegate` / `delegate-bg` | `#3b36b8` / `#e8e7fa` | AI does it, I verify |
| `needs-input` / `needs-input-bg` | `#b3261e` / `#fbe7e5` | Needs input, open questions |

Fonts: Schibsted Grotesk (400, 500, 600, 700) for text, JetBrains Mono (400, 500) for ids, function names, times and labels.

Lines between teammates: solid means works on a card, dashed means needs input, dotted means reports back.
