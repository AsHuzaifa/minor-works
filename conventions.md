# Conventions

Working notes for this repository. Read this before changing anything here.
It exists so the next session does not have to rediscover decisions that were
already made, or re-break things that were already fixed.

---

## 1. Hard rules

These are not preferences. Breaking one is a defect.

1. **No em dashes** (U+2014). Not in copy, not in comments, not in the README.
   Use a colon, a comma, a full stop, or a slash. Verify with either command
   below, which must return nothing. Both spell the character as an escape, so
   that this file does not itself contain one and trip its own check:

   ```bash
   rg -n '\x{2014}' .                     # ripgrep, works as is
   grep -rn $'\xe2\x80\x94' .             # grep, by UTF-8 bytes, always works
   LC_ALL=C.UTF-8 grep -rnP '\x{2014}' .  # grep with PCRE, needs the locale set
   ```

   All three are verified to return nothing on a clean tree. Plain
   `grep -rnP '\x{2014}'` without the locale fails with "character value in
   \x{} is too large", which is a broken check, not a clean result.
2. **No build step.** Plain HTML, CSS and ES modules. No bundler, no framework,
   no transpiler. If a change needs one, the change is wrong for this project.
3. **No image assets.** Every visual is drawn: `<canvas>` on the main site,
   inline SVG in the charts, CSS gradients for materials. `favicon.svg` is the
   only exception and it is hand written markup, not an exported picture.
4. **All content lives in `assets/js/data.js`.** Copy does not get typed into a
   template. If you are editing prose inside an HTML file, you are in the wrong
   file, unless it is the dashboard, which is deliberately self contained.
5. **Serve over `http://`, never `file://`.** The pages use ES modules.

---

## 2. Adding a project

Append one object to `projects` in [`assets/js/data.js`](assets/js/data.js).
Nothing else needs touching: the index card and the detail page at
`project.html?id=<slug>` both fall out of it.

```js
{
  slug:   'kebab-case-url-id',   // becomes the URL, never change it once shared
  title:  'Project Name',
  year:   '2026',
  status: 'shipped',             // shipped | archived | ongoing | shelved
  art:    'dither',              // dither | lattice | halftone | glyphs
  seed:   42,                    // any integer, rerolls the artwork
  blurb:  'One or two sentences for the card.',
  tags:   ['ESP32', 'MQTT'],     // shown on the card
  stack:  ['ESP32', 'MicroPython'],
  repo:   '',                    // empty renders as "not published"
  specs:  { 'Sample rate': '1 Hz' },
  sections: [
    { h: 'Overview', p: 'Body copy.' },
    // a section may carry exactly one link, rendered as a button beneath it:
    { h: 'The console', p: 'Copy.', a: { href: 'dashboard/x.html', label: 'Open it' } },
  ],
}
```

Checklist for a new entry:

- [ ] `slug` is unique and URL safe.
- [ ] `art` is one of the four generators, `seed` differs from its neighbours.
- [ ] Every claim in `specs` agrees with every claim in `sections`. This has
      bitten us: a spec once said `1 Hz` while the prose on the same page
      explained the sensor's mandatory two second floor.
- [ ] Prose with an apostrophe uses a **double quoted** JS string. The file is
      otherwise single quoted. Do not reach for `’`, the rest of the file
      uses a straight `'`.
- [ ] No em dashes.
- [ ] Ordering in the array is the ordering on the page, and drives prev/next.

---

## 3. The two visual systems

They are deliberately different and must not be blended.

### The main site: black, wireframe, typographic

Briefed from <https://meinhardtaxer.com>. Black ground, one paper ink, one
orange accent. Type does the talking. Tokens live at the top of
[`assets/css/style.css`](assets/css/style.css):

| token | value | role |
|---|---|---|
| `--ink` | `#000000` | ground |
| `--paper` | `#EDEBE6` | primary ink |
| `--dim` | `#75736E` | secondary ink |
| `--sig` | `#FF5A1F` | the only accent, used sparingly |

Fonts: Space Grotesk (display), JetBrains Mono (everything else).
The beacon in the header is the site's one toggle. It mutes the wireframe grid,
persists to `localStorage` under `ashuzaifa.sig`, and is restored **before first
paint** by an inline script in each `<head>`. Keep that script in sync with
`preflightSig()` in `ui.js` if the key ever changes.

### The dashboard: light skeuomorphic, Mulled Wine and Matcha

[`dashboard/`](dashboard/) is its own world: its own stylesheet, script and type,
sharing nothing with the site chrome. The metaphor is a registrar's apparatus.

Rules that keep it from turning into kitsch:

- **A material appears only where its metaphor is real.** Screws on the chassis
  and nowhere else. Perforations on the tape and nowhere else. Stamps on paper
  and nowhere else. Put a bevel on everything and it stops reading as anything.
- **Depth comes from three shared recipes**, `--raise`, `--sink` and `--press`.
  Do not invent a fourth shadow for one component. Things that get pressed
  travel down. Things that are recessed stay recessed.
- **Screens are dark, panels are light.** The viewfinder is the only dark
  surface on the page, because that is what a screen behind glass looks like.
- Fonts: Archivo (engraved labels), Newsreader (prose), IBM Plex Mono (numbers).

