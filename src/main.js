import { ClothSimulation, formatNumber } from "./cloth.js";
import { Renderer } from "./renderer.js";

const canvas = document.getElementById("viewport");
const fpsReadout = document.getElementById("fps-readout");
const vertexReadout = document.getElementById("vertex-readout");
const springReadout = document.getElementById("spring-readout");
const materialReadout = document.getElementById("material-readout");
const stretchReadout = document.getElementById("stretch-readout");
const peakReadout = document.getElementById("peak-readout");
const heightReadout = document.getElementById("height-readout");
const windReadout = document.getElementById("wind-readout");

const controls = {
  preset: document.getElementById("preset-select"),
  resolution: document.getElementById("resolution-select"),
  material: document.getElementById("material-select"),
  substeps: document.getElementById("substeps"),
  stiffness: document.getElementById("stiffness"),
  damping: document.getElementById("damping"),
  gravity: document.getElementById("gravity"),
  wind: document.getElementById("wind"),
  gust: document.getElementById("gust"),
  floorFriction: document.getElementById("floor-friction"),
  sphereFriction: document.getElementById("sphere-friction"),
  pause: document.getElementById("pause-toggle"),
  windToggle: document.getElementById("wind-toggle"),
  sphereToggle: document.getElementById("sphere-toggle"),
  floorToggle: document.getElementById("floor-toggle"),
  wireframe: document.getElementById("wireframe-toggle"),
  normals: document.getElementById("normals-toggle"),
  strain: document.getElementById("strain-toggle"),
  pins: document.getElementById("pins-toggle"),
  reset: document.getElementById("reset-button"),
};

const outputs = {
  substeps: document.getElementById("substeps-value"),
  stiffness: document.getElementById("stiffness-value"),
  damping: document.getElementById("damping-value"),
  gravity: document.getElementById("gravity-value"),
  wind: document.getElementById("wind-value"),
  gust: document.getElementById("gust-value"),
  floorFriction: document.getElementById("floor-friction-value"),
  sphereFriction: document.getElementById("sphere-friction-value"),
};

const simulation = new ClothSimulation();
const renderer = new Renderer(canvas);

function syncOutputs() {
  outputs.substeps.value = controls.substeps.value;
  outputs.stiffness.value = Number(controls.stiffness.value).toFixed(2);
  outputs.damping.value = Number(controls.damping.value).toFixed(3);
  outputs.gravity.value = Number(controls.gravity.value).toFixed(1);
  outputs.wind.value = Number(controls.wind.value).toFixed(1);
  outputs.gust.value = Number(controls.gust.value).toFixed(1);
  outputs.floorFriction.value = Number(controls.floorFriction.value).toFixed(2);
  outputs.sphereFriction.value = Number(controls.sphereFriction.value).toFixed(2);
}

function applyMaterialPreset(name) {
  if (name === "basic") {
    controls.substeps.value = "7";
    controls.stiffness.value = "0.74";
    controls.damping.value = "0.993";
    controls.wind.value = "5.0";
    controls.gust.value = "1.1";
    controls.floorFriction.value = "0.34";
    controls.sphereFriction.value = "0.18";
    return;
  }
  if (name === "canvas") {
    controls.substeps.value = "8";
    controls.stiffness.value = "1.02";
    controls.damping.value = "0.997";
    controls.wind.value = "3.4";
    controls.gust.value = "0.6";
    controls.floorFriction.value = "0.62";
    controls.sphereFriction.value = "0.40";
    return;
  }
  if (name === "velvet") {
    controls.substeps.value = "10";
    controls.stiffness.value = "0.88";
    controls.damping.value = "0.998";
    controls.wind.value = "2.2";
    controls.gust.value = "0.3";
    controls.floorFriction.value = "0.76";
    controls.sphereFriction.value = "0.52";
    return;
  }
  if (name === "rubber") {
    controls.substeps.value = "12";
    controls.stiffness.value = "1.18";
    controls.damping.value = "0.985";
    controls.wind.value = "1.2";
    controls.gust.value = "0.1";
    controls.floorFriction.value = "0.90";
    controls.sphereFriction.value = "0.72";
    return;
  }
  controls.substeps.value = "6";
  controls.stiffness.value = "0.52";
  controls.damping.value = "0.989";
  controls.wind.value = "11.5";
  controls.gust.value = "3.2";
  controls.floorFriction.value = "0.14";
  controls.sphereFriction.value = "0.08";
}

