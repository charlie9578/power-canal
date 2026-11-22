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

## Home screen, progress and ghost racing (v0.4.1)

The game now opens on a dedicated home screen: the driving deck is hidden until a stage starts, and the home screen displays the **number of completed stages**, **best adjusted time** for the selected course, and course-specific personal bests.

**Ghost replay:** On completion of either stage, the boat's world-space position and heading are sampled approximately every 0.25 seconds. The fastest successfully saved *completed recording* for that stage becomes its transparent cyan ghost boat on subsequent runs. The ghost is drawn as a time-indexed replay, not simulated AI, and doesn't affect water physics or collisions. Toggle it with the **◇** button on the driving deck or **G** on desktop. Ghosts are saved locally in the browser; they are not shared or uploaded. If your best time predates this release, that time is still displayed but has no corresponding replay. The first new completed run establishes a ghost baseline; subsequent faster recorded scores replace it. Because adjusted scores include collision penalties, the visual replay advances in actual elapsed race time while the time displayed for the ghost is the adjusted best score.

**Lock improvements:** The lock is now a distinct stone-walled chamber. It has a conspicuously **open entrance**, visible closed gates at the far end, alignment markings, clear stopping guidance and roadside approach signs. No geometry or finish condition was changed.

**Scenery:** Procedural fields and hedges, a continuous west-bank towpath, waterside trees, stone paving through masonry sections, and more legible stone bridges. These details are **visual only** and are not obstacles.

## Select a course

The opening menu now offers two selectable stages:

- **01 — Bridge to Lock:** the original winding narrowboat time trial, unchanged in layout.
- **02 — The Waterway Lab:** a longer engineering test course with navigable S-bends, deep/broad reaches, shallow/narrow sections, a **stone aqueduct**, a brick-lined cutting, two bridges and a lock finish. The 48-foot narrowboat is unchanged: it is the *waterway* that varies.

The conditions display shows the current **nominal channel width and depth**. These quantities feed the Schijf-based resistance calculation and shore effects, so this is a real handling and speed test, not just different paint. Bank construction changes the visuals; stone, brick and earth do not yet have separately identified hydrodynamic coefficients. All geometry is fictional and dimensions are exploratory, not a surveyed canal.