---

## 4. Color, and why it is computed rather than chosen

The brand pair is **Mulled Wine `#670627`** and **Matcha `#BAD797`**. Neither is
used raw as a chart mark, and the reason is measured, not felt:

- `#670627` is L 0.333 in OKLCH, below the light mark band, and cannot clear 3:1
  on a dark surface at all. It is a *surface* colour. On paper it is 12:1 and
  carries every heading.
- `#BAD797` is L 0.842 with chroma 0.091, above the band and under the 0.10
  chroma floor. It is 1.5:1 on paper, so it never carries meaning: it is the
  live lamp, the gauge fill, the felt.

Marks are stepped from those same two hues and validated on the surface they
actually render on:

| role | hex | on `#FBF7EF` |
|---|---|---|
| genuine match / present | `#789949` | 3.1:1 |
| impostor / absent | `#A3003D` | 7.5:1 |

Worst adjacent CVD delta E 17.7 (deutan), normal vision 31.4.
The enrolment pips are a four step ordinal matcha ramp.

**If you change any chart colour, run the validator.** Do not eyeball it:

```
node <dataviz-skill>/scripts/validate_palette.js "#789949,#a3003d" --mode light --surface "#FBF7EF"
node <dataviz-skill>/scripts/validate_palette.js "#90b261,#789949,#618130,#4a6914" --ordinal --mode light --surface "#FBF7EF"
```

Chart chrome and mark hexes are written into the SVG by `attendance.js`, not
held in CSS custom properties, so each value has exactly one home. Firefox has
historically not supported `var()` in SVG presentation attributes, which is why
they are not referenced that way.

---

## 5. Voice

The copy is plain, specific, and admits what did not work. It is written the way
an engineer explains a build to another engineer at the bench.

- Say the real number. "2 A burst at 3.4 to 4.4 V", not "high current draw".
- Name the tradeoff and who pays for it, rather than claiming a win.
- Never invent history. A section once described a brownout disaster that never
  happened, and had to be rewritten as a design risk instead. If the record is
  not known, say the reconstruction is a reconstruction.
- Plain language sections written by Huzaifa are his words. Do not smooth them,
  and do not repeat their content in the surrounding prose, which has happened.

---

## 6. Verifying work without a browser

There is no browser in this environment, so **never claim a page renders**.
Say what was actually checked. The working method:

```bash
# syntax, on a copy so the .js extension does not confuse node
cp assets/js/data.js /tmp/d.mjs && node --check /tmp/d.mjs

# a real headless run: jsdom + a canvas stub, drives clicks and counts DOM
cd /tmp/viz && node smoke.mjs      # boot, 400 frames, filters, sort, exports
cd /tmp/viz && node smoke2.mjs     # threshold extremes, close roll, restart
node audit.mjs                     # orphan classes, ids, custom properties
```

The harnesses stub `getContext`, `matchMedia`, `requestAnimationFrame` and
`performance.now`, then `window.eval` the script as a classic script. The
dashboard has no imports, so this works directly. For the main site the harness
strips `import`/`export` lines and concatenates the modules in dependency order.

Keep the harnesses' selectors in step with the markup. They have gone stale
twice after a redesign and reported false zeroes.

---

## 7. Bugs already fixed, so they are not reintroduced

- **`hash2` signed shift.** `h ^ (h >> 16)` sign extends, so bit 31 cancels and
  the hash could never exceed 0.5. Dither lit 0.6 percent of its cells. The
  shifts must be `>>>` and every step must stay in int32 via `Math.imul`.
- **`cleanUrls` eats the query string.** With `cleanUrls: true`, a request for
  `/project.html?id=x` 301s to `/project` and drops `?id=`, so every project
  page renders its 404 state. Both `serve.json` and `vercel.json` pin it to
  `false`. **Keep the two files in step**; they configure the same routes for
  local dev and for production.
- **Unguarded `localStorage`.** `preflightSig()` runs at module top level on
  both pages. A browser with site data blocked throws on the read alone and
  takes the whole page down. Every touch is wrapped now.
- **`offsetTop` is relative to the offsetParent**, and several wrappers here are
  positioned. Section detection uses `getBoundingClientRect().top + scrollY`.
- **Rebuilding the table at frame rate** fought the pointer, because a row could
  be replaced out from under a hover. Cheap readouts run at tick rate, anything
  that rebuilds a subtree runs at 2.5 Hz.
- **A disabled button never re-enables itself.** "Close roll" starts disabled and
  only earns its way in once a frame exists, so its state is refreshed on the
  render path, not only on the run click.

---

## 8. Local dev and deploy

```bash
npm run dev        # http://localhost:5173
```

If the port is held by a zombie after a kill, the child node process usually
survives the wrapper:

```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Deployment is Vercel, static, no build command and no output directory. The
framework preset is "Other". `vercel.json` carries the route rules and security
headers. `404.html` at the root is picked up automatically.

Because routing is client side, a shared `project.html?id=x` link previews with
the generic Open Graph title in `project.html`, not the project's own. Fixing
that properly would mean generating one HTML file per project, which would mean
a build step, which rule 2 forbids. It is a known and accepted tradeoff.
