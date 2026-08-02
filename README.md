# 🤖 Jarvis-AI

Two Jarvis experiences in one repo:

1. **[Part 1 — J.A.R.V.I.S. Dashboard](#part-1--jarvis-dashboard-web)** · a Tony-Stark-style personal daily dashboard for the browser — tasks, gym plan, calendar, news and markets — **controlled with hand gestures via your webcam**.
2. **[Part 2 — Voice Assistant](#part-2--voice-assistant-python)** · the original fully-offline Python voice assistant (Vosk + Ollama/Phi-3 + pyttsx3).

---

## Part 1 — J.A.R.V.I.S. Dashboard (web)

A gesture-controlled daily dashboard that runs 100% in your browser: a chrome **Ultron head** with glowing red eyes floating in a **deep-space starfield with a live supernova**, plus widgets for **Tasks**, **Gym plan**, **Calendar**, **Today's News**, **Markets** (India · US · UK · Crypto) and **Settings**. Point at a card and pinch to open it fullscreen; grab Ultron's head and rotate your wrist to spin it — mouse and touch always work too.

### Run it locally

```bash
cd docs
python3 -m http.server 8000
# open http://localhost:8000
```

> ⚠ Opening `index.html` via `file://` won't work — ES modules and the camera require http(s). Any static server is fine.

### Enable on GitHub Pages

Repo **Settings → Pages → Deploy from a branch → `main` + `/docs`**. The dashboard then lives at `https://pratikm7073.github.io/Jarvis-AI/`.

### Gesture cheat-sheet

Click **✋ Gesture Control** (bottom-right) and allow the camera. Then:

| Gesture | On the dashboard | Inside an open widget |
|---|---|---|
| ✋ move your palm | cyan cursor · hovered card glows | cursor over content |
| ✋ hand high / low | scroll the page | scroll the widget's list |
| ✊ fist | turbo scroll | turbo scroll |
| 🤏 pinch | over a card → **open it** · over a button → click | click tabs, checkboxes, day cells |
| 🤏 pinch ×2 quickly | — | **close the widget** |
| 👋 fast horizontal swipe | highlight next / prev card | next / prev tab (News, Markets) |
| 🔒 pinch-hold / ✊ / ✋-hold **over Ultron's head**, then rotate your wrist | the head mirrors your hand | the open card 3D-tilts with your wrist |
| 🙌 both hands: drag / twist / spread | rotate · roll · zoom the head | tilt + zoom the card |

Tips: keep your hand ~50–80 cm from the camera in decent light. If tracking drops for a moment the cursor dims instead of vanishing — just keep going. Add `?debug=1` to the URL to drive the same actions from the keyboard (mouse = cursor, `P` = pinch, `[` `]` = swipe, `Shift+↑/↓` = scroll).

### Talk to it — J.A.R.V.I.S. voice assistant

Click the **🎙 JARVIS** chip in the header and allow the microphone. Then just speak (Chrome/Edge have the best speech support):

| Say | It does |
|---|---|
| "open calendar" / "show markets" / "open fitness" | opens that widget fullscreen |
| "close" | closes the open widget |
| "add task buy protein" / "remind me to call mom" | adds a task and confirms out loud |
| "what's my workout" | speaks today's gym plan |
| "weather" | speaks the current conditions |
| "what time is it" / "what's the date" | speaks it |
| "how many steps" / "heart rate" | speaks your fitness numbers |
| "gestures on" / "next tab" / "scroll down" | drives the UI hands-free |

Replies are spoken aloud and typed on the status line under Ultron.

### The Thought Field — your living background

The dashboard's backdrop is a **hand-navigable knowledge graph of your actual day** (inspired by the "Topologies of Thoughts" interface). Today's tasks, this week's workout, upcoming events, your market watchlist and live headlines float as monospace notes clustered around glowing `[Topic]` labels in the screen's margins, drifting in 3D parallax. Tap the **legend chip** (top-right) to animate the whole field between two topologies — *decentralized* (notes grouped in clusters by topic) and *distributed* (notes connected by relationship edges). Pinch empty space and rotate your wrist to spin the field; two hands to zoom.

### Rotation accuracy — measured, not claimed

Grabbing empty space and turning your wrist rotates the thought field at **exactly 1:1** — no amplification. The orientation path (`js/gesture-core.js` → `RotationStabilizer`) is: landmark denoising → orthonormal palm frame from six averaged palm points (Gram-Schmidt, so the frame can never skew) → adaptive slerp on SO(3) → a lock/track state machine. Every stage is unit-tested against synthetic hands carrying MediaPipe-grade gaussian noise:

| Property | Result |
|---|---|
| Still hand, 9,600 frames × 6 noise seeds | **0.0000° drift** (float residue only) |
| Clean round-trip, any axis/angle | exact to 4×10⁻¹³° |
| 80° wrist sweep, landing error | 2.2° @60°/s · 2.3° @180°/s |
| Degenerate/collapsed landmarks | orientation held, never NaN |

A **gyro HUD** (bottom-left, appears while grabbing) shows live yaw/pitch/roll plus the engine's own `LOCKED`/`TRACKING` state — when it reads LOCKED the engine is emitting a byte-identical orientation, so you can *see* that a still hand cannot move the field. Release while turning and the field keeps spinning with decaying momentum; release from a standstill and it stops dead.

### Finger tracking — 21-point skeleton

When gestures are on, your hand is drawn as a **live 21-landmark skeleton** — glowing dots on every knuckle and fingertip, connected by bone lines (exactly like pro hand-tracking interfaces). It's not just decoration: seeing the tracked points is immediate feedback that makes pinches and pointing visibly more precise.

### Console Mode — drive it like an Xbox 🎮

Press any **arrow key** (or just connect a **game controller** — Xbox/PlayStation, wired or Bluetooth) and a glowing focus ring appears that snaps between widget tiles, colored to match each one. D-pad/left-stick to move, **Ⓐ/Enter** to open, **Ⓑ/Esc** to close, **LB/RB or ←/→** to switch tabs inside a widget, **Start** toggles gestures. Tiles also physically tilt in 3D toward your cursor.

The part nobody's seen on a personal site: **haptics and spatial audio**. Every snap sends a tick of *rumble through the controller* (Gamepad haptics API), opening a widget thumps, hitting the grid edge bumps — and the synthesized UI sounds pan left/right in stereo to match where the tile sits on your screen. No audio files, all Web Audio. Everything degrades silently if unsupported.

Each visit also opens with a skippable **Iron-Man boot sequence** — arc ring charges, systems check types out, "WELCOME BACK" — once per session (`?boot=1` replays it; disabled under reduced motion).

### Earth — your holographic Snap-Map

The **🌍 Earth** widget is a real-textured 3D globe (NASA imagery) floating in the dashboard's starfield, wrapped in a cyan holo-graticule and atmosphere. Hit **📍 Fly to me** — it asks for your location (falls back to your saved city) and cinematically rotates the planet to land on you. As you descend, a dark holo-styled **street map of your actual neighbourhood** (free OpenStreetMap tiles, recolored to the theme) materialises as a circular projection, with a glowing **hologram avatar** standing at your position under a "YOURNAME · LIVE" tag. Drag to spin, scroll/pinch to zoom, double-click to fly home, **Full view** to zoom back out. No API keys; if the CDN is unreachable the globe renders as a pure wireframe hologram.

### Fitness — steps & heart rate (and the Apple Health truth)

**Apple Fitness/Health has no public web API** — Apple only exposes HealthKit to native iOS apps, so no website (this one included) can read it directly. Instead the Fitness widget gives you three real paths:

1. **Built-in step counter** — tap **👣 count my steps** on your phone: it uses the accelerometer (DeviceMotion) with peak detection to count steps in real time while the page is open. iOS will ask permission once.
2. **Live heart rate** — tap **💓 connect HR monitor** to pair any Bluetooth LE heart-rate device (chest straps, most sport watches in broadcast mode) via Web Bluetooth. Works in Chrome/Edge on desktop & Android; iPhone browsers block Web Bluetooth.
3. **Manual sync** — type the step count from your Apple Health app into the widget; it's stored with the rest of your data. (Power-user route: an iPhone *Shortcuts* automation can read Health data on a schedule — pair it with a native wrapper app later for true auto-sync.)

Progress shows as a goal ring (default 8,000 steps/day) and history is kept for 90 days in localStorage.

### Install it as an app

The dashboard is a PWA — once it's on GitHub Pages you can install it:

- **Desktop Chrome/Edge:** open the site → click the ⊕ **Install** icon at the right end of the address bar.
- **Android Chrome:** menu ⋮ → **Add to Home screen** → **Install**.
- **iPhone Safari:** Share button → **Add to Home Screen**.

It launches fullscreen with its own Ultron icon, and the app shell loads instantly (cached offline; live data still needs internet).

### Live data (optional API keys)

Everything works instantly with **demo data** (badged `DEMO`). Weather and crypto are live out of the box — no keys. For the rest, paste free-tier keys into **Settings** on the dashboard:

| Provider | Powers | Free tier | Sign up |
|---|---|---|---|
| — (none needed) | Weather strip & forecast | generous | Open-Meteo |
| — (none needed) | Crypto prices + sparklines | ~10–30 req/min | CoinGecko |
| **Finnhub** | US stocks · IN/UK ETF proxy fallback | 60 calls/min | [finnhub.io](https://finnhub.io) |
| **GNews** | News headlines (5 categories) | 100 req/day | [gnews.io](https://gnews.io) |
| **Twelve Data** | NIFTY 50 / SENSEX / FTSE (best-effort) | 8 credits/min | [twelvedata.com](https://twelvedata.com) |

Each widget shows where its data came from: `LIVE · <provider>`, `PROXY · <ETF>` (US-listed country ETF standing in for an index the free tier doesn't cover), or `DEMO`. Responses are cached in localStorage with per-provider TTLs so reloads don't burn your quota.

> 🔑 **Security note:** API keys are stored in your browser's localStorage and are visible client-side by design — use free-tier keys only, never paid or private credentials.

### Privacy

- Camera frames are processed **entirely in your browser** by MediaPipe Hands — no image ever leaves your machine.
- Tasks, gym log, calendar events, settings and keys live in **localStorage** on your device. No backend, no accounts, no analytics.

### Design system

The UI follows a premium-SaaS bar (Linear/Stripe/Vercel-style): a fluid type scale with tabular numerals, restrained glassmorphism over ambient mesh lighting, magnetic buttons and cursor-reactive card spotlights, an orchestrated staggered entrance, and shimmer skeletons for every loading state. All motion is transform/opacity-only (60 fps), fully disabled under `prefers-reduced-motion`. Accessibility is WCAG AA: visible focus rings, a skip link, keyboard-operable cards, and the expanded widget is a real `role="dialog"` with focus trapping that returns focus on close. Measured CLS is ~0.000 — the widget grid is server-rendered as static shells with fixed card heights, so nothing on the page ever reflows while data loads.

### Under the hood

Hand-authored ES modules, no build step. Three.js (pinned `0.160.0`) renders the Ultron head and the nebula/starfield/supernova background (a domain-warped fbm shader running at 30 fps at reduced resolution); MediaPipe Hands (pinned, lazy-loaded only when you enable gestures) does the tracking on a 640×480 feed with a 320×240 fallback. If the CDN is unreachable the 3D/gesture layer switches off and the dashboard keeps working with mouse/touch.

The gesture tracking runs a production-grade signal pipeline (`js/gesture-core.js`, fully unit-tested): **One Euro filtering** (adaptive smoothing — kills cursor jitter with no perceptible lag), a micro-**deadzone**, **hysteresis gates** with frame debounce and cooldowns (no accidental or double-fired pinches), **automatic per-user calibration** of pinch thresholds (hand-size and camera-distance invariant), **motion prediction** that bridges tracking dropouts invisibly, MediaPipe-**confidence gating**, an **interaction box** so screen corners are reachable without stretching to the frame edge, and an **adaptive FPS pacer** that holds real-time on any machine (30 fps on fast hardware, graceful degradation under load, low-light auto-relaxation of detection thresholds).

```
docs/
├── index.html            shell + importmap
├── manifest.webmanifest  PWA manifest (installable app)
├── sw.js                 service worker (offline app shell)
├── icon.svg              app icon
├── css/                  base.css · gestures.css
└── js/
    ├── main.js           widget registry · focus mode · scheduler
    ├── reactor.js        Three.js Ultron head centerpiece
    ├── background.js     deep-space nebula + starfield + supernova
    ├── gestures.js       MediaPipe hand-tracking engine (UI layer)
    ├── gesture-core.js   signal pipeline: One Euro · hysteresis gates ·
    │                     calibration · prediction · adaptive pacing
    ├── voice.js          Web Speech voice assistant
    ├── api.js            provider chains + fallbacks
    ├── store.js          localStorage + TTL cache
    ├── demo-data.js      offline demo values
    └── widgets/          today · tasks · gym · calendar · fitness · news · markets · settings
```

---

## Part 2 — Voice Assistant (Python)

Jarvis-AI is a completely offline, zero-trust architecture voice assistant. It listens to your voice, processes the input using a locally hosted Large Language Model (LLM), and speaks the response back to you—all without sending a single byte of your data to the cloud.

### ✨ Features

- **Offline Speech Recognition (The Ears):** Uses Vosk to securely transcribe audio locally via your microphone.
- **Local LLM Processing (The Brain):** Powered by Microsoft's Phi-3 model running locally via Ollama, ensuring rapid, secure, and private reasoning.
- **Offline Text-to-Speech (The Mouth):** Uses pyttsx3 to generate speech natively on your machine.
- **Zero-Trust Architecture:** Operates entirely without an internet connection once the models are downloaded.
- **Emergency Kill Switch:** Say "stop" or "shut down" to immediately terminate the program.

### 🛠️ Prerequisites

Before running Jarvis, ensure you have the following installed on your system:

- Python 3.8+
- A working microphone
- Ollama installed and running on your machine.

### 🚀 Installation & Setup

**1. Clone or download this repository**

Ensure your Python script (e.g., `jarvis.py`) is in your project folder.

**2. Install the required Python dependencies**

```bash
pip install sounddevice vosk ollama pyttsx3
```

**3. Set up the Language Model (Ollama)**

Jarvis uses the Phi-3 model for fast, local inference. Pull the model via Ollama:

```bash
ollama run phi3
```

(You can close the Ollama terminal once it finishes downloading; just make sure the Ollama app is running in the background).

**4. Download the Vosk Acoustic Model**

- Go to the Vosk Models page.
- Download an English model (e.g., `vosk-model-en-us-0.22` or the smaller `vosk-model-small-en-us-0.15` if you want it to load faster).
- Extract the downloaded .zip file.
- **CRITICAL:** Rename the extracted folder to `vosk-model` and place it in the exact same directory as your Python script.

### 🎙️ Usage

Once everything is set up, run the script from your terminal:

```bash
python jarvis.py
```

How to interact:

- Wait for the `[System] Booting Zero-Trust Architecture...` and `[Microphone Active]` prompts.
- Speak clearly into your microphone.
- Pause when you are finished speaking. Jarvis will detect the silence, process your command via your GPU/CPU, and speak the response.

To exit: simply say **"stop"** or **"shut down"** to trigger the system kill switch.

### 🧠 System Architecture

- **Audio Input:** sounddevice captures raw audio streams.
- **Transcription:** Vosk (KaldiRecognizer) converts the audio waveform into text JSON data.
- **Prompt Engineering:** The text is routed to the local Phi-3 LLM via the ollama Python wrapper, strictly instructed to keep responses brief, conversational, and under three sentences.
- **Audio Output:** The generated text is passed to pyttsx3, matching the set speech rate (170 wpm) for a natural response.
