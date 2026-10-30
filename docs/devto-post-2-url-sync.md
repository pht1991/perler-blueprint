# One link is all it takes: syncing bead patterns between phone and PC without a backend

<!-- dev.to tags: javascript, webdev, tutorial, sideproject -->
<!-- suggested cover: a screenshot of the mini program link copy → PC opened pattern, or the printable grid sheet -->

A couple of weeks ago I wrote about [my Perler bead pattern generator](https://dev.to/pht1991/i-built-a-perler-bead-pattern-generator-that-exports-your-work-as-a-single-html-file-1nd4) — a 100% client-side tool where the whole app plus your work exports as one self-contained HTML file.

That post ended with a problem I hadn't solved: **people don't craft at one device.**

They browse reference photos on the phone on the couch, but they build the actual board and print the pattern at a desk. My tool was web-only, and my users (mostly in China) increasingly asked for a WeChat mini program version. Building it was the easy part — the hard part was that once your pattern lived on the phone, it was stuck there.

## The constraints make the design

The web tool has a hard rule I'm not willing to break: **no accounts, no backend, nothing ever leaves the browser.** Free tool + hobby crafters + uploaded family photos = cloud storage is a non-starter, both for trust and for my hosting budget.

So how do you move a pattern from a WeChat mini program to a PC browser with zero infrastructure?

- ❌ Accounts + cloud sync — violates the whole premise
- ❌ File export → send file → import — clumsy on mobile, and WeChat file handling is its own adventure
- ✅ **A URL. The pattern IS the link.**

The mini program copies a link to the clipboard; the user sends it to themselves (WeChat's File Transfer Assistant is made for this), opens it on the PC, and the pattern is just… there. Everyone already knows how to share a link.

## Fitting a 4000-cell pattern into a URL

The format is versioned, dot-separated, and lives entirely in the URL **fragment**:

```
https://perler.phtbyte.com/#p=1.49.69.mard.H01-H02-H08-….zqn3zj01…
        └─┬─┘ ─┬─────────────────────────────┘
       version  payload
```

Why the fragment (`#`) and not a query string? Two reasons:

1. **Fragments are never sent to the server.** The pattern data exists only in the browser. No logging, no GDPR-adjacent questions, and my static host (GitHub Pages) doesn't need to care.
2. **No practical length limit.** Query strings start breaking things (proxies, analytics, some CDNs) around 2KB. Fragments just work — the browser never transmits them.

The payload itself:

| Field | Meaning |
|---|---|
| `1` | Format version — so I can change the scheme later without breaking old links |
| `49.69` | Board width × height |
| `mard` | Palette ID (Perler / MARD / ARTKAL / YANT…) |
| `H01-H02-H08-…` | The **code table**: every bead color used, in order |
| `zqn3zj01…` | Run-length encoded grid |

### The code table — or, the bug I designed my way out of

My first instinct was to encode each cell as the palette *index*: one character in base36 covers values 0–35. Then I actually counted the MARD palette: **221 colors.** Base36 dies at 36. A two-character index would have worked, but it bloats every single run.

The better move: put the *used colors* in a table up front and encode cells as **table positions**. A real pattern uses maybe 10–30 colors out of 221, so table positions fit in one base36 character with room to spare (the table caps at 34 — index 35 is reserved). Bonus: cell data now references *semantic* color codes, not positional indices, so palette data can evolve without invalidating old links.

### The RLE run: 3 characters per run

Each run is exactly 3 chars: 1 char = table index (`z` = empty cell), 2 chars = run length in base36 (max `zz` = 1295).

```js
// encode: row-major, runs of same color (or empty)
rle += ch + B36[Math.floor(run / 36)] + B36[run % 36];
```

A 49×69 board (3,381 cells) with ~15 colors lands around **500–800 characters of URL**. Short enough to survive a clipboard round-trip through WeChat without anyone noticing.

## Trust nothing: decoding defensively

A link can be mangled by any layer between the phone and the PC — truncated copy, URL shortener, autocorrect, a sibling editing the text for fun. The decoder validates *everything* and rejects instead of rendering something half-broken:

```ts
const parts = raw.split('.');
if (parts.length < 6 || parts[0] !== '1') return null;      // version
const pal = PALETTE_BY_ID[paletteId];
if (!w || !h || !pal || w * h > 40000) return null;         // sane geometry
for (const c of table)
  if (!pal.colors.some((cc) => cc.code === c)) return null; // real color code?
if (rle.length % 3 !== 0) return null;                      // well-formed runs
if (codes.length !== w * h) return null;                    // exact cell count
```

Every check is cheap; the alternative is a corrupted grid that a crafter discovers halfway through beading. A bad link gets a polite "invalid link" toast and the app stays untouched. Same philosophy as the single-file export: **fail closed.**

## The payoff at the desk: a printable grid

Importing was half the feature. The other half is what you do once the pattern is on the big screen: **print it.** So I added a grid export — a proper work sheet, not a screenshot:

- 24px cells (halving automatically, down to the canvas cap of 4096px, so a 200-column monster still exports)
- **Bead codes printed in every cell**, with the text color chosen per-cell by background luminance so it stays readable on both white and black beads
- Gridlines at 1px opacity 0.16 — visible on paper, invisible in the colors
- **Done-marks**: teal checkmarks on colors you've finished, matching the in-app tracker — print a fresh sheet and your progress carries over
- A header with title, size, and palette name, because worksheets get stacked and shuffled

```ts
// text stays readable on any bead color
const lum = 0.299 * r + 0.587 * g + 0.114 * b;
x.fillStyle = lum > 150 ? '#333' : '#fff';
x.fillText(code, gx + cell / 2, gy + cell * 0.54);
```

The whole workflow now fits in one sentence: *photo on the phone → pattern on the couch → link on the desk → print → iron some beads.*

## What I learned (again)

The humble URL is still the best state-transfer mechanism ever shipped. No SDK, no auth flow, no rate limits, works across apps that were never designed to talk to each other — a WeChat mini program and a static web page share data through something every chat app already knows how to carry.

If your app's state is small and user-owned, try making it a link before you build a sync service.

---

**Try it:** [perler.phtbyte.com](https://perler.phtbyte.com/) (works offline once loaded) · **Source:** [github.com/pht1991/perler-blueprint](https://github.com/pht1991/perler-blueprint) (MIT) · On WeChat, search mini program **我要拼豆图纸** — patterns sync between the two via the link format above.
