# Presentation Outline

## Slide / Demo 1: Problem Statement

- The project implements real-time cloth simulation, an advanced graphics topic not covered in the earlier assignments.
- The main goals are stable deformation, interactive parameter control, and cross-platform portability.

## Slide / Demo 2: Modeling Choices

- Represent cloth as a particle grid.
- Use structural, shear, and bend springs.
- Explain pinned boundary conditions for drape and banner scenes.

## Slide / Demo 3: Numerical Method

- Explain Verlet integration and why it is a good fit for interactive cloth.
- Explain iterative distance-constraint projection.
- Mention gravity, animated wind, sphere collision, and floor projection.

## Slide / Demo 4: Live Demo Sequence

1. Start with `Curtain Drape`.
2. Turn on `Wireframe overlay` and `Show pin markers`.
3. Increase wind and gust strength.
4. Switch to `Wind Banner`.
5. Switch to `Drop Test`.
6. Export a metrics JSON or capture a PNG live if useful.

## Slide / Demo 5: Results And Limitations

- Show the benchmark CSV table and one or two screenshots.
- Discuss what improves with more substeps and higher resolution.
- Discuss missing self-collision, friction, and tearing as future work.