function applyPresetToggleDefaults() {
  if (controls.preset.value === "banner") {
    controls.windToggle.checked = true;
    controls.sphereToggle.checked = false;
    return;
  }
  if (controls.preset.value === "drop") {
    controls.windToggle.checked = false;
    controls.sphereToggle.checked = true;
    return;
  }
  controls.windToggle.checked = true;
  controls.sphereToggle.checked = true;
}

function syncViewModeToggles(changedControl) {
  if (changedControl === "normals" && controls.normals.checked) {
    controls.strain.checked = false;
  }
  if (changedControl === "strain" && controls.strain.checked) {
    controls.normals.checked = false;
  }
}

function pullControlsIntoSimulation() {
  simulation.setParam("substeps", Number(controls.substeps.value));
  simulation.setParam("stiffness", Number(controls.stiffness.value));
  simulation.setParam("damping", Number(controls.damping.value));
  simulation.setParam("gravity", Number(controls.gravity.value));
  simulation.setParam("windStrength", Number(controls.wind.value));
  simulation.setParam("gustStrength", Number(controls.gust.value));
  simulation.setParam("floorFriction", Number(controls.floorFriction.value));
  simulation.setParam("sphereFriction", Number(controls.sphereFriction.value));
  simulation.setParam("windEnabled", controls.windToggle.checked);
  simulation.setParam("sphereEnabled", controls.sphereToggle.checked);
  simulation.setParam("floorEnabled", controls.floorToggle.checked);
  simulation.setParam("tearingEnabled", false);
  simulation.setMaterialPreset(controls.material.value);
  renderer.setFlags({
    wireframe: controls.wireframe.checked,
    normalTint: controls.normals.checked,
    strainTint: controls.strain.checked,
    showPins: controls.pins.checked,
  });
}

function syncStats() {
  const stats = simulation.getStats();
  vertexReadout.textContent = String(stats.vertexCount);
  springReadout.textContent = String(stats.springCount);
  materialReadout.textContent = controls.material.options[controls.material.selectedIndex].text;
  stretchReadout.textContent = `${formatNumber(stats.averageStretchPercent, 2)}%`;
  peakReadout.textContent = `${formatNumber(stats.peakVertexStrainPercent, 2)}%`;
  heightReadout.textContent = formatNumber(stats.averageHeight, 2);
  windReadout.textContent = stats.windEnabled ? "On" : "Off";
}

function applyResolutionSetting() {
  const [width, height] = controls.resolution.value.split("x").map((value) => Number(value));
  simulation.width = width;
  simulation.height = height;
}

function rebuildScene({ resetCamera = false } = {}) {
  applyResolutionSetting();
  simulation.applyPreset(controls.preset.value);
  if (resetCamera) {
    renderer.resetCameraForPreset(controls.preset.value);
  }
  pullControlsIntoSimulation();
  syncStats();
}

function resetToPreset() {
  applyPresetToggleDefaults();
  applyMaterialPreset(controls.material.value);
  syncViewModeToggles();
  syncOutputs();
  rebuildScene({ resetCamera: true });
}

function resetScenePreservingControls() {
  syncViewModeToggles();
  syncOutputs();
  rebuildScene({ resetCamera: true });
}

for (const [name, element] of Object.entries(controls)) {
  if (name === "reset") {
    continue;
  }
  element.addEventListener("input", () => {
    if (name === "material") {
      applyMaterialPreset(controls.material.value);
      syncOutputs();
      rebuildScene();
      return;
    }
    if (name === "preset" || name === "resolution") {
      if (name === "preset") {
        resetToPreset();
        return;
      }
      syncOutputs();
      rebuildScene();
      return;
    }
    syncViewModeToggles(name);
    syncOutputs();
    pullControlsIntoSimulation();
    syncStats();
  });
}

controls.reset.addEventListener("click", resetScenePreservingControls);

syncOutputs();
resetToPreset();

let previousTime = performance.now();
let frameAccumulator = 0;
let frameCounter = 0;

function animate(now) {
  const deltaSeconds = (now - previousTime) / 1000;
  previousTime = now;

  if (!controls.pause.checked) {
    if (simulation.params.sphereEnabled && controls.preset.value === "drape") {
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
