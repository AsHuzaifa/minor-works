/* Single source of truth for the whole site.
   Add a project here and it appears in the index grid and gets its own page
   at project.html?id=<slug>. Nothing else needs touching. */

export const site = {
  name: 'AsHuzaifa',
  desc: 'Minor Works',
  tagline: 'Everything too small for its own repository, and too good to lose.',
  year: 2026,
};

export const about = {
  n: '01',
  title: 'What this is',
  body: [
    'A running index of the small builds: the weekend circuits, the one-file scripts, the sensors taped to a breadboard at 2am. All of them taught me something.',
    'The bigger work lives elsewhere. This is the margin, where the notes and the offcuts and the things that quietly worked are kept.',
  ],
};

export const posters = [
  {
    n: '01',
    title: 'SIGNAL',
    art: 'dither',
    seed: 1337,
    line: 'Sensors turn weather into numbers.',
    sub: 'ADC / 12-bit / 0 to 4095',
  },
  {
    n: '02',
    title: 'LATTICE',
    art: 'lattice',
    seed: 4242,
    line: 'A network is just a room you cannot see.',
    sub: 'MQTT / QoS 1 / retained',
  },
  {
    n: '03',
    title: 'NOISE',
    art: 'halftone',
    seed: 909,
    line: 'Every reading arrives dirty. The work is the filter.',
    sub: 'EMA / a = 0.12 / dt = 100ms',
  },
];

/* ---- PROJECTS ------------------------------------------------------------
   slug     url id, lowercase-kebab
   art      thumbnail generator: 'dither' | 'lattice' | 'halftone' | 'glyphs'
   seed     any integer; changes the generated artwork
   status   'shipped' | 'archived' | 'ongoing' | 'shelved'
   sections [{ h, p }] body of the detail page
   specs    key/value table on the detail page
--------------------------------------------------------------------------- */

