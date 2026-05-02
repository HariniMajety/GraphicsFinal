import { ClothSimulation, formatNumber } from "./cloth.js";
import { Renderer } from "./renderer.js";
import { downloadBlob, downloadText } from "./utils.js";

const canvas = document.getElementById("viewport");
const fpsReadout = document.getElementById("fps-readout");
const vertexReadout = document.getElementById("vertex-readout");
const springReadout = document.getElementById("spring-readout");
const brokenReadout = document.getElementById("broken-readout");
const stretchReadout = document.getElementById("stretch-readout");
const peakReadout = document.getElementById("peak-readout");
const heightReadout = document.getElementById("height-readout");
const windReadout = document.getElementById("wind-readout");
const scoreReadout = document.getElementById("score-readout");
const timerReadout = document.getElementById("timer-readout");
const statusReadout = document.getElementById("status-readout");

const controls = {
  preset: document.getElementById("preset-select"),
  resolution: document.getElementById("resolution-select"),
  substeps: document.getElementById("substeps"),
  stiffness: document.getElementById("stiffness"),
  damping: document.getElementById("damping"),
  gravity: document.getElementById("gravity"),
  wind: document.getElementById("wind"),
  gust: document.getElementById("gust"),
  pause: document.getElementById("pause-toggle"),
  windToggle: document.getElementById("wind-toggle"),
  sphereToggle: document.getElementById("sphere-toggle"),
  floorToggle: document.getElementById("floor-toggle"),
  tearToggle: document.getElementById("tear-toggle"),
  tearThreshold: document.getElementById("tear-threshold"),
  tearHeatToggle: document.getElementById("tear-heat-toggle"),
  wireframe: document.getElementById("wireframe-toggle"),
  normals: document.getElementById("normals-toggle"),
  strain: document.getElementById("strain-toggle"),
  pins: document.getElementById("pins-toggle"),
  reset: document.getElementById("reset-button"),
  capture: document.getElementById("capture-button"),
  metrics: document.getElementById("metrics-button"),
  challenge: document.getElementById("challenge-button"),
};

const outputs = {
  substeps: document.getElementById("substeps-value"),
  stiffness: document.getElementById("stiffness-value"),
  damping: document.getElementById("damping-value"),
  gravity: document.getElementById("gravity-value"),
  wind: document.getElementById("wind-value"),
  gust: document.getElementById("gust-value"),
  tearThreshold: document.getElementById("tear-threshold-value"),
};

const simulation = new ClothSimulation();
const renderer = new Renderer(canvas);
const challenge = {
  active: false,
  timeLeft: 0,
  duration: 20,
  score: 0,
  goal: 55,
  keys: new Set(),
};

function syncOutputs() {
  outputs.substeps.value = controls.substeps.value;
  outputs.stiffness.value = Number(controls.stiffness.value).toFixed(2);
  outputs.damping.value = Number(controls.damping.value).toFixed(3);
  outputs.gravity.value = Number(controls.gravity.value).toFixed(1);
  outputs.wind.value = Number(controls.wind.value).toFixed(1);
  outputs.gust.value = Number(controls.gust.value).toFixed(1);
  outputs.tearThreshold.value = Number(controls.tearThreshold.value).toFixed(2);
}

function pullControlsIntoSimulation() {
  simulation.setParam("substeps", Number(controls.substeps.value));
  simulation.setParam("stiffness", Number(controls.stiffness.value));
  simulation.setParam("damping", Number(controls.damping.value));
  simulation.setParam("gravity", Number(controls.gravity.value));
  simulation.setParam("windStrength", Number(controls.wind.value));
  simulation.setParam("gustStrength", Number(controls.gust.value));
  simulation.setParam("windEnabled", controls.windToggle.checked);
  simulation.setParam("sphereEnabled", controls.sphereToggle.checked);
  simulation.setParam("floorEnabled", controls.floorToggle.checked);
  simulation.setParam("tearingEnabled", controls.tearToggle.checked);
  simulation.setParam("tearThreshold", Number(controls.tearThreshold.value));
  renderer.setFlags({
    wireframe: controls.wireframe.checked,
    normalTint: controls.normals.checked && !controls.strain.checked,
    strainTint: controls.strain.checked || (controls.tearHeatToggle.checked && controls.tearToggle.checked),
    showPins: controls.pins.checked,
  });
}

function syncStats() {
  const stats = simulation.getStats();
  vertexReadout.textContent = String(stats.vertexCount);
  springReadout.textContent = String(stats.springCount);
  brokenReadout.textContent = String(stats.brokenSpringCount);
  stretchReadout.textContent = `${formatNumber(stats.averageStretchPercent, 2)}%`;
  peakReadout.textContent = `${formatNumber(stats.peakVertexStrainPercent, 2)}%`;
  heightReadout.textContent = formatNumber(stats.averageHeight, 2);
  windReadout.textContent = stats.windEnabled ? "On" : "Off";
  if (challenge.active) {
    challenge.score = stats.brokenSpringCount;
  }
  scoreReadout.textContent = String(challenge.score);
  timerReadout.textContent = formatNumber(challenge.timeLeft, 1);
}

function applyResolutionSetting() {
  const [width, height] = controls.resolution.value.split("x").map((value) => Number(value));
  simulation.width = width;
  simulation.height = height;
}

function setChallengeStatus(status) {
  statusReadout.textContent = status;
}

function stopChallenge(status = "Idle") {
  challenge.active = false;
  challenge.keys.clear();
  challenge.timeLeft = 0;
  controls.challenge.textContent = "Start Challenge";
  setChallengeStatus(status);
}

