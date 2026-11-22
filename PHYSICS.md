# Power Canal physics model (v0.5.1)

## Scope and confidence

The game now integrates a coupled **horizontal-plane three-degree-of-freedom (3-DOF)** manoeuvring model: surge, sway and yaw. This is an engineering **structure**, not a fully identified quantitative narrowboat model. The mass, water-added inertia, cross-flow force, propeller/rudder lift and canal-bank coefficients are estimates. Real narrowboat turning radii, stopping distances and stability can only be established after identifying parameters against measurements from comparable boats and canals.

The objective is to retain a plausible causal model without CFD, while making the coefficients adjustable for future boat classes.

### Primary sources

1. [Thor I. Fossen, *Marine Craft Model*](https://fossen.biz/html/marineCraftModel.html) — rigid-body/added-mass inertia, Coriolis and damping decomposition, and equations of motion.
2. [Fossen, *Handbook of Marine Craft Hydrodynamics and Motion Control*, Ch. 6 and 9](https://doi.org/10.1002/9781119575016.ch6) — manoeuvring models, cross-flow damping, rudder/propeller interaction.
3. [OE3036 lecture notes, Nomoto models](https://oe3036.mavlab.in/ch_05/ch_05_nomoto) — linear steering dynamics, course stability and Nomoto time constant.
4. [ITTC resistance guidelines](https://www.ittc.info/media/11780/75-02-02-01.pdf) — ITTC-1957 skin friction.
5. [PIANC inland navigation / Schijf calculations](https://www.pianc.org/wp-content/uploads/2024/02/34th-World-Congress-Panama-Full-Papers-Inland-Navigation-Part-2.pdf) — confined-water hydraulic limit.
6. [Yasukawa and Yoshimura, MMG standard manoeuvring method](https://doi.org/10.1007/s00773-014-0293-y) — open-water propeller thrust coefficients.
7. [Practical Boat Owner, inland boating beginner's guide](https://www.pbo.co.uk/cruising/inland-boating-in-the-uk-a-beginners-guide-87875) — narrowboat rudder/propeller handling, inertia and stern swing.

These references inform the model *form*, not the values chosen for this particular vessel.

## Coordinate system and state

Body axes: `u` forward, `v` to starboard, yaw `r` clockwise. Heading `psi=0` is screen/world north (negative world y). World coordinates are in metres.

- `u, v`: longitudinal and lateral body-relative velocities [m/s].
- `r`: yaw rate [rad/s].
- `psi`: heading [rad].
- `delta`: actual rudder angle [rad].
- `t`: ahead/astern control in `[-1, 1]`.

The model integrates

```text
m_x * u_dot = X + m_y * v*r
m_y * v_dot = Y - m_x * u*r
 I  * r_dot = N + (m_x - m_y)*u*v
 psi_dot = r

world_vx = u*sin(psi) + v*cos(psi)
world_vy = -u*cos(psi) + v*sin(psi)
```

where `m_x`, `m_y` and `I` include diagonal water-added inertia. The translational model, yaw and world motion are coupled.

### Rigid hull / added mass

`m=14,000 kg`, length `L=14.6 m`, beam `2.08 m`, approximate draft `0.65 m`. The dry yaw moment is `m*(0.29L)^2`. Added inertia is set at 8% of mass for surge, 72% for sway, and 80% of the dry yaw inertia (v0.2.1 tuning). These are **assumed tunables**, not measured for this hull.

### Propulsion and longitudinal resistance (v0.3.0)

The previous constant-thrust and lumped drag model is replaced by a **separated, speed-dependent** longitudinal force model in `src/hydrodynamics.js`.

**ITTC-1957 viscous friction:**

```text
Re = V*L/nu                      (nu = 1.004e-6 m^2/s, fresh water at 20 C)
Cf = 0.075 / (log10(Re)-2)^2
S = L*(B+2*T) + 1.2*B*T         (estimated box-like wetted surface, m^2)
Rf = 0.5*rho*S*V^2*Cf
Rform = Rf*0.30                  (estimated hull-form factor)
```

The ITTC friction law is a standard correlation, but the wetted-area approximation and form factor must be calibrated for a specific hull. A small linear drag term (80 N per m/s) is added for low-speed manoeuvring, where the turbulent ITTC law is not valid.

**Length-dependent wave residual:**

```text
FrL = V/sqrt(g*L)
Cwave = 0.015*(FrL/0.22)^4
Rwave = 0.5*rho*S*V^2*Cwave
```

This is a **gameplay approximation**, NOT an established empirical formula for British narrowboat wave resistance. The Froude scaling lets the wave-resistance contribution change with length. The visual bow wave is now linked to the calculated `Rwave` plus a portion of restricted-channel resistance, but it remains a stylised drawing rather than a free-surface fluid solution.

**Restricted water and Schijf limiting speed:**

```text
beta = (0.96*B*T)/(W*h)         (midship section factor estimated)
beta = 1 + 0.5*Fcrit^2 - 1.5*Fcrit^(2/3)
Vlim = Fcrit*sqrt(g*h)
q = V/Vlim
Rbase = Rf + Rform + Rwave + 80*V
Rrestricted = Rbase*8*(beta/(1-beta))*q^4/max(0.08,1-q^2)
Rtotal = Rbase + Rrestricted
```

The Schijf relation is a genuine hydraulic estimate of **limiting speed**, solved on the subcritical branch by bisection. It does **not** provide a force or resistance curve. The `Rrestricted` equation above is an *explicitly unvalidated*, regularised game approximation which increases sharply near that limit. Its coefficients should ultimately be fitted using restricted-water resistance measurements, not interpreted as a textbook law.

**Open-water propeller thrust:**

```text
n = 8.8*sqrt(abs(throttle))                 (shaft rotations/s)
D = 0.52 m                                 (assumed diameter)
J = 0.85*u/(signed_n*D)                    (estimated wake fraction)
KT(J) = clamp(0.29-0.60*J,0,0.52)         (assumed linear KT curve)
Fprop = sign(throttle)*rho*n^2*D^4*KT*(1-0.05)*f_reverse
f_reverse = 1 ahead / 0.55 astern
```

`rho*n^2*D^4*KT(J)` is the textbook propeller force relationship. The particular propeller K_T curve, shaft-RPM schedule, wake fraction, and thrust deduction are **estimates**, not narrowboat propeller data. Shaft speed responds instantaneously in this prototype and engine torque/power limits are not modelled yet.

The rudder's wash velocity is derived from actual forward propeller thrust so steering and longitudinal propulsion stay connected. At steady speed, thrust and total resistance balance; there is no arbitrary mph clamp. The baseline model predicts about **3.68 mph** at full ahead in a straight 14 m-wide, 1.55 m-deep canal, and about **2.83 mph** in a straight 5.4 m-wide, 1.2 m-deep canal. These are *simulated*, not measured speeds.

### Cross-flow and yaw

The submerged hull is divided into 9 strips, each with local lateral velocity `v + r*x`. Each strip applies opposite-direction linear and quadratic lateral force. The sum generates both the sideways damping force `Y` and yaw moment `N`. A small aft shift of the lateral resistance centre couples sideways movement to yaw.

The boat therefore keeps moving sideways/rotating after the rudder is straightened, until fluid forces damp that motion. Countersteering takes anticipation.

### Rudder and direct tiller

The mechanical tiller and rudder move **together**, but a person can only move them so quickly. The requested setting is rate-limited rather than delayed with a software time constant:

```text
target_delta = clamp(tiller,-1,1) * maxRudder
delta_next = delta + clamp(target_delta-delta, -maxRudderRate*dt, maxRudderRate*dt)
maxRudderRate = 2.2 rad/s (around 0.3 s centre-to-full lock)
```

The displayed tiller and prop wash follow the resulting actual rudder angle.

The rudder is at the stern, with turning moment `N_rudder = x_r * Y_rudder`. Lateral force scales with approximate local flow squared and a saturated foil lift curve. When propelling ahead, a simulated jet through the propeller gives positive flow at the rudder even at zero boat speed, so the bow starts rotating under ahead power from a standstill (while the boat still has inertia). In astern the effect is far weaker because propeller flow goes forward and largely bypasses the stern rudder.

The visual propeller jet is deflected by the same **actual rudder angle**. It has no extra artificial input delay.

### Restricted water and bank forces

The route supplies local width/depth and approximate port/starboard bank clearance at the bow and stern. A closer bank produces greater force (varying with forward speed squared):

- Bow pressure pushes the bow **away** from a nearby bank.
- Stern suction draws the stern **towards** the bank.

The force applies a moment about the CG and can change the intended heading. Collision handling remains a separate gameplay response/penalty. This bank-force model is deliberately simplified and can behave poorly at extreme hull angles or clearances; revisit its geometry after measured validation.

## Right-half-plane poles and steering control

The tiller/rudder connection has a short human movement-rate limit; delayed boat direction is the *plant* response. A sluggish response is not proof of a right-half-plane (RHP) pole.

The conventional first-order Nomoto yaw-rate model is

```text
T * r_dot + r = K * delta
pole = -1/T
```

An RHP pole at `-1/T > 0` indicates directional instability, not simply slow response. A **right-half-plane zero** is a separate concept and may manifest as inverse response. A full heading transfer function includes an integrator (`psi_dot=r`) at zero frequency; that is not an RHP instability.

In our 3-DOF model, `directionalPoles(speed, config, water)` numerically computes the two eigenvalues of the *frozen-speed*, small-perturbation sway/yaw Jacobian with the rudder fixed at centre. At **1.5 m/s** in the default channel with the baseline coefficients, the model currently gives approximate real poles of **approximately -0.11/s and -0.29/s** (both stable). This is a **prediction from the chosen parameters**, not a measured property of a narrowboat.

Using `lateralCentre: 10` deliberately makes one pole positive for testing that the model can identify directional instability; it is **not** a recommended or physically identified hull parameter.

Because equilibrium at nonzero speed requires a propulsive force, the frozen-speed calculation excludes surge dynamics and is a local **directional** analysis only, not a full equilibrium stability proof. An additional diagnostic, `nomotoAtSpeed(speed,config,water)` in `src/steering-analysis.js`, balances propeller thrust with resistance, linearises the yaw/sway dynamics, and calculates the **second-order Nomoto** transfer coefficients and transmission zero. At 1.25 m/s in the reference canal the estimated poles are approximately -0.176/s and -0.266/s, with a left-half-plane zero around -0.202/s. These are results from provisional model coefficients. Analysing wind/current remains future work.

## Calibration / validation plan

1. **Straight-line runs** across throttle notches and shaft speeds: measure acceleration, coasting and reverse stopping; fit propeller KT-J curve, hull form factor, wave residual and added surge mass.
2. **Rudder step / turning circle** at a known speed: compare rudder angle, yaw-rate rise, steady turning radius and stern swing. Fit rudder force, yaw inertia and lateral hull drag.
3. **Zigzag trials** (e.g. small alternating tiller angles): identify the steering gain and time constants; compare simulated/observed yaw-rate and heading curves.
4. **Deep/open versus shallow/narrow canal**: estimate speed loss and bank-force differences.
5. Repeat with multiple **boat lengths, displacements, draft values and powertrains** before inventing performance classes.
6. Compare actual time-trial completion times and lock approaches to determine whether the model is physically plausible *and* enjoyable.

Until validation, this is a *physics-informed prototype*, not a real narrowboat simulation.

## v0.2.1 steering feel

The rudder now has a short **finite manual sweep** without artificial transmission lag. Added yaw inertia was increased and crossflow damping reduced, producing more persistent yaw after releasing the tiller. This makes early countersteering important. These values remain gameplay-tuned estimates; physically measured rudder response, turning circles, and zigzag trials should determine eventual calibration. Default directional poles remain in the left half-plane.

## v0.3.1 — experimental Waterway Lab

The game now offers a second selectable course for comparing **identical boat controls and equipment** in different water conditions. Route selection changes only the canal centreline, bank geometry, material appearance, bridges, and lock coordinates: it does **not** alter the narrowboat's mass, engine, rudder, propeller or hydrodynamic coefficients.

| Section | Nominal width | Nominal depth | Bank material |
| --- | ---: | ---: | --- |
| Open meadow | 16.5 m | 2.25 m | Natural |
| Shallow narrows | 7.1 m | 0.98 m | Natural |
| Deep basin | 18.5 m | 2.65 m | Natural |
| Stone aqueduct | 7.4 m | 1.35 m | Stone trough |
| Winding earth cut | 10.5 m | 1.05 m | Natural |
| Brick cutting | 7.8 m | 1.55 m | Brick |
| Lock approach | 14.8 m | 2.20 m | Stone |

Channel width and depth blend over 24 m at zone boundaries to avoid discontinuous jumps in the hydrodynamic force. A small near-bank shoaling correction applies to the depth passed to the simulator. The aqueduct is drawn as an elevated masonry trough over a valley; **its elevation is cosmetic**. Physically, the model responds to the trough's reduced channel width and depth.

The course uses smoothed Hermite spline knots for its S-bends, including a nearly straight aqueduct. `checkBanks()` and `canalEnvironmentAt()` use the *same* local channel geometry. Simulated bow/sway hydrodynamics already depend on nominal depth, width, proximity to banks and steering. The course is fictional and is intended for qualitative sensitivity testing, not to predict speeds on a particular real waterway.

For a controlled comparison: hold the same throttle on the wide/deep section and on the shallow narrows, observe the speed and bow-wave intensity, then compare how much countersteering the narrow bends require. Run the original stage as the control.

Future validation should account for canal cross-section (trapezoidal versus rectangular), bank roughness, sediment, asymmetric return flow, current, squat and air exposure of an aqueduct. Those effects are **not fully modelled** by the current simplified Schijf-proximity penalty.

## v0.3.3 — course navigability and collision response

The shallow narrows of Stage 02 were initially too demanding: steeply alternating bends gave little practical reaction distance, and a 4.8-metre bridge opening was placed mid-bend. With the bridge collision geometry evaluated at its world-y cross-section, this could strike a correctly aligned 14.6-metre boat. A smaller related issue existed at the second test bridge. The test bridges are now on mostly straight, broad reaches, with **6.8-metre openings**.

Stage 02's shallow section has been widened from 7.1 to **8.6 metres**, retaining its **0.98-metre depth**, while nearby centreline changes were smoothed. This maintains a measurable restricted-water resistance penalty compared with the deep basin. Most other technical bends are more gradual, but still require anticipation.

A **0.035 m collision tolerance** now keeps very small hull/bank overlap from applying strong velocity damping every frame. This is a game-specific response to collision sampling, not a hydrodynamic coefficient. Deeper intersections progressively damp vessel velocity and yaw, and impacts still accumulate penalties.

A new deterministic `tests/navigation.test.js` controller uses look-ahead course tracking, the *actual* 3-DOF model and canal width/depth, and the gameplay collision and lock logic to drive each stage end-to-end. For both the classic and test route, it verifies no bank/bridge strikes and a stationary full-hull lock finish. The controller does not ship in the game. This is a regression guard for reachability, not an assumption about how quickly a human can complete the stage.

## v0.4.0 — visual progress and ghost controls

A ghost run is an interpolated, timestamped sequence of previously completed poses, stored per stage with the **adjusted score** (race time plus penalties). It is strictly cosmetic and does not create additional drag, bank effects, rudder interaction or collision penalties. Replays are rendered at the original elapsed race time; the ghost's displayed score may be longer owing to collision penalties. `src/ghost.js` validates recordings and limits memory/storage size. Existing personal bests from versions before ghost recording are retained without synthetic or invented replay data.

The new towpath, field plots, hedges, stone bridges and lock signs affect drawing only, not the force model, local channel depth, bank collision boundaries or lock finish tolerances. A later slow-speed-turn course should be designed around measured turning-circle and yaw tests, rather than adding an arbitrary steering boost.

## v0.4.1 — gameplay docking tolerances

Lock detection continues to use the entire 14.6 m × 2.08 m hull footprint in `insideLock`, including 0.15 m wall/threshold margins. The gameplay finish rule previously demanded ground speed below 0.08 m/s, yaw rate below 0.025 rad/s and 1.4 uninterrupted seconds; this was significantly stricter than the apparent speed and natural longitudinal coasting of a 14-tonne vessel.

The new, separate `src/lock-stop.js` acceptance logic uses **speed over ground below 0.16 m/s**, **yaw rate below 0.040 rad/s**, and **1.2 seconds** of hold. Minor spikes up to 0.23 m/s or 0.060 rad/s subtract partial hold progress at 1.5× time rather than resetting it; substantial movement or leaving the chamber resets to zero. This is a game-specific *docking acceptance tolerance*, not an artificial hydrodynamic damping or speed limit. No force coefficients or rudder physics are changed.

The speedometer now reports `hypot(vx,vy)` (ground speed), matching the finish condition rather than only the ahead velocity `u`. A near-lock indicator displays the whole-hull status, motion/turning blocker and hold progress. The complete course navigation regression now checks the same docking condition used in gameplay.

## v0.4.3 — docking preference

The lock finish now requires **full-hull containment** anywhere in the chamber plus **0.08 m/s maximum ground speed** continuously for **2 seconds**. Full-sized hull corners are checked, with a 5 cm geometric tolerance. No target at the lock centre and no separate yaw-rate gating are used; rotation matters only insofar as it causes a hull corner to cross the chamber boundary. Small speed fluctuations up to 0.105 m/s reduce accumulated hold progress; larger speeds reset it. The two-decimal speed readout near the lock clarifies the 0.18 mph limit. No changes are made to the hydrodynamic or steering model.

## v0.5.0 — winding-hole low-speed turning experiment

Stage 03 exercises the existing coupled surge/sway/yaw model without altering any boat coefficients. A newly shaped spline dogleg shifts the canal centreline sideways by 35 metres over a short turning reach; near its apex the geometric curvature radius is approximately 7 m. Channel width grows to 27 m in the winding hole to let a 14.6 m boat pivot and use the stern swing. Its entrance and exit are considerably narrower, so high cruising speeds are risky.

The stone wharf at the basin exit is a **real collision obstacle**, not an invisible speed gate. Hull strip samples intersecting the rectangular quay experience lateral correction, speed/yaw damping and a penalty on significant impacts. The wharf is rendered using exactly the same metre coordinates as the collision geometry.

The helmsman in `tests/technical-navigation.test.js` begins braking before the corner and applies intermittent forward thrust with the tiller deflected, using propeller wash for heading control while keeping speed down. Its successful lock finish, absence of collisions and a separate full-ahead late-turn impact demonstrate a useful difference in playable strategy. This is an engineering/gameplay proof of a *possible* route and does not prove there is no skilled flat-out route. Rudder force, engine thrust and bank hydrodynamics are unchanged from v0.4.3.

## v0.5.1 — true 90° right turn after bridge (Stage 03)

Stage 03 now has a **two-dimensional** canal path with a northbound approach, a right-hand **quarter-circle of radius 9 m**, a genuine eastbound straight and a subsequent gentler left bend that returns to a northbound lock approach. The stone bridge centre is at (x=0, y=-93); the right-hand curve starts at (x=0, y=-115), exactly **22 m downstream**, or **1.51 × the 14.6 m test boat length**. The turn heading changes from 0° to 90°, not merely to a steep diagonal approximating a right angle.

The original two courses still have width and centreline specified as functions of world y. This no longer works for Stage 03's horizontal leg, so `src/technical-route.js` samples its physical centreline in world x/y and provides nearest-segment projection with curvilinear distance `s`, local depth/width, tangent and bank clearance. The *same* path and width data draw the water and detect collisions. The hull's 15 distributed strip sample points are checked against the local half-width. Collision correction uses both x and y components of the inward normal, making the eastbound canal's north/south banks solid. The speed-dependent hydrodynamic canal inputs and bank force estimates are based on the boat's nearest 2D canal section, not a false `centreAt(y)` lookup.

A real stone bridge of **4.2 m opening** constrains early sideways steering. Through the 90° curve the width is approximately **10.5 m**. A small stone-bank impact of more than 3.5 cm at substantial speed can be penalised in Stage 03; it is not a phantom speed checkpoint. The unchanged 3-DOF boat model retains its rudder propeller wash, sway/yaw inertia and throttle-reverse braking. Representative test-only controllers demonstrate a collision-free slower passage using ahead thrust pulses, and a full-ahead late-turn trajectory that scrapes a bank. These tests validate plausible navigability and a *riskier ordinary fast line*, not a mathematical proof that no expert full-speed line exists.

Stage 01 and Stage 02 paths, waterway geometries and docking rules remain unchanged. Stage 03 is a replacement for the broad winding-hole prototype from v0.5.0.
