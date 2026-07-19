/* ════════════════════════════════════════════════════
   J.A.R.V.I.S. VOICE — talk to the dashboard
   Web Speech API: SpeechRecognition to listen,
   speechSynthesis to answer. Runs fully in-browser.
   Say things like:
     "open calendar" · "close" · "add task buy milk"
     "what's my workout" · "weather" · "what time is it"
     "how many steps" · "gestures on" · "next tab"
════════════════════════════════════════════════════ */
import { store, todayKey, DOW } from './store.js';
import { getWeather, wmo } from './api.js';

export function initVoice({ focusApi, widgets, setLine }) {
  const btn = document.getElementById('voiceBtn');
  if (!btn) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btn.style.display = 'none'; return; }

  let active = false, rec = null;

  function say(text) {
    setLine('🗣 ' + text);
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.03; u.pitch = 0.92;
      const v = speechSynthesis.getVoices().find(v => /en[-_](GB|IN|US)/i.test(v.lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) { /* synthesis unavailable — text line already shown */ }
  }

  const WIDGET_WORDS = {
    task: 'tasks', tasks: 'tasks', gym: 'gym', workout: 'gym',
    calendar: 'calendar', events: 'calendar', news: 'news', headlines: 'news',
    market: 'markets', markets: 'markets', stocks: 'markets', crypto: 'markets',
    fitness: 'fitness', steps: 'fitness', settings: 'settings', weather: 'weather',
    earth: 'earth', globe: 'earth', map: 'earth', world: 'earth',
  };

  async function handle(raw) {
    const t = raw.toLowerCase().replace(/\b(jarvis|hey|please|can you|could you)\b/g, '').trim();
    if (!t) return;
    setLine('🎙 “' + raw.trim() + '”');

    /* add task <text> */
    const addTask = t.match(/add (?:a )?task (.+)|remind me to (.+)/);
    if (addTask) {
      const text = (addTask[1] || addTask[2]).trim();
      store.update('tasks', all => {
        (all[todayKey()] ??= []).push({ id: crypto.randomUUID(), text, done: false, createdAt: Date.now() });
        return all;
      });
      widgets.tasks.refresh();
      return say(`Task added: ${text}.`);
    }
    /* close / open <widget> */
    if (/\b(close|dismiss|back)\b/.test(t)) { focusApi.close(); return say('Closed.'); }
    for (const [word, id] of Object.entries(WIDGET_WORDS)) {
      if (new RegExp(`\\b(open|show|display)\\b.*\\b${word}`).test(t)) {
        focusApi.open(id);
        return say(`Opening ${widgets[id].title}.`);
      }
    }
    /* spoken answers */
    if (/\b(workout|gym|training)\b/.test(t)) {
      const g = store.get('gym').schedule[DOW[new Date().getDay()]];
      return say(`Today is ${g.title}. ${g.items.length} exercises on the plan.`);
    }
    if (/\b(weather|temperature|rain)\b/.test(t)) {
      const w = await getWeather();
      return say(`${wmo(w.current.code).label}, ${w.current.temp} degrees in ${store.get('settings').location.name}.`);
    }
    if (/\btime\b/.test(t)) return say(`It's ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`);
    if (/\b(date|day)\b/.test(t)) return say(`It's ${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}.`);
    if (/\bsteps?\b/.test(t)) {
      const s = store.get('fitness').steps[todayKey()] || 0;
      return say(`${s.toLocaleString()} steps today.`);
    }
    if (/\bheart|pulse\b/.test(t)) {
      const hr = store.get('fitness').hr.last;
      return say(hr ? `Last reading ${hr} beats per minute.` : 'No heart-rate reading yet.');
    }
    if (/\bgestures? (on|off)\b/.test(t)) { document.getElementById('gestureBtn').click(); return say('Done.'); }
    if (/\bnext (tab|widget)\b/.test(t)) {
      if (focusApi.isOpen()) { const w = widgets[focusApi.current()]; (w.cycleTabs || (() => focusApi.cycle(1)))(1); }
      return say('Next.');
    }
    if (/\bscroll (down|up)\b/.test(t)) {
      const dy = /down/.test(t) ? 400 : -400;
      focusApi.isOpen() ? focusApi.scrollBody(dy) : scrollBy({ top: dy, behavior: 'smooth' });
      return;
    }
    if (/\b(hello|hi|good (morning|afternoon|evening))\b/.test(t))
      return say(`At your service, ${store.get('settings').name}.`);
    if (/\b(thank|thanks)\b/.test(t)) return say('Always.');
    say("Sorry, I didn't catch that. Try: open calendar, add task, or what's my workout.");
  }

  function start() {
    rec = new SR();
    rec.continuous = true; rec.interimResults = false; rec.lang = 'en-IN';
    rec.onresult = e => handle(e.results[e.results.length - 1][0].transcript);
    rec.onerror = e => {
      if (e.error === 'not-allowed') { say('Microphone permission denied.'); stop(); }
    };
    rec.onend = () => { if (active) try { rec.start(); } catch (e) { } };   // Chrome auto-stops on silence
    rec.start();
    active = true;
    btn.classList.add('live');
    btn.setAttribute('aria-pressed', 'true');
    setLine('🎙 Listening — say “open calendar”, “add task…”, “what’s my workout”');
  }
  function stop() {
    active = false;
    rec && (rec.onend = null, rec.stop()); rec = null;
    speechSynthesis.cancel();
    btn.classList.remove('live');
    btn.setAttribute('aria-pressed', 'false');
    setLine('Voice off.');
  }
  btn.addEventListener('click', () => active ? stop() : start());
  /* preload voices (Chrome loads them async) */
  speechSynthesis.getVoices();
}
