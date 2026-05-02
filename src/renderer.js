function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function perspective(fovRadians, aspect, near, far) {
  const f = 1.0 / Math.tan(fovRadians / 2);
  const rangeInv = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * rangeInv, -1,
    0, 0, near * far * rangeInv * 2, 0,
  ]);
}

function lookAt(eye, target, up) {
  const zx = eye[0] - target[0];
  const zy = eye[1] - target[1];
  const zz = eye[2] - target[2];
  const zLength = Math.hypot(zx, zy, zz) || 1;

  const znx = zx / zLength;
  const zny = zy / zLength;
  const znz = zz / zLength;

  const xx = up[1] * znz - up[2] * zny;
  const xy = up[2] * znx - up[0] * znz;
  const xz = up[0] * zny - up[1] * znx;
  const xLength = Math.hypot(xx, xy, xz) || 1;

  const xnx = xx / xLength;
  const xny = xy / xLength;
  const xnz = xz / xLength;

  const ynx = zny * xnz - znz * xny;
  const yny = znz * xnx - znx * xnz;
  const ynz = znx * xny - zny * xnx;

  return new Float32Array([
    xnx, ynx, znx, 0,
    xny, yny, zny, 0,
    xnz, ynz, znz, 0,
    -(xnx * eye[0] + xny * eye[1] + xnz * eye[2]),
    -(ynx * eye[0] + yny * eye[1] + ynz * eye[2]),
    -(znx * eye[0] + zny * eye[1] + znz * eye[2]),
    1,
  ]);
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      out[column + row * 4] =
        a[row * 4] * b[column] +
        a[row * 4 + 1] * b[column + 4] +
        a[row * 4 + 2] * b[column + 8] +
        a[row * 4 + 3] * b[column + 12];
    }
  }
  return out;
}

function sphereMesh(latBands = 24, lonBands = 24) {
  const vertices = [];
  const indices = [];
  for (let lat = 0; lat <= latBands; lat += 1) {
    const theta = (lat / latBands) * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    for (let lon = 0; lon <= lonBands; lon += 1) {
      const phi = (lon / lonBands) * Math.PI * 2;
      const x = Math.cos(phi) * sinTheta;
      const y = cosTheta;
      const z = Math.sin(phi) * sinTheta;
      vertices.push(x, y, z);
    }
  }

  for (let lat = 0; lat < latBands; lat += 1) {
    for (let lon = 0; lon < lonBands; lon += 1) {
      const first = lat * (lonBands + 1) + lon;
      const second = first + lonBands + 1;
      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices),
  };
}

function floorMesh(size = 8) {
  return {
    vertices: new Float32Array([
      -size, 0, -size, 0, 1, 0,
      size, 0, -size, 0, 1, 0,
      -size, 0, size, 0, 1, 0,
      size, 0, size, 0, 1, 0,
    ]),
    indices: new Uint16Array([0, 2, 1, 1, 2, 3]),
  };
}

function pinMesh(size = 0.035) {
  return {
    vertices: new Float32Array([
      0, size, 0,
      -size, -size, size,
      size, -size, size,
      0, size, 0,
      size, -size, size,
      size, -size, -size,
      0, size, 0,
      size, -size, -size,
      -size, -size, -size,
      0, size, 0,
      -size, -size, -size,
      -size, -size, size,
    ]),
  };
}

const surfaceVertex = `#version 300 es
precision highp float;

layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in float strain;
layout(location = 3) in vec2 uv;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

out vec3 vWorldPosition;
out vec3 vNormal;
out float vStrain;
out vec2 vUv;

void main() {
  vec4 worldPosition = uModel * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = mat3(uModel) * normal;
  vStrain = strain;
  vUv = uv;
  gl_Position = uProjection * uView * worldPosition;
}`;

