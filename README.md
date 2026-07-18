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

### Under the hood

Hand-authored ES modules, no build step. Three.js (pinned `0.160.0`) renders the Ultron head and the nebula/starfield/supernova background (a domain-warped fbm shader running at 30 fps at reduced resolution); MediaPipe Hands (pinned, lazy-loaded only when you enable gestures) does the tracking at ~15 fps on a 320×240 feed. If the CDN is unreachable the 3D/gesture layer switches off and the dashboard keeps working with mouse/touch.

```
docs/
├── index.html            shell + importmap
├── css/                  base.css · gestures.css
└── js/
    ├── main.js           widget registry · focus mode · scheduler
    ├── reactor.js        Three.js Ultron head centerpiece
    ├── background.js     deep-space nebula + starfield + supernova
    ├── gestures.js       MediaPipe hand-tracking engine
    ├── api.js            provider chains + fallbacks
    ├── store.js          localStorage + TTL cache
    ├── demo-data.js      offline demo values
    └── widgets/          today · tasks · gym · calendar · news · markets · settings
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
