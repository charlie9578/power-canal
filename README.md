# Power Canal 🚤

A mobile-first, portrait-mode **narrowboat precision time trial** inspired by classic overhead rally games. Drive with a **throttle on the left** and a **tiller on the right**. Negotiate canal bends and bridges, then bring the **entire boat to a complete stop inside the lock** to finish.

This is an early playable physics prototype, not a validated maritime simulation.

## Play

Run any static web server at the repository root, then open the local URL on a mobile browser (portrait orientation recommended). No build, package install, or dependencies are required for gameplay.

For example:

```sh
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) on your computer. To play from a phone, use your development machine's LAN IP and ensure your firewall permits local connections.

**Touch controls**

- **Left throttle:** drag up for ahead, drag down for reverse, middle for neutral. It stays at the selected setting after release.
- **Right tiller:** drag towards port or starboard; it stays where you leave it. **Real tiller behaviour:** pushing the handle towards starboard turns the *bow to port*. The boat continues rotating for a while after the handle returns to centre.
- Pause (Ⅱ) and restart (↻) are in the control deck.
- Desktop fallback: **↑ / ↓** adjust throttle, **← / →** adjust tiller, **Space** neutral, **C** centre tiller.

## Finish and scoring

The clock runs until your whole 48-foot boat is **inside** the lock, you are moving less than **0.08 m/s**, turning slowly, and have held that position for **1.4 seconds**. Passing the lock approach at speed won't complete the trial. Use reverse power early to brake.

Contact with the bank, a bridge, or the far lock gate slows your boat; significant strikes also add time. The final score is **elapsed time + penalties**. The best score is stored locally in the browser.

## First-pass physics

The deterministic fixed-timestep model in `src/physics.js` includes:

- Boat mass, forward and reverse engine thrust, longitudinal linear/quadratic drag, and speed-dependent resistance.
- Lateral velocity and damping, rather than steering the heading vector directly.
- A rudder response lag, flow-over-rudder turning force, low-speed prop-wash term, and yaw inertia/damping.
- A hull-length-based boundary check for bank contact, bridge checks, and a full-hull lock finish.

**Approximation warning:** The current drag, thrust, bank contact and rudder parameters are deliberately hand-tuned gameplay coefficients, not measured hydrodynamic performance. In particular, the shallow-water, wave-making, and passing-vessel suction models are future work.

## Project layout

- `index.html`: game HUD, overlays, left throttle and right tiller controls.
- `style.css`: responsive portrait mobile layout.
- `src/physics.js`: boat motion model.
- `src/course.js`: fictional canal centreline, banks, bridges and lock geometry.
- `src/main.js`: canvas rendering, collision/penalty rules, touch/keyboard input, simulation loop and timing.
- `tests/physics.test.js`: smoke tests for key handling and finish geometry.

Run tests with `npm test` (requires modern Node.js; only the tests need Node).

## Planned next steps

1. Playtest and tune steering response, speed, stopping distance and penalty thresholds on actual phones.
2. Add a more physical canal cross-section: shallow-water drag, bank suction and visible bow/wake feedback.
3. Add a second boat with approximation-based pressure interaction for overtaking.
4. Add replay/ghost racing, multiple stages, and an optional steering-assist mode.
5. Improve canal banks, bridges and lock visuals while retaining inexpensive 2D canvas rendering.

## Design goal

**Realistic causes, enjoyable consequences.** The player should learn to anticipate steering and braking, not fight arbitrary input lag.
