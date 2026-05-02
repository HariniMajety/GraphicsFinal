import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ClothSimulation } from "../src/cloth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const artifactDir = path.join(repoRoot, "artifacts");

function configureResolution(simulation, value) {
  const [width, height] = value.split("x").map(Number);
  simulation.width = width;
  simulation.height = height;
}

async function runScenario({ preset, resolution, seconds, fps, overrides = {} }) {
  const simulation = new ClothSimulation();
  configureResolution(simulation, resolution);
  simulation.applyPreset(preset);
  for (const [key, value] of Object.entries(overrides)) {
    simulation.setParam(key, value);
  }

  const frames = seconds * fps;
  const dt = 1 / fps;
  const series = [];

  for (let frame = 0; frame < frames; frame += 1) {
    if (simulation.params.sphereEnabled && preset !== "banner") {
      simulation.dragSphere(frame * dt);
    }
    simulation.step(dt);
    if (frame % 30 === 0 || frame === frames - 1) {
      const stats = simulation.getStats();
      series.push({
        frame,
        seconds: Number((frame * dt).toFixed(2)),
        averageStretchPercent: Number(stats.averageStretchPercent.toFixed(4)),
        maxStretchPercent: Number(stats.maxStretchPercent.toFixed(4)),
        averageHeight: Number(stats.averageHeight.toFixed(4)),
      });
    }
  }

  const finalStats = simulation.getStats();
  return {
    preset,
    resolution,
    seconds,
    fps,
    overrides,
    finalStats: {
      ...finalStats,
      averageStretchPercent: Number(finalStats.averageStretchPercent.toFixed(4)),
      maxStretchPercent: Number(finalStats.maxStretchPercent.toFixed(4)),
      averageHeight: Number(finalStats.averageHeight.toFixed(4)),
    },
    series,
  };
}

async function main() {
  const scenarios = [
    { preset: "drape", resolution: "26x18", seconds: 8, fps: 60, overrides: { windEnabled: true, windStrength: 7.5, gustStrength: 1.8 } },
    { preset: "banner", resolution: "34x24", seconds: 8, fps: 60, overrides: { windEnabled: true, windStrength: 11.0, gustStrength: 2.8, substeps: 8 } },
    { preset: "drop", resolution: "26x18", seconds: 8, fps: 60, overrides: { windEnabled: false, sphereEnabled: true, floorEnabled: true } },
    { preset: "drape", resolution: "18x12", seconds: 8, fps: 60, overrides: { windEnabled: true, substeps: 3 } },
  ];

  const results = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario));
  }

  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(path.join(artifactDir, "benchmark-summary.json"), `${JSON.stringify(results, null, 2)}\n`);

  const csvLines = [
    "preset,resolution,seconds,avg_stretch_percent,max_stretch_percent,avg_height,vertices,springs,wind_enabled,substeps",
    ...results.map((result) => {
      const stats = result.finalStats;
      return [
        result.preset,
        result.resolution,
        result.seconds,
        stats.averageStretchPercent,
        stats.maxStretchPercent,
        stats.averageHeight,
        stats.vertexCount,
        stats.springCount,
        stats.windEnabled,
        stats.substeps,
      ].join(",");
    }),
  ];
  await fs.writeFile(path.join(artifactDir, "benchmark-table.csv"), `${csvLines.join("\n")}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