export const projects = [
  {
    slug: 'temp-humidity-monitor',
    title: 'Temperature & Humidity Monitor',
    year: '2023',
    status: 'archived',
    art: 'dither',
    seed: 21,
    blurb: 'A DHT sensor paired with a display screen, running on Arduino. The project that started everything: basic in scope, formative in practice.',
    tags: ['Arduino', 'DHT22', 'I2C', 'OLED'],
    stack: ['Arduino Uno', 'DHT22', 'SSD1306 OLED', 'C++'],
    repo: '',
    specs: {
      'Sample rate': '0.5 Hz (2 s floor)',
      'Temperature': '-40 to 80 °C, ±0.5 °C',
      'Humidity': '0 to 100 % RH, ±2 %',
      'Display': '128 x 64, I2C @ 0x3C',
      'Bus speed': '400 kHz',
      'Power': 'USB 5 V',
    },
    sections: [
      {
        h: 'In plain terms',
        p: "This is built around a tiny sensor that can sense heat and moisture in the air. The sensor feeds its readings to an Arduino, which is a small programmable circuit board, and the Arduino puts the numbers on a little display. So instead of guessing whether a room is stuffy, you get an actual reading, updated continuously. It's the kind of thing you'd put in a greenhouse, a server closet, or a bedroom. This was my first project, so most of the value was in learning how sensors, code, and hardware fit together.",
      },
      {
        h: 'Overview',
        p: 'A DHT22 on a breadboard, a 128 by 64 OLED over I2C, and a loop that refuses to stop. No network, no logging, no dashboard. Just a number on a screen that changes when you breathe on the sensor, which at the time felt like an enormous amount of magic for four jumper wires.',
      },
      {
        h: 'How it works',
        p: 'The DHT22 does not speak I2C or SPI. It speaks its own single-wire protocol: the microcontroller pulls the data line low for around 1 ms to request a reading, releases it, and the sensor answers with a 40-bit frame. Sixteen bits of humidity, sixteen of temperature, and eight of checksum, where each bit is encoded as the length of a high pulse. You decode it by timing edges. The decoded values then go out over I2C to the display, which is the only part of the system that uses a real bus.',
      },
      {
        h: 'What it taught me',
        p: 'That a datasheet is not optional. The DHT22 needs a minimum two second interval between reads, so the real ceiling is 0.5 Hz, not the 1 Hz I first wrote. Poll it faster and it returns the last cached value, which looks exactly like a working sensor right up until the room temperature changes and the screen does not. The bug was invisible in every test I ran indoors, because indoors nothing moves fast enough to catch it.',
      },
      {
        h: 'What I would change',
        p: 'The checksum byte was in the frame the whole time and I ignored it. Validating it would have caught the bad reads for free. I would also drop the DHT22 for an SHT31 or a BME280, both of which speak I2C properly and would let the OLED and the sensor share one bus instead of burning a timing-critical digital pin.',
      },
    ],
  },

  {
    slug: 'ocean-pollution-sensor',
    title: 'Ocean Pollution Detection Sensor',
    year: '2024',
    status: 'shipped',
    art: 'halftone',
    seed: 77,
    blurb: 'A waterproof sensor array deployed in water, returning real-time readings of pH, chemical content, and water quality indicators. Built to make invisible pollution visible.',
    tags: ['ESP32', 'pH', 'MQTT', 'Telemetry'],
    stack: ['ESP32', 'pH probe', 'TDS sensor', 'MQTT', 'Python'],
    repo: '',
    specs: {
      'pH range': '0 to 14, ±0.1',
      'TDS range': '0 to 1000 ppm',
      'Publish interval': '10 s',
      'Transport': 'MQTT over WiFi, QoS 1',
      'Enclosure': 'IP67, cable gland entry',
      'Endurance': 'Li-ion, roughly 40 h',
    },
    sections: [
      {
        h: 'In plain terms',
        p: "This is a cluster of waterproof sensors that can be lowered into a body of water. They measure things like acidity (pH), dissolved chemicals, and other indicators that tell you whether the water is healthy or polluted. The readings come back live rather than requiring someone to collect samples and take them to a lab. The idea is early warning: if something is being dumped into the water or conditions are changing, you'd see it in the numbers right away instead of weeks later.",
      },
      {
        h: 'Overview',
        p: 'A sealed array that sits in water and reports what is in it. pH, total dissolved solids, and temperature, pushed over MQTT to a dashboard that anyone can read without knowing what a probe is. The premise was that pollution data already exists but arrives as a PDF three months late, and that a live number is a different kind of argument.',
      },
      {
        h: 'How it works',
        p: 'The pH probe outputs a few tens of millivolts across a very high impedance, far too weak and too fragile to feed an ADC directly, so it goes through a buffer amplifier first. The conditioned signal hits the ESP32 ADC, gets converted through a two-point calibration curve captured against pH 4.0 and 7.0 buffer solutions, and is temperature compensated using the same probe that feeds the temperature reading. The result is packed into a small JSON payload and published to a topic every ten seconds. Nothing is stored on the device.',
      },
      {
        h: 'The hard part',
        p: 'Waterproofing is not a step at the end. It is a constraint on every decision before it: where the cable enters, how the probe is calibrated once it is already sealed, and what happens when condensation forms on the inside of the enclosure rather than water getting in from the outside. The cable gland was the part I redesigned most, because it is the one hole you cannot avoid having.',
      },
      {
        h: 'Calibration drift',
        p: 'A pH probe is a consumable, not a component. The glass membrane ages, the reference junction slowly contaminates, and the slope of the calibration curve flattens over weeks. A reading that is confidently wrong is worse than no reading, so recalibration has to be part of the deployment routine and not a thing you did once before sealing the box.',
      },
    ],
  },

  {
    slug: 'smart-attendance-register',
    title: 'Smart Attendance Register System',
    year: '2024',
    status: 'shipped',
    art: 'glyphs',
    seed: 512,
    blurb: 'An all-software attendance solution built for Smart India Hackathon. Reached university top 20 out of roughly 150 competing teams.',
    tags: ['Python', 'OpenCV', 'Flask', 'Hackathon'],
    stack: ['Python', 'OpenCV', 'SQLite', 'Flask'],
    repo: '',
    specs: {
      'Result': 'Top 20 of roughly 150 teams',
      'Event': 'Smart India Hackathon',
      'Hardware': 'None, software only',
      'Build time': '36 hours',
      'Input': 'Single webcam feed',
      'Store': 'SQLite, one row per session',
    },
    sections: [
      {
        h: 'Overview',
        p: 'No hardware. A camera feed, a face matcher, and a register that fills itself. Built inside a 36 hour window against a brief that changed twice, which is less a story about computer vision than one about scoping.',
      },
      {
        h: 'How it works',
        p: 'Frames come off a single webcam. Each frame runs through face detection to get bounding boxes, each box is cropped and turned into a fixed-length embedding vector, and that vector is compared by cosine distance against a set of enrolled vectors captured once per student. Anything inside the threshold is a match and gets one row written to SQLite for that session, deduplicated so a student standing in frame for a minute does not get marked present sixty times. Flask serves the register as a page a teacher can actually read.',
      },
      {
        h: 'The threshold problem',
        p: 'Every decision in the system collapses into one number: how close is close enough. Set it tight and half the room is marked absent because someone turned their head. Set it loose and two siblings become the same person. There is no correct value, only a chosen tradeoff, and choosing it honestly means deciding in advance which failure you would rather explain.',
      },
      {
        h: 'What survived',
        p: 'The matching pipeline. Most of the rest was scaffolding for the demo, which is the honest outcome of any hackathon build. The parts that made it into the final presentation were the parts that had been rewritten at least twice.',
      },
      {
        h: 'The console',
        p: "The teacher-facing page did not survive the hackathon laptop, so it has been rebuilt here as a single static page. It carries the same surface the original did: the capture panel, the running recognition log, a register that fills itself, and the one slider everything else hangs off. The matcher runs in the browser against a simulated room rather than a live webcam, drawing its distances from the two distributions the real one produced, so nothing on it is a recording of a real class. Pull the threshold tight and watch people who sat through the whole hour get marked absent. Push it loose and watch strangers walk in under someone else's roll number.",
        a: { href: 'dashboard/attendance.html', label: 'Open the attendance console' },
      },
    ],
  },

  {
    slug: 'pir-gsm-security-alarm',
    title: 'PIR & GSM Security Alarm',
    year: '2024',
    status: 'shipped',
    art: 'lattice',
    seed: 331,
    blurb: 'An Arduino security system that watches a room with a passive infrared sensor and sends an SMS to your phone the moment something moves. No app, no WiFi, no account.',
    tags: ['Arduino', 'PIR', 'GSM', 'SMS'],
    stack: ['Arduino Uno', 'HC-SR501 PIR', 'SIM800C GSM', 'C++'],
    repo: '',
    specs: {
      'Detection range': 'Up to roughly 7 m',
      'Field of view': 'About 110 degrees',
      'Sensor warm-up': '30 to 60 s on power-up',
      'Alert latency': 'A few seconds to delivery',
      'Network': 'GSM 2G, voice and SMS',
      'Supply': '12 V to the Uno barrel jack',
      'Modem draw': '2 A burst at 3.4 to 4.4 V',
      'Built': 'June 2024',
    },
    sections: [
      {
        h: 'In plain terms',
        p: "A motion sensor watches the room by picking up body heat as it moves across its field of view. When it detects movement, the Arduino triggers a small cellular module, the same basic technology as a phone SIM, which sends you an SMS. The point is that it needs no WiFi, no app, and no account with any company. It works anywhere there's mobile signal, which makes it useful for a shed, a farm, a rural property, or anywhere the internet is unreliable.",
      },
      {
        h: 'Overview',
        p: 'The smallest useful security system I could think of. One sensor, one modem, one hardcoded number, no buzzer, and no state kept anywhere. The whole program is a few dozen lines, and almost none of the difficulty lives in the logic. It lives in the power supply, which is the one genuinely tight part of it.',
      },
      {
        h: 'How it works',
        p: 'The HC-SR501 is not really a motion sensor. It is a heat sensor with a segmented lens over it, and it fires when the infrared signature crossing one lens segment differs from the next. Its output pin simply goes high, so the Arduino does not need to interpret anything, just watch for the edge. On a rising edge the board wakes the SIM800C and issues a short sequence of AT commands over serial to put the modem into text mode and hand it the number and the message body. The modem talks to the tower, and the phone in your pocket buzzes.',
      },
      {
        h: 'The power path',
        p: 'Everything runs from a single 12 V supply into the Arduino Uno barrel jack, with the SIM800C drawing from the board rather than from a supply of its own. That makes the power path the tightest part of the design. A GSM modem does not draw current smoothly: it idles at a trickle, then pulls up to 2 amps for a few hundred microseconds every time it reaches for the tower, and the Uno onboard linear regulator was never built to answer a transient like that. When it cannot, the 5 V rail sags and the board resets itself mid-send, a failure that reads like a code bug and is nothing of the sort. Bulk capacitance sitting close to the modem is what absorbs that burst locally, so the regulator only ever sees the average. Worth knowing in the other direction too: 12 V into the barrel jack makes that regulator run hotter than 7 V would, because a linear regulator burns the entire difference as heat.',
      },
      {
        h: 'False positives',
        p: 'A passive infrared sensor detects change in heat, not people, so it will happily alert on sunlight moving across a floor, a heater cycling on, or a curtain shifting in front of a warm window. It also needs 30 to 60 seconds after power-up to settle before its output means anything, and if you do not gate that window the system announces an intruder the instant you plug it in. Both of those are the difference between a demo that works and a device someone would actually leave switched on.',
      },
      {
        h: 'Why SMS',
        p: 'SMS is a deliberately unfashionable choice and the right one here. It has no dependency on the property having internet, it reaches a phone that is not running any particular software, and it arrives as a notification the recipient cannot ignore. The SIM800C can place a voice call just as easily, which is the louder option if a text is too easy to sleep through. The tradeoff is that SMS is one-way, it costs money per message, and 2G networks are being switched off in a growing number of countries, which gives this design a real expiry date.',
      },
      {
        h: 'Silent by design',
        p: 'There is no buzzer on the board. Nothing at the device end makes a sound, lights up, or otherwise announces that a detection happened. A local siren is a deterrent, which is a real thing to want, but it also tells whoever tripped it exactly how much time they have and where the sensor is. Staying quiet means the only person who learns anything is the one holding the phone.',
      },
    ],
  },
];

export const contact = {
  links: [
    { label: 'GitHub', handle: 'ashuzaifa', url: 'https://github.com/ashuzaifa' },
    { label: 'Email', handle: 'mohammedhuzaifa464@gmail.com', url: 'mailto:mohammedhuzaifa464@gmail.com' },
    { label: 'Instructables', handle: 'ashuzaifa', url: 'https://www.instructables.com/member/ashuzaifa/' },
    { label: 'ORCID', handle: '0009-0006-6229-3699', url: 'https://orcid.org/0009-0006-6229-3699' },
  ],
};
