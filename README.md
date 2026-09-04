# Minor Works / ashuzaifa

An index of the small builds: weekend circuits, one-file scripts, sensors taped
to a breadboard. Things too little for their own repository.

The larger work lives in the main portfolio.

## Run it

```
npm run dev
```

Serves on <http://localhost:5173>. There is no build step. Plain HTML, CSS, and
ES modules. Any static server works (`python -m http.server`, VS Code Live
Server, etc). It must be served over `http://`, not opened as a `file://` path,
because the JS uses ES modules.

## Conventions

[`conventions.md`](conventions.md) is the working reference: the hard rules, the
two visual systems, how colour is validated rather than chosen, how to verify a
change without a browser, and the list of bugs already fixed so they do not come
back. Read it before changing anything here.

## Adding a project

Everything lives in [`assets/js/data.js`](assets/js/data.js). Append an object to
`projects` and it appears in the index grid and gets its own page at
`project.html?id=<slug>`. No other file needs touching.

```js
{
  slug:   'kebab-case-url-id',
  title:  'Project Name',
  year:   '2026',
  status: 'shipped',           // shipped | archived | ongoing | shelved
  art:    'dither',            // dither | lattice | halftone | glyphs
  seed:   42,                  // any integer, changes the artwork
  blurb:  'One or two sentences for the card.',
  tags:   ['ESP32', 'MQTT'],
  stack:  ['ESP32', 'MicroPython'],
  repo:   '',                  // leave empty for "not published"
  specs:  { 'Sample rate': '1 Hz' },
  sections: [ { h: 'Overview', p: 'Body copy.' } ],
}
```

## Artwork

There are no image assets. Every visual is drawn on `<canvas>` from a seeded
generator in [`assets/js/art.js`](assets/js/art.js):

| generator  | look                                            |
| ---------- | ----------------------------------------------- |
| `lattice`  | projected 3D wireframe with lit floating panels |
| `dither`   | Bayer-ordered dithered cloud field              |
| `halftone` | stipple field, dot radius carries the value     |
| `glyphs`   | falling monospace columns                       |

Same `seed` → same image, every time. Change the seed to reroll.

Canvases only animate while on screen, and hold still entirely under
`prefers-reduced-motion`.

## Layout

```
index.html          hero / about / posters / index grid / contact
project.html        detail template, reads ?id=<slug>
dashboard/          the attendance console (see below)
assets/css/         one stylesheet
assets/js/data.js   all content
assets/js/art.js    canvas generators
assets/js/ui.js     header, beacon, reveal, scroll readout
assets/js/main.js   index page
assets/js/project.js detail page
```

A section in `sections` may carry one link, which renders as a button under the
body copy:

```js
{ h: 'The console', p: 'Body copy.', a: { href: 'dashboard/attendance.html', label: 'Open it' } }
```

## The attendance console

`dashboard/attendance.html` is a working rebuild of the page that fronted the
Smart Attendance Register System, whose original HTML did not survive. It is
self contained: its own stylesheet, its own script, no shared chrome, no
dependencies.

The design is light skeuomorphic, and the metaphor is a registrar's apparatus:
an enamelled chassis in Mulled Wine livery holding a viewfinder behind glass, a
knurled threshold slider running in a milled channel, a perforated decision
tape, a ruled ledger that gets rubber stamped, and a drawer of enrolment index
cards. Each material appears only where its metaphor is real. Screws sit on the
chassis and nowhere else, perforations on the tape and nowhere else, stamps on
paper and nowhere else. Depth comes from three shared recipes, `--raise`,
`--sink` and `--press`, rather than a bevel invented per component.

The matcher runs in the browser. Face crops are simulated, and each match
attempt draws a cosine distance from one of two normal distributions, genuine
at 0.36 and impostor at 0.74, both with a standard deviation of 0.085. Anything
at or under the threshold is accepted. Because the simulation knows the ground
truth it can count false accepts and false rejects live, which is the whole
point of the threshold slider.

Everything is seeded from 512, the project's own art seed, so the roster, the
term history and the distributions are identical on every load. Session state
lives in `localStorage` under `ashuzaifa.attendance.v2`.

The brand hexes do real work on paper: `#670627` has 12:1 on the ledger and
carries every heading, while `#BAD797` is 1.5:1 and so never carries meaning, only
felt lining, label tape and the live lamp. Chart marks are stepped from the same
two hues and validated on the ledger surface: `#789949` for a genuine match,
`#A3003D` for an impostor, worst adjacent CVD delta E 17.7. Chart chrome and mark
colors live in `attendance.js` rather than in CSS custom properties, so each
value has one home. The reasoning is written at the top of `attendance.css`.

## The beacon

The signal glyph in the header (top right) is the site's one toggle: it mutes the
wireframe grid overlay. State is remembered in `localStorage` under
`ashuzaifa.sig` and restored before first paint.
