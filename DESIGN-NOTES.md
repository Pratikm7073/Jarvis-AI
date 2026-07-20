# Design References → Animation System

> Extracted frame-by-frame from Pratik's reference videos (2026-07-20).
> Each move is mapped to a concrete implementation in our stack
> (vanilla ES modules + Three.js, transform/opacity-only, reduced-motion safe).
> Companion to `BRAIN.md` §13.

## Reference breakdown

**Video A — "Topologies of Thoughts" (hand-tracked spatial knowledge graph)**
| Move | What happens on screen |
|---|---|
| A1 Spatial text nodes | Dozens of small monospace notes float in 3D parallax layers over the camera feed, clustered around green `[Topic]` labels |
| A2 Mode re-topology | Toggling "decentralized → distributed" animates the whole graph from topic clusters into an edge-connected network — nodes drift, edges draw in |
| A3 Fingertip cursors | Tracked fingertips render as glowing dots; pinch selects |
| A4 Corner-bracket focus | Selected cluster gets viewfinder brackets `⌐ ¬` |
| A5 Constellation minimap | Tiny node-graph legend mirrors the current layout mode |

**Video B — ORYZO / Terminal / gallery reel**
| Move | What happens on screen |
|---|---|
| B1 Aurora breathing frame | Rainbow gradient glow hugs the viewport edges, slowly cycling hue, breathing |
| B2 Reactive hero + hint | 3D object responds to hover; "TRY TO HOVER" affordance chip |
| B3 Kinetic type sweep | Giant headline slides horizontally *through* the scene while the product floats in a dashed crop-mark frame |
| B4 Scrollytelling camera | Scroll flies the camera through a 3D yard; wireframe boxes materialize to solid; narrative text pins between beats |
| B5 Blueprint transitions | Fine grid backdrop; panels slide in like machined parts |
| B6 Dot-matrix reveal | Titles resolve from scrambled dot-matrix glyphs ("PAPER PLANES", "KANDINSKY") |
| B7 Floating gallery | 3D card carousel drifting among particles, index menu at left |

## Animation proposals (mapped to our dashboard)

### Tier 1 — quick wins, one session, CSS-heavy
1. **Aurora frame** (B1): conic-gradient viewport edge glow, slow hue drift, "breathes"; intensifies while Jarvis listens/speaks. Pure CSS + one class hook from voice.js.
2. **Crop-mark focus frame** (B3/A4): SVG corner brackets + dashed frame that *draw themselves* (stroke-dashoffset) around the hovered/console-selected card — replaces the plain ring glow on hover, upgrades `#consoleRing`.
3. **Dot-matrix text reveals** (B6): per-character glyph-scramble resolve for widget titles, focus dialog titles, the Ultron status line, and terminal output. One ~40-line utility, monospace-safe.
4. **Odometer tickers**: market prices, step counts, and the clock roll digits like split-flap displays instead of swapping.

### Tier 2 — moderate, one session each
5. **Kinetic type sweeps** (B3): opening focus mode sweeps a giant ghosted word through the backdrop — "MOVE." for Fitness, "CAPITAL" for Markets, "ORBIT" for Earth — huge Bricolage type, `mix-blend-mode:screen`, transform-only marquee.
6. **Wireframe → solid materialization** (B4): Ultron and the Earth boot in as cyan wireframes that fill to textured solids (material crossfade); focus dialogs open with a 150ms blueprint-grid flash (B5).
7. **News gallery carousel** (B7): News focus mode becomes a drifting 3D card fan among ember particles; drag/swipe/gesture to flip headlines.
8. **Hero annotations** (B2): HUD callouts with leader lines fade in over Ultron on idle hover — "TRY: pinch & rotate ✋" — plus precise eye-tracking of the cursor.

### Tier 3 — flagships
9. **Thought Constellation** (A1–A5, the crown jewel): a full-screen mode where your *actual data* — tasks, events, notes, brain references (`BRAIN.md` P3) — floats as a hand-navigable 3D knowledge graph. Topic clusters ↔ relationship network with animated re-topology (force layout lerped between modes), pinch-select with corner brackets, constellation minimap, fingertip cursors from our existing gesture engine. This is the visual front-end of the brain's memory.
10. **Tour mode** (B4): a scroll-driven camera flight through our existing space scene — supernova → Ultron close-up → Earth flyby → landing on the grid — with pinned narrative beats. Ships as the landing experience for first-time visitors.

## Guardrails
- Transform/opacity only; every effect behind `prefers-reduced-motion`.
- Frame budget: nothing may push the gesture loop below its pacer target.
- Each tier lands green through the existing suites + new assertions per effect.

## Proposed order
Tier 1 (all four) → 5+6 → 9 (pairs with Brain P3) → 7+8 → 10.