To switch courses, tap the **⌂ home button** next to Pause and Restart, or **Change Course** on the results screen. Each stage maintains its own best time. You can also start the test course directly with [the Waterway Lab URL](https://charlie9578.github.io/power-canal/?course=test&v=20261122-11).

**Touch controls**

- **Left throttle:** drag up for five notched ahead settings (+1 to +5), drag down for five notched astern settings (−1 to −5), with neutral (0) in the middle. Only MAX, NEUTRAL and MIN are marked on the control, but dragging still snaps to eleven settings in 20% increments. The lever stays in the selected position. The left-hand lever now uses more of the control deck height.
- **Right tiller:** drag towards port or starboard; it stays where you leave it; the lever physically sweeps from centre to full lock in about 0.3 seconds. **Real tiller behaviour:** pushing the handle towards starboard turns the *bow to port*. The boat continues rotating for a while after the handle returns to centre.
- Pause (Ⅱ), restart (↻), home/course selection (⌂) and ghost replay (◇) are in the control deck.
- Desktop fallback: **↑ / ↓** adjust throttle, **← / →** adjust tiller, **Space** neutral, **C** centre tiller.

## Finish and scoring

The clock runs until your whole 48-foot boat is **inside** the lock, your total speed over ground is below **0.16 m/s (0.36 mph)**, your yaw rate is below **0.040 rad/s**, and you have held that position for **1.2 seconds**. Passing the lock approach at speed won't complete the trial. Use reverse power early to brake. A status panel near the lock tells you whether the **stern is outside, the boat is off centre, speed is too high, or yaw is still settling**, plus shows the hold progress. Small speed or yaw fluctuations reduce progress rather than erase it; significant movement resets the hold.

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
- `src/ghost.js`: timestamped local run recordings and ghost interpolation.
- `src/lock-stop.js`: explicit whole-hull lock finish conditions and hold progress.
- `src/scenery.js`: deterministic fields, towpaths and stone bridge rendering.
- `src/steering-analysis.js`: Nomoto gain, zeros and poles.
- `PHYSICS.md`: engineering notes, model derivation and calibration plan.
- `src/course.js`: two fictional canal layouts, section widths/depths, bank styles, bridges, aqueduct and lock geometry.
- `src/main.js`: canvas rendering, collision/penalty rules, touch/keyboard input, simulation loop and timing.
- `src/water.js`: movement-aligned, world-space wake samples and their lifetimes.
- `src/throttle.js`: 11-position combined throttle and reverse lever.
- `tests/courses.test.js`: route selection, centreline clearances, depth/width transitions and differential resistance.
- `tests/browser-startup.test.js`: browser entrypoint and home layout smoke tests.
- `tests/ghost.test.js`: replay serialization, interpolation, and stage isolation.
- `tests/lock-stop.test.js`: docking edge cases including lingering drift, sideways motion and yaw.
- `tests/navigation.test.js`: complete physics-based drive-throughs of both courses, including bridges and stopping inside the locks.
- `tests/physics.test.js`: handling tests.
- `tests/hydrodynamics.test.js`: friction, waves, restricted-water and propeller tests.
- `tests/steering.test.js`: propeller trim and Nomoto model analysis tests.

Run tests with `npm test` (requires modern Node.js; only the tests need Node).

## Planned next steps

1. Calibrate propeller RPM/thrust, straight-line power, stopping, zigzag, and turning curves using real narrowboat trials.
2. Improve bank geometry, return-flow and squat estimates, and validate bow waves against restricted-water trials.
3. Add a second boat with approximation-based pressure interaction for overtaking.
4. Design an advanced stage with tight turnings or winding holes that require slowing and using short pulses of ahead thrust and counter-tiller; validate physical reachability before release.
5. Improve scenery variety (towpath junctions, livestock, buildings, moorings) while retaining inexpensive 2D canvas rendering.

## Design goal

**Realistic causes, enjoyable consequences.** The player should learn to anticipate steering and braking, not fight arbitrary input lag.

### Water visual tuning

The stern wake is intentionally subtle: a shorter-lived, sparser and less opaque trailing V, separate from the bow wave and propeller wash. Propeller wash bends with the **actual, rate-limited rudder angle** (strongly when ahead, weakly astern), even when the boat is nearly stationary. Bow-wave intensity now follows the modelled wave and restricted-water resistance, but remains a stylised visual.

## Deployment verification

GitHub Pages hosts the game at https://charlie9578.github.io/power-canal/ . The HUD shows the build version (currently **v0.4.1**). Static CSS and JS links include a release-specific query string so a new deployment loads fresh game assets. If the old page is still cached, open https://charlie9578.github.io/power-canal/?v=20261122-11 to force a fresh document URL.

### v0.4.1 navigability correction

The original Stage 01 remains unchanged. Stage 02's original shallow narrows placed a narrow bridge in a steep S-bend. The bridge collision test assumes a cross-channel aperture and would strike a correctly aligned boat on that curve. In addition, the narrow and twisting stretch could keep the hull marginally overlapping the bank; the former contact drag applied very strongly even to a tiny scrape, making progress almost impossible.

Stage 02 now has more forgiving shallow bends (8.6 m wide, still only 0.98 m deep), and two wider (6.8 m) bridges placed on relatively straight, open reaches. The other bends have been eased where necessary to preserve clearance. Bank contact now permits very slight sampling overlap without dragging the hull to a halt, while larger collisions still slow the boat and can incur penalties.

A test-only look-ahead helm drives the unchanged 48-foot boat with actual thrust, drag, yaw inertia, bridges, bank checks and lock completion logic. It must finish *both* courses without bridge strikes or significant bank contact. The automatic controller is only in the test suite; no player steering assistance has been added. This demonstrates navigability, not a guarantee that every steering strategy or speed will succeed.

### v0.4.1 — lock finish reliability

The previous lock-finish criterion was so strict (ground speed under 0.08 m/s for 1.4 uninterrupted seconds) that a boat appearing stationary could coast in neutral for a minute and still not finish. The speed display also showed only the longitudinal body velocity while the finish check used total ground velocity, hiding sideways drift.

The game now shows **total ground speed**, accepts a settled boat under **0.16 m/s** and **0.040 rad/s** yaw, and requires a **1.2-second** lock hold. Minor brief speed/yaw fluctuations subtract hold progress, instead of snapping the progress to zero. Leaving the lock or moving significantly resets the hold as before. The full hull must still fit inside the chamber. A dedicated lock indicator explains whether the boat needs to move forward, reverse, centre itself, slow down or settle its rotation. Neither hydrodynamic forces nor the existing route geometry has changed.
