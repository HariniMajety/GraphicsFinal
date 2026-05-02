# Artifact Guide

This folder contains gradeable artifacts produced by the project implementation.

## Included Files

- `benchmark-summary.json`: time-series benchmark data from several simulation scenarios
- `benchmark-table.csv`: compact summary table for inclusion in slides or the report

## How To Regenerate

```bash
npm run benchmark
```

or

```bash
node scripts/benchmark.mjs
```

## Suggested Use In Submission

- Include the CSV table in the written report or presentation.
- Capture one or two viewport PNGs from the live app using the `Capture PNG` button.
- Mention that the benchmark scenarios demonstrate behavior under different resolutions, wind settings, and constraint budgets.
