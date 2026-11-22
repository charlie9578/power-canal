# Power Canal physics model (v0.2.1)

## Scope and confidence

The game now integrates a coupled **horizontal-plane three-degree-of-freedom (3-DOF)** manoeuvring model: surge, sway and yaw. This is an engineering **structure**, not a fully identified quantitative narrowboat model. The mass, water-added inertia, cross-flow force, propeller/rudder lift and canal-bank coefficients are estimates. Real narrowboat turning radii, stopping distances and stability can only be established after identifying parameters against measurements from comparable boats and canals.

The objective is to retain a plausible causal model without CFD, while making the coefficients adjustable for future boat classes.

### Primary sources

1. [Thor I. Fossen, *Marine Craft Model*](https://fossen.biz/html/marineCraftModel.html) — rigid-body/added-mass inertia, Coriolis and damping decomposition, and equations of motion.
2. [Fossen, *Handbook of Marine Craft Hydrodynamics and Motion Control*, Ch. 6 and 9](https://doi.org/10.1002/9781119575016.ch6) — manoeuvring models, cross-flow damping, rudder/propeller interaction.
3. [OE3036 lecture notes, Nomoto models](https://oe3036.mavlab.in/ch_05/ch_05_nomoto) — linear steering dynamics, course stability and Nomoto time constant.
4. [Practical Boat Owner, inland boating beginner's guide](https://www.pbo.co.uk/cruising/inland-boating-in-the-uk-a-beginners-guide-87875) — narrowboat rudder/propeller handling, inertia and stern swing.

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

### Propulsion and longitudinal drag

The positive ahead bollard-thrust estimate is 6.2 kN, with a 55% reverse-thrust factor. Speed-dependent drag combines linear and quadratic terms. The drag is multiplied by a monotone approximation based on channel blockage (underwater hull cross-section / waterway cross-section) and shallowness. It is **not** an accurate Froude/critical-depth squat or wave resistance solver.

Speed emerges by solving thrust and resistance, **not** from a hard maximum-speed clamp. Engine power is represented by available thrust; the combined lever's eleven notches map linearly to it for now.

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

A direct-linked tiller is an **actuator** (instantaneous angle here); delayed boat direction is the *plant* response. A sluggish response is not proof of a right-half-plane (RHP) pole.

The conventional first-order Nomoto yaw-rate model is

```text
T * r_dot + r = K * delta
pole = -1/T
```

An RHP pole at `-1/T > 0` indicates directional instability, not simply slow response. A **right-half-plane zero** is a separate concept and may manifest as inverse response. A full heading transfer function includes an integrator (`psi_dot=r`) at zero frequency; that is not an RHP instability.

In our 3-DOF model, `directionalPoles(speed, config, water)` numerically computes the two eigenvalues of the *frozen-speed*, small-perturbation sway/yaw Jacobian with the rudder fixed at centre. At **1.5 m/s** in the default channel with the baseline coefficients, the model currently gives approximate real poles of **approximately -0.11/s and -0.29/s** (both stable). This is a **prediction from the chosen parameters**, not a measured property of a narrowboat.

Using `lateralCentre: 10` deliberately makes one pole positive for testing that the model can identify directional instability; it is **not** a recommended or physically identified hull parameter.

Because equilibrium at nonzero speed requires a propulsive force, the frozen-speed calculation excludes surge dynamics and is a local **directional** analysis only, not a full equilibrium stability proof. Deriving steering transfer-function zeros and analysing wind/current are future tasks.

## Calibration / validation plan

1. **Straight-line runs** with several throttle notches: measure speed vs setting, acceleration, coast-down and reverse stopping distance. Fit thrust, forward drag and added surge mass.
2. **Rudder step / turning circle** at a known speed: compare rudder angle, yaw-rate rise, steady turning radius and stern swing. Fit rudder force, yaw inertia and lateral hull drag.
3. **Zigzag trials** (e.g. small alternating tiller angles): identify the steering gain and time constants; compare simulated/observed yaw-rate and heading curves.
4. **Deep/open versus shallow/narrow canal**: estimate speed loss and bank-force differences.
5. Repeat with multiple **boat lengths, displacements, draft values and powertrains** before inventing performance classes.
6. Compare actual time-trial completion times and lock approaches to determine whether the model is physically plausible *and* enjoyable.

Until validation, this is a *physics-informed prototype*, not a real narrowboat simulation.

## v0.2.1 steering feel

The rudder now has a short **finite manual sweep** without artificial transmission lag. Added yaw inertia was increased and crossflow damping reduced, producing more persistent yaw after releasing the tiller. This makes early countersteering important. These values remain gameplay-tuned estimates; physically measured rudder response, turning circles, and zigzag trials should determine eventual calibration. Default directional poles remain in the left half-plane.
