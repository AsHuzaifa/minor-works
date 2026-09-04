# Minor Works

A small site for the builds that were too little to justify a repository of
their own, but important in their own way as foundational projects which led the way to bigger ones. 
By Mohammed Huzaifa ([ashuzaifa](https://github.com/ashuzaifa)).

## What is in it

| | | |
|---|---|---|
| **Temperature & Humidity Monitor** | 2023 | A DHT sensor and a display on an Arduino. The first one, and the one that taught the rest. |
| **Ocean Pollution Detection Sensor** | 2024 | A waterproof array lowered into water, returning pH and chemical readings live instead of weeks after a lab visit. |
| **Smart Attendance Register System** | 2024 | Face recognition attendance, no hardware beyond a webcam. Built at Smart India Hackathon, top 20 of roughly 150 teams. |
| **PIR & GSM Security Alarm** | 2024 | A passive infrared sensor and a SIM module. It texts your phone when something moves. No WiFi, no app, no account. |

Each one has its own page with the specs, how it works, and what it cost to
learn.

## The attendance console

The Smart Attendance page carries a working rebuild of the original dashboard,
whose HTML did not survive the hackathon laptop:
[`dashboard/attendance.html`](dashboard/attendance.html).

The matcher runs in the browser against a simulated room. Drag the threshold and
watch the register break in both directions: tight, and students who sat through
the whole hour get marked absent; loose, and strangers walk in under someone
else's roll number. That single number was the real problem in the real build,
so it is the centrepiece here.

## Run it

```
npm run dev
```

Serves on <http://localhost:5173>. There is no build step. Any static server
works, as long as it is served over `http://` rather than opened as a `file://`
path, because the pages use ES modules.

## Under the hood

Plain HTML, CSS and ES modules. No framework, no bundler, no dependencies.
There are no image assets either: every visual on the site is drawn on
`<canvas>` from a seeded generator, and every chart is inline SVG.

All content lives in one file, [`assets/js/data.js`](assets/js/data.js). Adding
an object to `projects` gives you a card on the index and a page at
`project.html?id=<slug>`, with nothing else to touch.

[`conventions.md`](conventions.md) is the working reference: the rules, the two
deliberately separate design systems, how colour here is computed rather than
picked, how to verify a change without a browser, and the bugs already fixed so
they do not come back. Read that one before changing anything.
