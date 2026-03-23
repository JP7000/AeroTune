# CO₂ Dragster Simulator

link: https://JP7000.github.io/AeroTune/

A physics-based race time predictor for CO₂-powered model dragsters, built as a single self-contained HTML file. No dependencies, no build step — just open it in a browser.

## Usage

Open `co2_dragster_sim.html` in any modern browser. No installation required.

---

## How to Use (for students)

### What you need before you sit down

| Measurement | Tool |
|---|---|
| Total car mass (assembled, with empty cartridge inserted, no CO₂ gas) | Scale / balance |
| Front and rear wheel diameter | Callipers |
| Front and rear wheel mass (each) | Scale / balance |
| Axle bore diameter (hole through wheel centre) | Callipers |
| Frontal area (cross-section of car from the front) | Graph paper or Fusion 360 |
| Drag coefficient (Cd) | Fusion 360 / SimScale, or use a shape preset |

### Steps

1. **Car Body** — Enter your total car mass. Weigh the car fully assembled with the empty cartridge already inserted, but no CO₂ gas. Enter your Cd and frontal area.

2. **Wheels** — Enter front and rear wheel diameters, masses, and the axle bore diameter. Wheels are modelled as annular discs (PLA): `I = ½m(R² + r_bore²)`.

3. **Axles** — Choose whether your axle is fixed (wheels spin on a stationary axle) or dynamic (axle rotates with the wheels). If dynamic, enter axle diameter and mass.

4. **Rolling Resistance** — Select the surface your car will race on. This sets the rolling resistance coefficient (μr).

5. **CO₂ & Environment** — Enter your track length. The simulator uses a standard 8g Pitsco cartridge with a measured thrust curve.

6. **Run** — Click **RUN SIMULATION**. Label and save runs to compare designs.

### Tips

- Use the **Save Run** button after each simulation to build a comparison table.
- The **race replay** animates all saved runs side by side.
- The sim is most useful for **comparing two designs** rather than predicting an exact time. Real tracks, puncture variation, and alignment all affect actual results.
- Jointed sheet-metal tracks typically run 8–12% slower than predicted.

---

## Physics Model

### Overview

The simulation uses Euler integration (`dt = 0.0001 s`) over the equation of motion:

```
a(t) = (F_thrust(t) - F_drag(t) - F_roll(t)) / m_eff(t)
```

### Thrust

CO₂ thrust follows an exponential decay fitted to measured Pitsco 8g cartridge data:

```
F_thrust(t) = F₀ · e^(−t/τ)    for t ≤ t_thrust
F_thrust(t) = 0                  for t > t_thrust
```

| Parameter | Value |
|---|---|
| Peak thrust F₀ | 18.3 N |
| Decay constant τ | 0.1174 s |
| Thrust duration | 0.45 s |

### CO₂ Mass Depletion

CO₂ mass depletes proportionally to instantaneous thrust, conserving total impulse:

```
J_total = F₀ · τ · (1 − e^(−t_thrust/τ))

dm/dt = (m_CO2_initial / J_total) · F_thrust(t)
```

This means gas is expelled quickly at the start (high thrust) and slows as pressure drops — matching real cartridge behaviour.

### Effective Mass

Rotational inertia of the wheels and (optionally) axles is accounted for by adding an equivalent translational mass:

```
m_eff = m_chassis + m_CO2(t) + m_rot
```

**Wheels** are modelled as annular discs (PLA with bore hole):

```
I_wheel = ½m(R_outer² + R_bore²)
m_rot contribution per wheel pair = m_wheel · (1 + (R_bore/R_outer)²)
```

**Dynamic axles** (solid cylinder):

```
I_axle = ½mr²  →  m_rot contribution per axle = ½m_axle
Two axles: adds m_axle_one to m_eff
```

### Drag

Standard aerodynamic drag:

```
F_drag = ½ · ρ · Cd · A · v²
```

Air density is fixed at 20°C: `ρ = 1.204 kg/m³`

### Rolling Resistance

```
F_roll = μr · m_total(t) · g
```

Rolling resistance updates each timestep as CO₂ mass depletes (dynamic). Typical values:

| Surface | μr |
|---|---|
| Plastic wheels · Aluminium track | 0.010 |
| Plastic wheels · Wood / MDF | 0.013 |
| Plastic wheels · Jointed sheet metal | 0.018 |
| Urethane wheels · Aluminium track | 0.008 |

---

## Limitations

- Thrust curve is fitted to **Pitsco 8g cartridge** data only. Other brands will vary.
- No guide string friction model.
- Track assumed to be perfectly flat and smooth.
- Air density is fixed at 20°C — not suitable for outdoor or temperature-variable environments.
- Cartridge-to-cartridge fill pressure variance is not modelled (expect ±5% real-world spread).

---

## File Structure

```
co2_dragster_sim.html    # entire app — single self-contained file
README.md
```

---

## License

For educational use.
