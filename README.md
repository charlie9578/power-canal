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

- **Left throttle:** drag up for five notched ahead settings (+1 to +5), drag down for five notched astern settings (−1 to −5), with neutral (0) in the middle. Only MAX, NEUTRAL and MIN are marked on the control, but dragging still snaps to eleven settings in 20% increments. The lever stays in the selected position. The left-hand lever now uses more of the control deck height.
- **Right tiller:** drag towards port or starboard; it stays where you leave it. **Real tiller behaviour:** pushing the handle towards starboard turns the *bow to port*. The boat continues rotating for a while after the handle returns to centre.
- Pause (Ⅱ) and restart (↻) are in the control deck.
- Desktop fallback: **↑ / ↓** adjust throttle, **← / →** adjust tiller, **Space** neutral, **C** centre tiller.

## Finish and scoring

The clock runs until your whole 48-foot boat is **inside** the lock, you are moving less than **0.08 m/s**, turning slowly, and have held that position for **1.4 seconds**. Passing the lock approach at speed won't complete the trial. Use reverse power early to brake.

Contact with the bank, a bridge, or the far lock gate slows your boat; significant strikes also add time. The final score is **elapsed time + penalties**. The best score is stored locally in the browser.

## First-pass physics

The fixed-timestep dynamics model in `src/physics.js` now uses a coupled **surge–sway–yaw** system with rigid-body and added-water inertia. It includes:

- Boat mass, forward and reverse engine thrust, longitudinal linear/quadratic drag, and speed-dependent resistance.\n- Stylised V-shaped bow waves aligned to actual travel velocity, lingering world-space trailing wake, and throttle-dependent propeller wash that reverses direction in astern.
- Lateral velocity and damping, rather than steering the heading vector directly.
- Direct tiller-to-rudder steering (no artificial rudder delay), distributed cross-flow hull forces, propeller-enhanced rudder lift at low forward speed, weak reverse rudder action, and sway/yaw coupling.
- Depth/channel-blockage-dependent resistance, approximate bank bow-pressure/stern-suction forces, and a hull-length-based boundary check for bank contact, bridge checks, and a full-hull lock finish.

**Calibration warning:** This is a physics-structured but not yet instrument-calibrated model. The hull, rudder, thrust, drag and bank coefficients are estimates; the confinement and bank models are deliberately simplified, and interactions with *other boats* are future work. See [PHYSICS.md](PHYSICS.md) for equations, assumptions and right-half-plane pole analysis.

## Project layout

- `index.html`: game HUD, overlays, left throttle and right tiller controls.
- `style.css`: responsive portrait mobile layout.
- `src/physics.js`: three-degree-of-freedom surge/sway/yaw model and linearized directional poles.\n- `PHYSICS.md`: engineering notes, model derivation and calibration plan.
- `src/course.js`: fictional canal centreline, banks, bridges and lock geometry.
- `src/main.js`: canvas rendering, collision/penalty rules, touch/keyboard input, simulation loop and timing.\n- `src/water.js`: movement-aligned, world-space wake samples and their lifetimes.\n- `src/throttle.js`: 11-position combined throttle and reverse lever.
- `tests/physics.test.js`: smoke tests for key handling and finish geometry.

Run tests with `npm test` (requires modern Node.js; only the tests need Node).

## Planned next steps

1. Instrument and calibrate real narrowboat speed-versus-power, stopping, zigzag and turning response; validate handling on actual phones.
2. Add a more physical canal cross-section: shallow-water drag and bank suction; refine the stylised bow/wake visuals.
3. Add a second boat with approximation-based pressure interaction for overtaking.
4. Add replay/ghost racing, multiple stages, and an optional steering-assist mode.
5. Improve canal banks, bridges and lock visuals while retaining inexpensive 2D canvas rendering.

## Design goal

**Realistic causes, enjoyable consequences.** The player should learn to anticipate steering and braking, not fight arbitrary input lag.

### Water visual tuning

The stern wake is intentionally subtle: a shorter-lived, sparser and less opaque trailing V, separate from the bow wave and propeller wash. Propeller wash bends with the **actual, delayed rudder angle** (strongly when ahead, weakly astern), even when the boat is nearly stationary. Wake strength is purely visual; boat physics and scoring are unchanged.

## Deployment verification

GitHub Pages hosts the game at https://charlie9578.github.io/power-canal/ . The HUD shows the build version (currently **v0.2.0**). Static CSS and JS links include a release-specific query string so a new deployment loads fresh game assets. If the old page is still cached, open https://charlie9578.github.io/power-canal/?v=20261122-4 to force a fresh document URL.
