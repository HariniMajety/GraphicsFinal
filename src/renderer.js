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

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

out vec3 vWorldPosition;
out vec3 vNormal;
out float vStrain;

void main() {
  vec4 worldPosition = uModel * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = mat3(uModel) * normal;
  vStrain = strain;
  gl_Position = uProjection * uView * worldPosition;
}`;

const surfaceFragment = `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in float vStrain;

uniform vec3 uColor;
uniform vec3 uLightDirection;
uniform bool uNormalTint;
uniform bool uStrainTint;
uniform float uAlpha;

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

void main() {
  vec3 normal = normalize(vNormal);
  float diffuse = max(dot(normal, normalize(-uLightDirection)), 0.0);
  float rim = pow(1.0 - max(dot(normal, normalize(vec3(0.0, 1.0, 0.2))), 0.0), 2.0);
  vec3 base = uColor;
  if (uStrainTint) {
    base = heatmap(vStrain * 4.5);
  } else if (uNormalTint) {
    base = normal * 0.5 + 0.5;
  }
  vec3 shaded = base * (0.22 + diffuse * 0.78) + rim * vec3(0.10, 0.17, 0.25);
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

  useSurfaceProgram(model, color, alpha = 1) {
    const gl = this.gl;
    const { projection, view } = this.viewProjection();
    gl.useProgram(this.surfaceProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.surfaceProgram, "uProjection"), false, projection);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.surfaceProgram, "uView"), false, view);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.surfaceProgram, "uModel"), false, model);
    gl.uniform3fv(gl.getUniformLocation(this.surfaceProgram, "uColor"), color);
    gl.uniform3fv(gl.getUniformLocation(this.surfaceProgram, "uLightDirection"), new Float32Array([0.5, 1.2, 0.3]));
    gl.uniform1i(gl.getUniformLocation(this.surfaceProgram, "uNormalTint"), this.flags.normalTint ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(this.surfaceProgram, "uStrainTint"), this.flags.strainTint ? 1 : 0);
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
        this.useSurfaceProgram(floorModel, new Float32Array([0.16, 0.24, 0.3]), 0.38);
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
      this.useSurfaceProgram(sphereModel, new Float32Array([0.78, 0.88, 0.98]), 0.88);
      gl.bindVertexArray(this.sphereBuffers.vao);
      gl.drawElements(gl.TRIANGLES, this.sphereBuffers.count, gl.UNSIGNED_SHORT, 0);
    }

    gl.disable(gl.CULL_FACE);
    this.useSurfaceProgram(identity, new Float32Array([0.91, 0.67, 0.29]), 1);
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
