# ClothLab

ClothLab is a browser-based final project for an advanced computer graphics topic: **mass-spring cloth simulation with collision handling, interactive controls, and real-time WebGL rendering**. The repository is organized as a submission-ready package with source code, a runnable demo, benchmark artifacts, a final report file, and presentation/collaboration templates.

## Project Scope

This project demonstrates:

- A cloth represented as a 2D grid of particles connected by structural, shear, and bend springs.
- Verlet-style integration with damping.
- Iterative spring constraint projection for stability.
- Real-time external forces including gravity and animated wind.
- Collisions against a moving sphere and static floor plane.
- Interactive WebGL rendering with shaded surface display and optional wireframe overlay.
- Multiple presets to show different behaviors: drape, banner, and free-fall drop test.
- Runtime metrics for stretch error, average height, and simulation state.
- Per-vertex strain heatmap visualization for inspecting where the cloth is under the most stress.
- Fabric presets with distinct motion behavior: silk, canvas, velvet, and rubber sheet.
- Exportable PNG and JSON artifacts from the live demo.
- Offline benchmark generation for reproducible grading artifacts.

## How To Run

Because the app is written as ES modules, serve the repository with any simple static web server.

### Option 1: One-Command Python Launcher

```bash
python3 run.py
```

This starts the server, picks an open port automatically if `8000` is busy, and attempts to open the browser for you.

### Option 2: Included Server Script

```bash
npm run serve
```

Then open `http://127.0.0.1:8000` in a modern browser.

### Option 3: Plain Python

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

### Option 4: VS Code Live Server / any static server

Serve the repo root and open `index.html`.

## Verification And Artifact Generation

```bash
npm run check
npm run benchmark
```

These commands:

- syntax-check the browser and benchmark code
- generate `artifacts/benchmark-summary.json`
- generate `artifacts/benchmark-table.csv`

## Controls

- Drag in the viewport to orbit the camera.
- Scroll to zoom.
- Use `Preset` to switch between scenes.
- Use `Grid Resolution` to increase or decrease simulation complexity.
- Increase `Solver Substeps` for improved stability.
- Toggle `Wireframe overlay` to inspect the cloth mesh.
- Toggle `Normal tint` to visualize changing normals.
- Toggle `Strain heatmap` to visualize local deformation intensity.
- Switch `Fabric Preset` to compare how different material parameters change the motion.
- Toggle `Show pin markers` to display constrained vertices.
- Enable or disable wind, floor collision, and sphere collision for comparisons.
- Use `Capture PNG` and `Export Metrics JSON` to create submission artifacts.

## Recommended Demo Flow

For the class presentation:

1. Start with `Curtain Drape` and explain the particle grid, spring families, and collision sphere.
2. Toggle `Wireframe overlay` to show the mesh and deformation.
3. Increase wind and gust variation to show dynamic response.
4. Switch to `Wind Banner` to show corner pinning and a different boundary condition.
5. Switch to `Drop Test` to show free-fall behavior and floor interaction.
6. Turn off sphere or floor collisions briefly to discuss failure cases and why constraints matter.

## Repository Layout

- `index.html`: application shell and controls
- `styles.css`: interface styling
- `src/cloth.js`: simulation state, force accumulation, integration, constraints, and collisions
- `src/renderer.js`: WebGL renderer and camera controls
- `src/main.js`: app wiring, UI bindings, animation loop
- `src/utils.js`: shared helpers for math and artifact downloads
- `scripts/serve.py`: simple cross-platform local server
- `run.py`: one-command launcher that finds a free port and opens the demo
- `scripts/benchmark.mjs`: deterministic benchmark/artifact generator
- `artifacts/benchmark-summary.json`: generated benchmark data
- `artifacts/benchmark-table.csv`: generated summary table
- `report/final-report.rtf`: submission-ready written report in a Word-compatible format
- `docs/presentation-outline.md`: suggested demo flow for the final presentation
- `TEAM_COLLABORATION_REPORT_TEMPLATE.md`: individual collaboration report template

## Graphics / Algorithm Notes

The cloth is modeled as particles connected by springs:

- Structural springs preserve horizontal and vertical spacing.
- Shear springs resist diagonal distortion.
- Bend springs preserve larger-scale smoothness across two-edge spans.

The simulator uses **Verlet integration**:

- Velocity is implicit, derived from current and previous positions.
- Damping is applied by shrinking the position delta each frame.
- External forces are accumulated per particle before integration.

After each integration step, the solver performs multiple iterations of **distance constraint projection** over all springs. This keeps the cloth from stretching excessively and is substantially more stable than naively applying Hooke's law with large timesteps in a simple explicit integrator.

For wind, the renderer-facing mesh is also used to compute a more physically motivated **triangle-based aerodynamic force**. Instead of pushing each particle with the same ad hoc impulse, the solver evaluates each cloth triangle using its current area, normal direction, and relative wind velocity, then distributes an area-weighted drag force back to the triangle's three vertices. This produces richer folds and more directional response than a uniform per-particle wind field.

## Included Submission Artifacts

- Interactive executable demo runnable in a browser on Ubuntu, macOS, and Windows
- Benchmark JSON and CSV artifacts for quantitative evaluation
- Word-compatible written report at `report/final-report.rtf`
- README with run instructions and grading context
- Presentation outline and collaboration report template

## Known Limitations

- The current implementation does not include self-collision, tearing, or adaptive remeshing.
- Collision response is geometric projection, not impulse-based contact mechanics.
- The scene is optimized for clarity and portability rather than photorealistic rendering.
- The solver is tuned for interactive educational demos, not high-accuracy offline simulation.

## Submission Checklist

- [x] Full source code
- [x] README with run instructions
- [x] Interactive demo suitable for screen capture
- [x] Word-compatible writeup included
- [x] Benchmark artifacts included
- [ ] Optional screenshots or video capture added before submission
- [ ] Collaboration report submitted by each team member if working in a pair
- [ ] README statement added if all team members completed the course survey extra credit requirement

## Extra Credit Survey Statement Placeholder

If you complete the instructor survey, add a sentence like this before submission:

> On our honor, all team members completed the online course instructor survey.
