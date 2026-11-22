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

## Select a course

The opening menu now offers two selectable stages:

- **01 — Bridge to Lock:** the original winding narrowboat time trial, unchanged in layout.
- **02 — The Waterway Lab:** a longer engineering test course with tighter S-bends, deep/broad reaches, shallow/narrow sections, a **stone aqueduct**, a brick-lined cutting, two bridges and a lock finish. The 48-foot narrowboat is unchanged: it is the *waterway* that varies.

The conditions display shows the current **nominal channel width and depth**. These quantities feed the Schijf-based resistance calculation and shore effects, so this is a real handling and speed test, not just different paint. Bank construction changes the visuals; stone, brick and earth do not yet have separately identified hydrodynamic coefficients. All geometry is fictional and dimensions are exploratory, not a surveyed canal.

To switch courses, use the **≋ course button** next to Pause and Restart, or **Change Course** on the results screen. Each stage maintains its own best time. You can also start the test course directly with [the Waterway Lab URL](https://charlie9578.github.io/power-canal/?course=test&v=20261122-7).

**Touch controls**

- **Left throttle:** drag up for five notched ahead settings (+1 to +5), drag down for five notched astern settings (−1 to −5), with neutral (0) in the middle. Only MAX, NEUTRAL and MIN are marked on the control, but dragging still snaps to eleven settings in 20% increments. The lever stays in the selected position. The left-hand lever now uses more of the control deck height.
- **Right tiller:** drag towards port or starboard; it stays where you leave it; the lever physically sweeps from centre to full lock in about 0.3 seconds. **Real tiller behaviour:** pushing the handle towards starboard turns the *bow to port*. The boat continues rotating for a while after the handle returns to centre.
- Pause (Ⅱ), restart (↻) and course selection (≋) are in the control deck.
- Desktop fallback: **↑ / ↓** adjust throttle, **← / →** adjust tiller, **Space** neutral, **C** centre tiller.

## Finish and scoring

The clock runs until your whole 48-foot boat is **inside** the lock, you are moving less than **0.08 m/s**, turning slowly, and have held that position for **1.4 seconds**. Passing the lock approach at speed won't complete the trial. Use reverse power early to brake.

Contact with the bank, a bridge, or the far lock gate slows your boat; significant strikes also add time. The final score is **elapsed time + penalties**. A separate best score is stored locally for each course.

## First-pass physics

The fixed-timestep dynamics model in `src/physics.js` now uses a coupled **surge–sway–yaw** system with rigid-body and added-water inertia. It includes:

- ITTC-1957 hull friction, length-dependent Froude wave-resistance proxy, Schijf canal limiting speed, and speed-dependent propeller thrust.
- Model-driven V-shaped bow waves, a faint lingering stern wake, and tiller-directed propeller wash in ahead/reverse.
- Lateral velocity and damping, rather than steering the heading vector directly.
- Rate-limited direct tiller-to-rudder steering, with stronger yaw inertia and weaker lateral/yaw damping, distributed cross-flow hull forces, propeller-enhanced rudder lift at low forward speed, weak reverse rudder action, and sway/yaw coupling.
- Approximate Schijf-based confined-water resistance, bank bow-pressure/stern-suction forces, and a hull-length-based boundary check for bank contact, bridge checks, and a full-hull lock finish.

**Calibration warning:** This is a physics-structured but not yet instrument-calibrated model. The hull, rudder, thrust, drag and bank coefficients are estimates; the confinement and bank models are deliberately simplified, and interactions with *other boats* are future work. See [PHYSICS.md](PHYSICS.md) for equations, assumptions and right-half-plane pole analysis.

## Project layout

- `index.html`: game HUD, overlays, left throttle and right tiller controls.
- `style.css`: responsive portrait mobile layout.
- `src/physics.js`: three-degree-of-freedom surge/sway/yaw model and directional poles.
- `src/hydrodynamics.js`: hull resistance, Schijf limit, and propeller KT-J model.
- `src/steering-analysis.js`: Nomoto gain, zeros and poles.
- `PHYSICS.md`: engineering notes, model derivation and calibration plan.
- `src/course.js`: two fictional canal layouts, section widths/depths, bank styles, bridges, aqueduct and lock geometry.
- `src/main.js`: canvas rendering, collision/penalty rules, touch/keyboard input, simulation loop and timing.
- `src/water.js`: movement-aligned, world-space wake samples and their lifetimes.
- `src/throttle.js`: 11-position combined throttle and reverse lever.
- `tests/courses.test.js`: route selection, safe bend geometry, depth/width transitions and differential resistance.
- `tests/physics.test.js`: handling tests.
- `tests/hydrodynamics.test.js`: friction, waves, restricted-water and propeller tests.
- `tests/steering.test.js`: propeller trim and Nomoto model analysis tests.

Run tests with `npm test` (requires modern Node.js; only the tests need Node).

## Planned next steps

1. Calibrate propeller RPM/thrust, straight-line power, stopping, zigzag, and turning curves using real narrowboat trials.
2. Improve bank geometry, return-flow and squat estimates, and validate bow waves against restricted-water trials.
3. Add a second boat with approximation-based pressure interaction for overtaking.
4. Add replay/ghost racing, more stages, and an optional steering-assist mode.
5. Improve canal banks, bridges and lock visuals while retaining inexpensive 2D canvas rendering.

## Design goal

**Realistic causes, enjoyable consequences.** The player should learn to anticipate steering and braking, not fight arbitrary input lag.

### Water visual tuning

The stern wake is intentionally subtle: a shorter-lived, sparser and less opaque trailing V, separate from the bow wave and propeller wash. Propeller wash bends with the **actual, rate-limited rudder angle** (strongly when ahead, weakly astern), even when the boat is nearly stationary. Bow-wave intensity now follows the modelled wave and restricted-water resistance, but remains a stylised visual.

## Deployment verification

GitHub Pages hosts the game at https://charlie9578.github.io/power-canal/ . The HUD shows the build version (currently **v0.3.1**). Static CSS and JS links include a release-specific query string so a new deployment loads fresh game assets. If the old page is still cached, open https://charlie9578.github.io/power-canal/?v=20261122-7 to force a fresh document URL.