const surfaceFragment = `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in float vStrain;
in vec2 vUv;

uniform vec3 uColor;
uniform vec3 uLightDirection;
uniform vec3 uCameraPos;
uniform bool uNormalTint;
uniform bool uStrainTint;
uniform float uAlpha;
uniform int uSurfaceKind;
uniform int uFabricKind;
uniform float uRoughness;
uniform float uSpecularStrength;
uniform float uSheenStrength;

out vec4 outColor;

vec3 heatmap(float t) {
  float x = clamp(t, 0.0, 1.0);
  vec3 cool = vec3(0.16, 0.44, 0.94);
  vec3 warm = vec3(0.98, 0.76, 0.18);
  vec3 hot = vec3(0.87, 0.16, 0.12);
  if (x < 0.5) {
    return mix(cool, warm, x * 2.0);
  }
  return mix(warm, hot, (x - 0.5) * 2.0);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i += 1) {
    value += noise2(p) * amplitude;
    p *= 2.02;
    amplitude *= 0.5;
  }
  return value;
}

vec3 fresnelSchlick(float cosTheta, vec3 f0) {
  return f0 + (1.0 - f0) * pow(1.0 - clamp(cosTheta, 0.0, 1.0), 5.0);
}

vec3 fabricDetail(vec3 base, vec2 uv, int fabricKind) {
  vec2 macroUv = uv * vec2(3.0, 4.8);
  if (fabricKind == 0) {
    vec2 fineUv = uv * vec2(110.0, 150.0);
    float microWarp = sin(fineUv.y + sin(fineUv.x * 0.12) * 0.45) * 0.5 + 0.5;
    float microWeft = sin(fineUv.x * 0.68) * 0.5 + 0.5;
    float weave = microWarp * microWeft;
    float dye = fbm(uv * vec2(3.2, 7.8));
    float softBand = sin((uv.y * 1.8 - uv.x * 0.14) * 7.0 + dye * 2.6) * 0.5 + 0.5;
    base *= 0.985 + dye * 0.035;
    base *= 0.985 + weave * 0.015;
    base += vec3(0.22, 0.19, 0.13) * softBand * 0.035;
  } else if (fabricKind == 1) {
    float warp = sin(macroUv.x * 30.0) * 0.5 + 0.5;
    float weft = sin(macroUv.y * 28.0) * 0.5 + 0.5;
    float weave = warp * weft;
    float accent = fbm(macroUv * 5.8);
    float fleck = smoothstep(0.72, 0.94, fbm(macroUv * 10.0));
    base *= 0.82 + weave * 0.10 + accent * 0.12;
    base += vec3(0.12, 0.09, 0.05) * fleck * 0.26;
  } else if (fabricKind == 2) {
    float pile = fbm(macroUv * 7.2);
    float nap = sin(macroUv.x * 12.0 + macroUv.y * 8.0) * 0.5 + 0.5;
    float accent = fbm(macroUv * 3.6);
    base *= 0.70 + accent * 0.16 + pile * 0.12;
    base += vec3(0.22, 0.05, 0.12) * nap * 0.18;
  } else {
    float smoothGrain = fbm(macroUv * 5.4);
    float dimples = smoothstep(0.66, 0.9, fbm(macroUv * 12.0));
    base *= 0.86 + smoothGrain * 0.08;
    base -= vec3(0.03, 0.04, 0.05) * dimples * 0.25;
    base += vec3(0.05, 0.07, 0.09) * smoothstep(0.58, 0.84, smoothGrain) * 0.14;
  }
  return clamp(base, 0.0, 1.0);
}

vec3 floorDetail(vec3 base, vec3 worldPosition) {
  vec2 p = worldPosition.xz * 0.68;
  vec2 tile = fract(p);
  float groutX = smoothstep(0.44, 0.495, abs(tile.x - 0.5));
  float groutY = smoothstep(0.44, 0.495, abs(tile.y - 0.5));
  float grout = clamp(groutX + groutY, 0.0, 1.0);
  float largeStone = fbm(p * 1.4);
  float fineStone = fbm(p * 8.0);
  float streak = fbm(vec2(p.x * 0.6, p.y * 2.2));
  vec3 shaded = base * (0.90 + largeStone * 0.14 + fineStone * 0.05);
  shaded += vec3(0.03, 0.025, 0.015) * streak * 0.12;
  shaded -= vec3(0.11, 0.11, 0.10) * grout * 0.85;
  return clamp(shaded, 0.0, 1.0);
}

vec3 sphereDetail(vec3 base, vec3 worldPosition) {
  vec2 p = vec2(atan(worldPosition.z, worldPosition.x), worldPosition.y * 1.35);
  float clouds = fbm(vec2(p.x * 2.0, p.y * 3.4));
  float veins = fbm(vec2(p.x * 5.8 + clouds * 0.5, p.y * 8.8));
  float bands = sin(p.y * 5.2 + p.x * 1.5 + clouds * 0.8) * 0.5 + 0.5;
  vec3 shaded = mix(base * 0.86, base * 1.06, clouds);
  shaded += vec3(0.03, 0.04, 0.06) * bands * 0.10;
  shaded -= vec3(0.05, 0.06, 0.07) * smoothstep(0.62, 0.86, veins) * 0.28;
  return clamp(shaded, 0.0, 1.0);
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(-uLightDirection);
  vec3 viewDir = normalize(uCameraPos - vWorldPosition);
  vec3 halfVec = normalize(lightDir + viewDir);
  float ndotl = max(dot(normal, lightDir), 0.0);
  float ndotv = max(dot(normal, viewDir), 0.0);
  float ndoth = max(dot(normal, halfVec), 0.0);
  float rim = pow(1.0 - ndotv, 2.2);
  vec3 base = uColor;
  if (uStrainTint) {
    base = heatmap(vStrain * 4.5);
  } else if (uNormalTint) {
    base = normal * 0.5 + 0.5;
  } else if (uSurfaceKind == 0) {
    base = fabricDetail(base, vUv, uFabricKind);
  } else if (uSurfaceKind == 1) {
    base = floorDetail(base, vWorldPosition);
  } else if (uSurfaceKind == 2) {
    base = sphereDetail(base, vWorldPosition);
  }
  float wrapDiffuse = clamp((dot(normal, lightDir) + 0.35) / 1.35, 0.0, 1.0);
  vec3 skyAmbient = mix(vec3(0.06, 0.08, 0.10), vec3(0.16, 0.19, 0.22), normal.y * 0.5 + 0.5);
  float specPower = mix(160.0, 12.0, clamp(uRoughness, 0.0, 1.0));
  float specular = pow(ndoth, specPower) * uSpecularStrength;
  float clothSheen = pow(1.0 - ndotv, 4.2) * uSheenStrength;

  vec3 shaded = base * (0.22 + wrapDiffuse * 0.78);
  shaded += base * skyAmbient * 0.55;

  if (uSurfaceKind == 0 && uFabricKind == 0) {
    vec3 tangent = normalize(vec3(0.04, 0.995, 0.08));
    vec3 bitangent = normalize(cross(normal, tangent));
    vec3 halfProjected = normalize(halfVec - normal * dot(halfVec, normal) + tangent * 0.0001);
    float threadResponse = abs(dot(halfProjected, bitangent));
    float anisotropic = pow(1.0 - threadResponse, 28.0);
    vec3 silkFresnel = fresnelSchlick(ndotv, vec3(0.11, 0.10, 0.09));
    shaded = base * (0.16 + ndotl * 0.54);
    shaded += base * skyAmbient * 0.35;
    shaded += vec3(1.0, 0.97, 0.90) * specular * 1.45;
    shaded += vec3(1.0, 0.95, 0.86) * anisotropic * uSheenStrength * 0.82;
    shaded += silkFresnel * vec3(0.95, 0.88, 0.74) * 0.55;
  } else if (uSurfaceKind == 0 && uFabricKind == 1) {
    shaded += vec3(1.0, 0.98, 0.93) * specular * 0.32;
    shaded += base * clothSheen * 0.10;
  } else if (uSurfaceKind == 0 && uFabricKind == 2) {
    float velvetBloom = pow(1.0 - ndotv, 2.3);
    shaded = base * (0.14 + wrapDiffuse * 0.64);
    shaded += base * skyAmbient * 0.40;
    shaded += base * velvetBloom * 0.32;
    shaded += vec3(0.95, 0.76, 0.84) * specular * 0.10;
  } else if (uSurfaceKind == 0 && uFabricKind == 3) {
    vec3 rubberFresnel = fresnelSchlick(ndotv, vec3(0.05));
    shaded += vec3(0.96, 0.98, 1.0) * specular * 1.28;
    shaded += rubberFresnel * 0.12;
  } else if (uSurfaceKind == 1) {
    shaded += vec3(0.92, 0.90, 0.84) * specular * 0.08;
  } else if (uSurfaceKind == 2) {
    vec3 ceramicFresnel = fresnelSchlick(ndotv, vec3(0.07));
    shaded += vec3(1.0) * specular * 1.05;
    shaded += ceramicFresnel * 0.10;
  } else {
    shaded += vec3(1.0) * specular;
    shaded += base * clothSheen * 0.22;
  }

  shaded += rim * vec3(0.04, 0.06, 0.08);
  outColor = vec4(shaded, uAlpha);
}`;