function resetToPreset() {
  if (challenge.active) {
    stopChallenge("Idle");
  }
  applyResolutionSetting();
  simulation.applyPreset(controls.preset.value);
  renderer.resetCameraForPreset(controls.preset.value);
  if (controls.preset.value === "banner") {
    controls.windToggle.checked = true;
    controls.sphereToggle.checked = false;
    controls.floorToggle.checked = true;
    controls.tearToggle.checked = false;
  } else if (controls.preset.value === "drop") {
    controls.windToggle.checked = false;
    controls.sphereToggle.checked = true;
    controls.floorToggle.checked = true;
    controls.tearToggle.checked = false;
  } else {
    controls.windToggle.checked = true;
    controls.sphereToggle.checked = true;
    controls.floorToggle.checked = true;
    controls.tearToggle.checked = false;
  }
  pullControlsIntoSimulation();
  challenge.score = 0;
  syncStats();
  setChallengeStatus("Idle");
}

function startChallenge() {
  controls.preset.value = "drape";
  controls.resolution.value = "34x24";
  controls.windToggle.checked = true;
  controls.sphereToggle.checked = true;
  controls.floorToggle.checked = true;
  controls.tearToggle.checked = true;
  controls.tearHeatToggle.checked = true;
  controls.strain.checked = false;
  controls.pins.checked = false;
  controls.wireframe.checked = false;
  controls.tearThreshold.value = "0.22";
  controls.substeps.value = "10";
  controls.stiffness.value = "0.78";
  controls.damping.value = "0.993";
  controls.wind.value = "8.0";
  controls.gust.value = "2.1";
  syncOutputs();
  applyResolutionSetting();
  simulation.applyPreset("drape");
  simulation.setPinMode("corners");
  simulation.sphere.radius = 0.62;
  simulation.setSpherePosition(-0.2, 1.35, 0.12);
  renderer.resetCameraForPreset("drape");
  renderer.camera.orbitX = -0.22;
  renderer.camera.orbitY = 0.96;
  renderer.camera.distance = 7.8;
  renderer.camera.target = [0.0, 1.15, 0.0];
  pullControlsIntoSimulation();
  challenge.active = true;
  challenge.timeLeft = challenge.duration;
  challenge.score = 0;
  challenge.keys.clear();
  controls.challenge.textContent = "Restart Challenge";
  setChallengeStatus(`Break ${challenge.goal} springs`);
  syncStats();
}

function updateChallenge(deltaSeconds) {
  if (!challenge.active) {
    return;
  }

  challenge.timeLeft = Math.max(0, challenge.timeLeft - deltaSeconds);
  const speed = 1.45 * deltaSeconds;
  let moveX = 0;
  let moveY = 0;
  if (challenge.keys.has("arrowleft") || challenge.keys.has("a")) {
    moveX -= 1;
  }
  if (challenge.keys.has("arrowright") || challenge.keys.has("d")) {
    moveX += 1;
  }
  if (challenge.keys.has("arrowup") || challenge.keys.has("w")) {
    moveY += 1;
  }
  if (challenge.keys.has("arrowdown") || challenge.keys.has("s")) {
    moveY -= 1;
  }

  const nextX = Math.max(-1.6, Math.min(1.6, simulation.sphere.center[0] + moveX * speed));
  const nextY = Math.max(0.35, Math.min(2.15, simulation.sphere.center[1] + moveY * speed));
  simulation.setSpherePosition(nextX, nextY, 0.15);

  if (challenge.timeLeft <= 0) {
    const won = challenge.score >= challenge.goal;
    stopChallenge(won ? "Challenge Clear" : "Time Up");
  }
}

for (const [name, element] of Object.entries(controls)) {
  if (name === "reset" || name === "capture" || name === "metrics" || name === "challenge") {
    continue;
  }
  element.addEventListener("input", () => {
    syncOutputs();
    if (name === "preset" || name === "resolution") {
      resetToPreset();
      return;
    }
    pullControlsIntoSimulation();
  });
}

controls.reset.addEventListener("click", resetToPreset);
controls.challenge.addEventListener("click", startChallenge);
controls.capture.addEventListener("click", () => {
  canvas.toBlob((blob) => {
    if (!blob) {
      return;
    }
    downloadBlob(`clothlab-${controls.preset.value}.png`, blob);
  });
});

controls.metrics.addEventListener("click", () => {
  const stats = simulation.getStats();
  const payload = {
    project: "ClothLab",
    timestamp: new Date().toISOString(),
    preset: controls.preset.value,
    resolution: controls.resolution.value,
    stats,
  };
  downloadText(`clothlab-metrics-${controls.preset.value}.json`, JSON.stringify(payload, null, 2));
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s"].includes(key)) {
    challenge.keys.add(key);
    if (challenge.active) {
      event.preventDefault();
    }
  }
});

window.addEventListener("keyup", (event) => {
  challenge.keys.delete(event.key.toLowerCase());
});

syncOutputs();
resetToPreset();

let previousTime = performance.now();
let frameAccumulator = 0;
let frameCounter = 0;

function animate(now) {
  const deltaSeconds = (now - previousTime) / 1000;
  previousTime = now;

  if (!controls.pause.checked) {
    if (challenge.active) {
      updateChallenge(deltaSeconds);
    } else if (simulation.params.sphereEnabled && controls.preset.value === "drape") {
      simulation.dragSphere(now / 1000);
    }
    simulation.step(deltaSeconds);
  }

  renderer.render(simulation);
  syncStats();

  frameAccumulator += deltaSeconds;
  frameCounter += 1;
  if (frameAccumulator >= 0.25) {
    fpsReadout.textContent = formatNumber(frameCounter / frameAccumulator, 0);
    frameAccumulator = 0;
    frameCounter = 0;
  }

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