const lineVertex = `#version 300 es
precision highp float;

layout(location = 0) in vec3 position;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

void main() {
  gl_Position = uProjection * uView * uModel * vec4(position, 1.0);
}`;

const lineFragment = `#version 300 es
precision highp float;

uniform vec3 uColor;

out vec4 outColor;

void main() {
  outColor = vec4(uColor, 1.0);
}`;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2", { antialias: true });
    if (!this.gl) {
      throw new Error("WebGL2 is required for this demo.");
    }

    this.camera = {
      orbitX: -0.38,
      orbitY: 0.85,
      distance: 7.2,
      target: [0, 0.55, 0],
    };
    this.flags = {
      wireframe: false,
      normalTint: false,
      strainTint: false,
      showPins: true,
    };

    this.surfaceProgram = createProgram(this.gl, surfaceVertex, surfaceFragment);
    this.lineProgram = createProgram(this.gl, lineVertex, lineFragment);
    this.clothBuffers = this.createClothBuffers();
    this.sphereBuffers = this.createSphereBuffers();
    this.floorBuffers = this.createFloorBuffers();
    this.pinBuffers = this.createPinBuffers();
    this.resetCameraForPreset("drape");
    this.attachInteraction();
  }

  resetCameraForPreset(preset) {
    if (preset === "drop") {
      this.camera.orbitX = -0.18;
      this.camera.orbitY = 0.78;
      this.camera.distance = 8.6;
      this.camera.target = [0.15, 0.15, 0.1];
      return;
    }

    if (preset === "banner") {
      this.camera.orbitX = -0.14;
      this.camera.orbitY = 0.92;
      this.camera.distance = 7.4;
      this.camera.target = [0.2, 1.05, -0.1];
      return;
    }

    this.camera.orbitX = -0.16;
    this.camera.orbitY = 0.88;
    this.camera.distance = 7.1;
    this.camera.target = [0.2, 1.0, 0];
  }

  createClothBuffers() {
    const gl = this.gl;
    return {
      vao: gl.createVertexArray(),
      positionBuffer: gl.createBuffer(),
      normalBuffer: gl.createBuffer(),
      strainBuffer: gl.createBuffer(),
      uvBuffer: gl.createBuffer(),
      indexBuffer: gl.createBuffer(),
      lineIndexBuffer: gl.createBuffer(),
      triangleCount: 0,
      lineCount: 0,
    };
  }

  createSphereBuffers() {
    const gl = this.gl;
    const mesh = sphereMesh();
    const vao = gl.createVertexArray();
    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 12, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: mesh.indices.length };
  }

  createFloorBuffers() {
    const gl = this.gl;
    const mesh = floorMesh();
    const vao = gl.createVertexArray();
    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: mesh.indices.length };
  }

  createPinBuffers() {
    const gl = this.gl;
    const mesh = pinMesh();
    const vao = gl.createVertexArray();
    const vertexBuffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
    return { vao, count: mesh.vertices.length / 3 };
  }

  attachInteraction() {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    this.canvas.addEventListener("pointerdown", (event) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      this.camera.orbitY -= dx * 0.01;
      this.camera.orbitX = Math.max(-1.15, Math.min(0.32, this.camera.orbitX + dy * 0.01));
    });

    this.canvas.addEventListener("pointerup", () => {
      dragging = false;
    });
    this.canvas.addEventListener("pointerleave", () => {
      dragging = false;
    });
    this.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.camera.distance = Math.max(4.8, Math.min(13.5, this.camera.distance + event.deltaY * 0.01));
      },
      { passive: false },
    );
  }

  resize() {
    const width = this.canvas.clientWidth * window.devicePixelRatio;
    const height = this.canvas.clientHeight * window.devicePixelRatio;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  updateClothMesh(simulation) {
    const gl = this.gl;
    const buffers = this.clothBuffers;
    gl.bindVertexArray(buffers.vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, simulation.positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, simulation.normals, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.strainBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, simulation.strain, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, simulation.uvs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(simulation.indices), gl.DYNAMIC_DRAW);
    buffers.triangleCount = simulation.indices.length;

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.lineIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(simulation.lineIndices), gl.DYNAMIC_DRAW);
    buffers.lineCount = simulation.lineIndices.length;

    gl.bindVertexArray(null);
  }

  setFlags(flags) {
    this.flags = { ...this.flags, ...flags };
  }

  clothMaterial(materialPreset) {
    if (materialPreset === "canvas") {
      return {
        color: new Float32Array([0.76, 0.69, 0.56]),
        alpha: 1,
        kind: 1,
        roughness: 0.92,
        specular: 0.045,
        sheen: 0.04,
      };
    }
    if (materialPreset === "velvet") {
      return {
        color: new Float32Array([0.40, 0.07, 0.17]),
        alpha: 1,
        kind: 2,
        roughness: 0.97,
        specular: 0.02,
        sheen: 0.72,
      };
    }
    if (materialPreset === "rubber") {
      return {
        color: new Float32Array([0.16, 0.24, 0.34]),
        alpha: 1,
        kind: 3,
        roughness: 0.14,
        specular: 0.82,
        sheen: 0.02,
      };
    }
    return {
      color: new Float32Array([0.92, 0.82, 0.66]),
      alpha: 1,
      kind: 0,
      roughness: 0.10,
      specular: 0.56,
      sheen: 0.86,
    };
  }

  viewProjection() {
    const eye = [
      this.camera.target[0] + Math.cos(this.camera.orbitY) * Math.cos(this.camera.orbitX) * this.camera.distance,
      this.camera.target[1] + Math.sin(this.camera.orbitX) * this.camera.distance,
      this.camera.target[2] + Math.sin(this.camera.orbitY) * Math.cos(this.camera.orbitX) * this.camera.distance,
    ];
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const projection = perspective((50 * Math.PI) / 180, aspect, 0.1, 40);
    const view = lookAt(eye, this.camera.target, [0, 1, 0]);
    return { projection, view, eye };
  }

  useSurfaceProgram(model, color, alpha = 1, surfaceKind = 0, fabricKind = 0, roughness = 0.6, specular = 0.12, sheen = 0.0) {
    const gl = this.gl;
    const { projection, view, eye } = this.viewProjection();
    gl.useProgram(this.surfaceProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.surfaceProgram, "uProjection"), false, projection);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.surfaceProgram, "uView"), false, view);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.surfaceProgram, "uModel"), false, model);
    gl.uniform3fv(gl.getUniformLocation(this.surfaceProgram, "uColor"), color);
    gl.uniform3fv(gl.getUniformLocation(this.surfaceProgram, "uLightDirection"), new Float32Array([0.35, 1.0, 0.55]));
    gl.uniform3fv(gl.getUniformLocation(this.surfaceProgram, "uCameraPos"), new Float32Array(eye));
    gl.uniform1i(gl.getUniformLocation(this.surfaceProgram, "uNormalTint"), this.flags.normalTint ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(this.surfaceProgram, "uStrainTint"), this.flags.strainTint ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(this.surfaceProgram, "uSurfaceKind"), surfaceKind);
    gl.uniform1i(gl.getUniformLocation(this.surfaceProgram, "uFabricKind"), fabricKind);
    gl.uniform1f(gl.getUniformLocation(this.surfaceProgram, "uRoughness"), roughness);
    gl.uniform1f(gl.getUniformLocation(this.surfaceProgram, "uSpecularStrength"), specular);
    gl.uniform1f(gl.getUniformLocation(this.surfaceProgram, "uSheenStrength"), sheen);
    gl.uniform1f(gl.getUniformLocation(this.surfaceProgram, "uAlpha"), alpha);
  }

  useLineProgram(model, color) {
    const gl = this.gl;
    const { projection, view } = this.viewProjection();
    gl.useProgram(this.lineProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProgram, "uProjection"), false, projection);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProgram, "uView"), false, view);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProgram, "uModel"), false, model);
    gl.uniform3fv(gl.getUniformLocation(this.lineProgram, "uColor"), color);
  }

  render(simulation) {
    const gl = this.gl;
    this.resize();
    this.updateClothMesh(simulation);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.028, 0.07, 0.11, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const identity = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);

    if (simulation.params.floorEnabled) {
      const { eye } = this.viewProjection();
      const shouldHideFloor =
        simulation.sceneName !== "drop" && eye[1] < simulation.floorY + 0.12;

      const floorModel = new Float32Array(identity);
      floorModel[13] = simulation.floorY;
      if (!shouldHideFloor) {
        gl.disable(gl.CULL_FACE);
        this.useSurfaceProgram(floorModel, new Float32Array([0.33, 0.34, 0.35]), 0.9, 1, 0, 0.94, 0.04, 0.0);
        gl.bindVertexArray(this.floorBuffers.vao);
        gl.drawElements(gl.TRIANGLES, this.floorBuffers.count, gl.UNSIGNED_SHORT, 0);
        gl.enable(gl.CULL_FACE);
      }
    }

    if (simulation.params.sphereEnabled) {
      const sphereModel = new Float32Array([
        simulation.sphere.radius, 0, 0, 0,
        0, simulation.sphere.radius, 0, 0,
        0, 0, simulation.sphere.radius, 0,
        simulation.sphere.center[0], simulation.sphere.center[1], simulation.sphere.center[2], 1,
      ]);
      this.useSurfaceProgram(sphereModel, new Float32Array([0.88, 0.91, 0.95]), 1, 2, 0, 0.24, 0.40, 0.0);
      gl.bindVertexArray(this.sphereBuffers.vao);
      gl.drawElements(gl.TRIANGLES, this.sphereBuffers.count, gl.UNSIGNED_SHORT, 0);
    }

    gl.disable(gl.CULL_FACE);
    const clothMaterial = this.clothMaterial(simulation.materialPreset);
    this.useSurfaceProgram(
      identity,
      clothMaterial.color,
      clothMaterial.alpha,
      0,
      clothMaterial.kind,
      clothMaterial.roughness,
      clothMaterial.specular,
      clothMaterial.sheen,
    );
    gl.bindVertexArray(this.clothBuffers.vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.clothBuffers.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.clothBuffers.triangleCount, gl.UNSIGNED_SHORT, 0);
    gl.enable(gl.CULL_FACE);

    if (this.flags.wireframe) {
      gl.disable(gl.CULL_FACE);
      this.useLineProgram(identity, new Float32Array([0.56, 0.84, 1.0]));
      gl.bindVertexArray(this.clothBuffers.vao);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.clothBuffers.lineIndexBuffer);
      gl.drawElements(gl.LINES, this.clothBuffers.lineCount, gl.UNSIGNED_SHORT, 0);
      gl.enable(gl.CULL_FACE);
    }

    if (this.flags.showPins) {
      const pinnedPositions = simulation.particles.filter((particle) => particle.pinned).map((particle) => particle.position);
      this.useLineProgram(identity, new Float32Array([1.0, 0.74, 0.36]));
      gl.bindVertexArray(this.pinBuffers.vao);
      for (let index = 0; index < pinnedPositions.length; index += 1) {
        const pinModel = new Float32Array([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          pinnedPositions[index][0], pinnedPositions[index][1] + 0.06, pinnedPositions[index][2], 1,
        ]);
        this.useLineProgram(pinModel, new Float32Array([1.0, 0.74, 0.36]));
        gl.drawArrays(gl.LINE_LOOP, 0, this.pinBuffers.count);
      }
    }
  }
}
