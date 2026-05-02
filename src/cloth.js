import { clamp, length3 } from "./utils.js";

const EPSILON = 1e-6;
const COLLISION_MARGIN = 0.02;
const WIND_DRAG = 0.085;
const TEAR_KINDS = new Set(["structural", "shear"]);

export class ClothSimulation {
  constructor(config = {}) {
    this.configure(config);
  }

  configure(config) {
    this.sceneName = config.sceneName ?? "drape";
    this.width = config.width ?? 26;
    this.height = config.height ?? 18;
    this.spacing = config.spacing ?? 0.16;
    this.origin = config.origin ?? [-2, 2.4, 0];
    this.orientation = config.orientation ?? "vertical-xy";
    this.pinMode = config.pinMode ?? "top-row";
    this.verticalDrop = config.verticalDrop ?? 0;
    this.materialPreset = config.materialPreset ?? "silk";
    this.params = {
      stiffness: config.stiffness ?? 0.72,
      damping: config.damping ?? 0.992,
      gravity: config.gravity ?? 9.8,
      substeps: config.substeps ?? 6,
      windEnabled: config.windEnabled ?? true,
      windStrength: config.windStrength ?? 7.5,
      gustStrength: config.gustStrength ?? 1.8,
      floorEnabled: config.floorEnabled ?? true,
      sphereEnabled: config.sphereEnabled ?? true,
      floorFriction: config.floorFriction ?? 0.38,
      sphereFriction: config.sphereFriction ?? 0.22,
      floorRestitution: config.floorRestitution ?? 0.0,
      sphereRestitution: config.sphereRestitution ?? 0.04,
      tearingEnabled: config.tearingEnabled ?? false,
      tearThreshold: config.tearThreshold ?? 0.24,
    };

    this.time = 0;
    this.sphere = {
      center: config.sphereCenter ?? [0.4, 0.65, 0],
      radius: config.sphereRadius ?? 0.72,
    };
    this.floorY = config.floorY ?? -1.35;
    this.indices = [];
    this.lineIndices = [];
    this.triangles = [];
    this.springLookup = new Map();
    this.positions = new Float32Array();
    this.normals = new Float32Array();
    this.strain = new Float32Array();
    this.uvs = new Float32Array();
    this.particles = [];
    this.springs = [];
    this.totalSpringCount = 0;
    this.brokenSpringCount = 0;
    this.lastBreakCount = 0;
    this.resetGeometry();
  }

  resetGeometry() {
    const pointCount = this.width * this.height;
    this.positions = new Float32Array(pointCount * 3);
    this.normals = new Float32Array(pointCount * 3);
    this.strain = new Float32Array(pointCount);
    this.uvs = new Float32Array(pointCount * 2);
    this.particles = Array.from({ length: pointCount }, (_, index) => {
      const x = index % this.width;
      const y = Math.floor(index / this.width);
      let px = this.origin[0] + x * this.spacing;
      let py = this.origin[1] - y * this.spacing - this.verticalDrop;
      let pz = this.origin[2];

      if (this.orientation === "horizontal-xz") {
        px = this.origin[0] + x * this.spacing;
        py = this.origin[1];
        pz = this.origin[2] + y * this.spacing;
      }

      const pinned = this.isPinned(x, y);
      const u = this.width > 1 ? x / (this.width - 1) : 0;
      const v = this.height > 1 ? y / (this.height - 1) : 0;
      this.uvs[index * 2] = u;
      this.uvs[index * 2 + 1] = v;

      return {
        position: [px, py, pz],
        previous: [px, py, pz],
        force: [0, 0, 0],
        pinned,
      };
    });

    this.springs = [];
    this.indices = [];
    this.lineIndices = [];
    this.triangles = [];
    this.springLookup = new Map();

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const current = this.indexAt(x, y);

        if (x < this.width - 1) {
          this.addSpring(current, this.indexAt(x + 1, y), 1, "structural");
        }
        if (y < this.height - 1) {
          this.addSpring(current, this.indexAt(x, y + 1), 1, "structural");
        }
        if (x < this.width - 1 && y < this.height - 1) {
          this.addSpring(current, this.indexAt(x + 1, y + 1), 0.75, "shear");
          this.addSpring(this.indexAt(x + 1, y), this.indexAt(x, y + 1), 0.75, "shear");
        }
        if (x < this.width - 2) {
          this.addSpring(current, this.indexAt(x + 2, y), 0.45, "bend");
        }
        if (y < this.height - 2) {
          this.addSpring(current, this.indexAt(x, y + 2), 0.45, "bend");
        }
      }
    }

    for (let y = 0; y < this.height - 1; y += 1) {
      for (let x = 0; x < this.width - 1; x += 1) {
        const a = this.indexAt(x, y);
        const b = this.indexAt(x + 1, y);
        const c = this.indexAt(x, y + 1);
        const d = this.indexAt(x + 1, y + 1);
        const leftTriangleSprings = [
          this.lookupSpring(a, c),
          this.lookupSpring(c, b),
          this.lookupSpring(b, a),
        ];
        const rightTriangleSprings = [
          this.lookupSpring(b, c),
          this.lookupSpring(c, d),
          this.lookupSpring(d, b),
        ];
        this.triangles.push({ a, b: c, c: b, springs: leftTriangleSprings });
        this.triangles.push({ a: b, b: c, c: d, springs: rightTriangleSprings });
      }
    }

    this.totalSpringCount = this.springs.length;
    this.brokenSpringCount = 0;
    this.lastBreakCount = 0;
    this.recomputeBuffers();
  }

  isPinned(x, y) {
    if (this.pinMode === "corners") {
      return y === 0 && (x === 0 || x === this.width - 1);
    }
    if (this.pinMode === "none") {
      return false;
    }
    return y === 0;
  }

  springKey(a, b) {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }

  lookupSpring(a, b) {
    return this.springLookup.get(this.springKey(a, b)) ?? -1;
  }

  addSpring(a, b, scale, kind) {
    const pa = this.particles[a].position;
    const pb = this.particles[b].position;
    const restLength = length3(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
    const ax = a % this.width;
    const ay = Math.floor(a / this.width);
    const bx = b % this.width;
    const by = Math.floor(b / this.width);
    const nearAnchors =
      this.particles[a].pinned ||
      this.particles[b].pinned ||
      ay <= 1 ||
      by <= 1 ||
      ax <= 1 ||
      bx <= 1 ||
      ax >= this.width - 2 ||
      bx >= this.width - 2;
    const spring = {
      a,
      b,
      restLength,
      scale,
      kind,
      breakable: TEAR_KINDS.has(kind) && !nearAnchors,
      broken: false,
    };
    const index = this.springs.push(spring) - 1;
    this.springLookup.set(this.springKey(a, b), index);
    return index;
  }

  indexAt(x, y) {
    return y * this.width + x;
  }

  applyPreset(name) {
    if (name === "banner") {
      this.configure({
        sceneName: "banner",
        width: this.width,
        height: this.height,
        spacing: 0.16,
        origin: [-2.2, 2.2, -0.3],
        orientation: "vertical-xy",
        pinMode: "corners",
        sphereCenter: [0.2, 0.2, 0],
        sphereRadius: 0.55,
        floorY: -1.45,
        stiffness: this.params.stiffness,
        damping: this.params.damping,
        gravity: this.params.gravity,
        substeps: this.params.substeps,
        windEnabled: this.params.windEnabled,
        windStrength: this.params.windStrength,
        gustStrength: this.params.gustStrength,
        floorEnabled: this.params.floorEnabled,
        sphereEnabled: false,
        floorFriction: this.params.floorFriction,
        sphereFriction: this.params.sphereFriction,
      });
      return;
    }

    if (name === "drop") {
      this.configure({
        sceneName: "drop",
        width: this.width,
        height: this.height,
        spacing: 0.16,
        origin: [-2, 2.45, -1.35],
        orientation: "horizontal-xz",
        pinMode: "none",
        verticalDrop: 0,
        sphereCenter: [0, -0.1, 0],
        sphereRadius: 0.72,
        floorY: -1.5,
        stiffness: this.params.stiffness,
        damping: this.params.damping,
        gravity: this.params.gravity,
        substeps: this.params.substeps,
        windEnabled: false,
        windStrength: this.params.windStrength,
        gustStrength: this.params.gustStrength,
        floorEnabled: this.params.floorEnabled,
        sphereEnabled: true,
        floorFriction: this.params.floorFriction,
        sphereFriction: this.params.sphereFriction,
      });
      return;
    }

    this.configure({
      sceneName: "drape",
      width: this.width,
      height: this.height,
      spacing: 0.16,
      origin: [-2, 2.4, 0],
      orientation: "vertical-xy",
      pinMode: "top-row",
      sphereCenter: [0.4, 0.65, 0],
      sphereRadius: 0.72,
      floorY: -1.35,
      stiffness: this.params.stiffness,
      damping: this.params.damping,
      gravity: this.params.gravity,
      substeps: this.params.substeps,
      windEnabled: this.params.windEnabled,
      windStrength: this.params.windStrength,
      gustStrength: this.params.gustStrength,
      floorEnabled: this.params.floorEnabled,
      sphereEnabled: true,
      floorFriction: this.params.floorFriction,
      sphereFriction: this.params.sphereFriction,
    });
  }

  setParam(name, value) {
    this.params[name] = value;
  }

  setMaterialPreset(name) {
    this.materialPreset = name;
  }

  setPinMode(pinMode) {
    this.pinMode = pinMode;
    this.resetGeometry();
  }

  step(deltaTime) {
    const substeps = Math.max(1, Math.round(this.params.substeps));
    const dt = Math.min(deltaTime, 1 / 20) / substeps;

    for (let stepIndex = 0; stepIndex < substeps; stepIndex += 1) {
      this.time += dt;
      this.accumulateForces();
      this.integrate(dt);
      this.solveConstraints();
      this.applyTearing();
      this.resolveCollisions();
    }

    this.recomputeBuffers();
  }

  accumulateForces() {
    const windPhase = Math.sin(this.time * 1.7) * 0.5 + Math.sin(this.time * 0.7 + 0.8) * 0.5;
    const windStrength = this.params.windEnabled
      ? this.params.windStrength + this.params.gustStrength * windPhase
      : 0;

    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index];
      particle.force[0] = 0;
      particle.force[1] = -this.params.gravity;
      particle.force[2] = 0;
    }

    if (!this.params.windEnabled) {
      return;
    }

    for (let index = 0; index < this.indices.length; index += 3) {
      const ia = this.indices[index];
      const ib = this.indices[index + 1];
      const ic = this.indices[index + 2];

      const pa = this.particles[ia];
      const pb = this.particles[ib];
      const pc = this.particles[ic];

      const abx = pb.position[0] - pa.position[0];
      const aby = pb.position[1] - pa.position[1];
      const abz = pb.position[2] - pa.position[2];
      const acx = pc.position[0] - pa.position[0];
      const acy = pc.position[1] - pa.position[1];
      const acz = pc.position[2] - pa.position[2];

      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const areaTwice = length3(nx, ny, nz);
      if (areaTwice <= EPSILON) {
        continue;
      }

      const centerX = (pa.position[0] + pb.position[0] + pc.position[0]) / 3;
      const centerY = (pa.position[1] + pb.position[1] + pc.position[1]) / 3;
      const centerZ = (pa.position[2] + pb.position[2] + pc.position[2]) / 3;

      const vaX = pa.position[0] - pa.previous[0];
      const vaY = pa.position[1] - pa.previous[1];
      const vaZ = pa.position[2] - pa.previous[2];
      const vbX = pb.position[0] - pb.previous[0];
      const vbY = pb.position[1] - pb.previous[1];
      const vbZ = pb.position[2] - pb.previous[2];
      const vcX = pc.position[0] - pc.previous[0];
      const vcY = pc.position[1] - pc.previous[1];
      const vcZ = pc.position[2] - pc.previous[2];

      const triangleVelocityX = (vaX + vbX + vcX) / 3;
      const triangleVelocityY = (vaY + vbY + vcY) / 3;
      const triangleVelocityZ = (vaZ + vbZ + vcZ) / 3;

      const flutter =
        Math.sin(this.time * 3.1 + centerX * 0.8 + centerY * 0.35 + centerZ * 0.45) * 0.5;
      const windX = windStrength * 0.8;
      const windY = flutter * 0.6;
      const windZ = windStrength * (0.48 + flutter * 0.3);

      const relWindX = windX - triangleVelocityX;
      const relWindY = windY - triangleVelocityY;
      const relWindZ = windZ - triangleVelocityZ;
      const relWindLength = length3(relWindX, relWindY, relWindZ);
      if (relWindLength <= EPSILON) {
        continue;
      }

      const normalX = nx / areaTwice;
      const normalY = ny / areaTwice;
      const normalZ = nz / areaTwice;
      const incidence = normalX * relWindX + normalY * relWindY + normalZ * relWindZ;
      const forceScale = WIND_DRAG * incidence * areaTwice;

      const forceX = normalX * forceScale;
      const forceY = normalY * forceScale;
      const forceZ = normalZ * forceScale;

      pa.force[0] += forceX / 3;
      pa.force[1] += forceY / 3;
      pa.force[2] += forceZ / 3;
      pb.force[0] += forceX / 3;
      pb.force[1] += forceY / 3;
      pb.force[2] += forceZ / 3;
      pc.force[0] += forceX / 3;
      pc.force[1] += forceY / 3;
      pc.force[2] += forceZ / 3;
    }
  }

  integrate(dt) {
    const dtSquared = dt * dt;
    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index];
      if (particle.pinned) {
        particle.previous[0] = particle.position[0];
        particle.previous[1] = particle.position[1];
        particle.previous[2] = particle.position[2];
        continue;
      }

      const vx = (particle.position[0] - particle.previous[0]) * this.params.damping;
      const vy = (particle.position[1] - particle.previous[1]) * this.params.damping;
      const vz = (particle.position[2] - particle.previous[2]) * this.params.damping;

      const nextX = particle.position[0] + vx + particle.force[0] * dtSquared;
      const nextY = particle.position[1] + vy + particle.force[1] * dtSquared;
      const nextZ = particle.position[2] + vz + particle.force[2] * dtSquared;

      particle.previous[0] = particle.position[0];
      particle.previous[1] = particle.position[1];
      particle.previous[2] = particle.position[2];
      particle.position[0] = nextX;
      particle.position[1] = nextY;
      particle.position[2] = nextZ;
    }
  }

  solveConstraints() {
    const iterations = 3;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (let index = 0; index < this.springs.length; index += 1) {
      const spring = this.springs[index];
      if (spring.broken) {
        continue;
      }
      const a = this.particles[spring.a];
        const b = this.particles[spring.b];
        const dx = b.position[0] - a.position[0];
        const dy = b.position[1] - a.position[1];
        const dz = b.position[2] - a.position[2];
        const dist = Math.max(length3(dx, dy, dz), EPSILON);
        const diff = ((dist - spring.restLength) / dist) * this.params.stiffness * spring.scale;

        const offsetX = dx * 0.5 * diff;
        const offsetY = dy * 0.5 * diff;
        const offsetZ = dz * 0.5 * diff;

        if (!a.pinned) {
          a.position[0] += offsetX;
          a.position[1] += offsetY;
          a.position[2] += offsetZ;
        }

        if (!b.pinned) {
          b.position[0] -= offsetX;
          b.position[1] -= offsetY;
          b.position[2] -= offsetZ;
        }
      }
    }
  }

  applyTearing() {
    if (!this.params.tearingEnabled) {
      this.lastBreakCount = 0;
      return;
    }

    let brokenThisStep = 0;
    for (let index = 0; index < this.springs.length; index += 1) {
      const spring = this.springs[index];
      if (spring.broken || !spring.breakable) {
        continue;
      }

      const a = this.particles[spring.a].position;
      const b = this.particles[spring.b].position;
      const distance = length3(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const stretchRatio = Math.abs(distance - spring.restLength) / Math.max(spring.restLength, EPSILON);
      if (stretchRatio > this.params.tearThreshold) {
        spring.broken = true;
        brokenThisStep += 1;
      }
    }

    this.lastBreakCount = brokenThisStep;
    this.brokenSpringCount += brokenThisStep;
  }

  applyContactFriction(
    particle,
    normalX,
    normalY,
    normalZ,
    friction,
    restitution = 0,
    settleThreshold = 0,
  ) {
    const clampedFriction = clamp(friction, 0, 1);
    const clampedRestitution = clamp(restitution, 0, 1);
    const velocityX = particle.position[0] - particle.previous[0];
    const velocityY = particle.position[1] - particle.previous[1];
    const velocityZ = particle.position[2] - particle.previous[2];
    const normalVelocity = velocityX * normalX + velocityY * normalY + velocityZ * normalZ;

    const outwardNormalVelocity = Math.max(normalVelocity, 0);
    const normalComponentX = normalX * outwardNormalVelocity * clampedRestitution;
    const normalComponentY = normalY * outwardNormalVelocity * clampedRestitution;
    const normalComponentZ = normalZ * outwardNormalVelocity * clampedRestitution;

    const tangentX = velocityX - normalX * normalVelocity;
    const tangentY = velocityY - normalY * normalVelocity;
    const tangentZ = velocityZ - normalZ * normalVelocity;
    const tangentScale = Math.max(0, 1 - clampedFriction);

    const nextVelocityX = normalComponentX + tangentX * tangentScale;
    const nextVelocityY = normalComponentY + tangentY * tangentScale;
    const nextVelocityZ = normalComponentZ + tangentZ * tangentScale;
    const nextSpeed = length3(nextVelocityX, nextVelocityY, nextVelocityZ);

    if (nextSpeed < settleThreshold) {
      particle.previous[0] = particle.position[0];
      particle.previous[1] = particle.position[1];
      particle.previous[2] = particle.position[2];
      return;
    }

    particle.previous[0] = particle.position[0] - nextVelocityX;
    particle.previous[1] = particle.position[1] - nextVelocityY;
    particle.previous[2] = particle.position[2] - nextVelocityZ;
  }

  resolveCollisions() {
    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index];

      if (this.params.floorEnabled && particle.position[1] < this.floorY) {
        particle.position[1] = this.floorY + COLLISION_MARGIN;
        this.applyContactFriction(
          particle,
          0,
          1,
          0,
          this.params.floorFriction,
          this.params.floorRestitution,
          0.018,
        );
      }

      if (this.params.sphereEnabled) {
        const dx = particle.position[0] - this.sphere.center[0];
        const dy = particle.position[1] - this.sphere.center[1];
        const dz = particle.position[2] - this.sphere.center[2];
        const dist = length3(dx, dy, dz);
        if (dist <= EPSILON) {
          particle.position[0] = this.sphere.center[0];
          particle.position[1] = this.sphere.center[1] + this.sphere.radius + COLLISION_MARGIN;
          particle.position[2] = this.sphere.center[2];
          this.applyContactFriction(
            particle,
            0,
            1,
            0,
            this.params.sphereFriction,
            this.params.sphereRestitution,
            0.008,
          );
          continue;
        }

        if (dist < this.sphere.radius + COLLISION_MARGIN) {
          const scale = (this.sphere.radius + COLLISION_MARGIN) / dist;
          particle.position[0] = this.sphere.center[0] + dx * scale;
          particle.position[1] = this.sphere.center[1] + dy * scale;
          particle.position[2] = this.sphere.center[2] + dz * scale;
          this.applyContactFriction(
            particle,
            dx / dist,
            dy / dist,
            dz / dist,
            this.params.sphereFriction,
            this.params.sphereRestitution,
            0.008,
          );
        }
      }
    }
  }

  recomputeBuffers() {
    this.indices = [];
    this.lineIndices = [];
    for (let index = 0; index < this.particles.length; index += 1) {
      const position = this.particles[index].position;
      const base = index * 3;
      this.positions[base] = position[0];
      this.positions[base + 1] = position[1];
      this.positions[base + 2] = position[2];
      this.normals[base] = 0;
      this.normals[base + 1] = 0;
      this.normals[base + 2] = 0;
      this.strain[index] = 0;
    }

    for (let index = 0; index < this.springs.length; index += 1) {
      const spring = this.springs[index];
      if (spring.broken) {
        continue;
      }
      this.lineIndices.push(spring.a, spring.b);
    }

    for (let index = 0; index < this.triangles.length; index += 1) {
      const triangle = this.triangles[index];
      let active = true;
      for (let springIndex = 0; springIndex < triangle.springs.length; springIndex += 1) {
        const edge = this.springs[triangle.springs[springIndex]];
        if (!edge || edge.broken) {
          active = false;
          break;
        }
      }
      if (!active) {
        continue;
      }

      const ia = triangle.a;
      const ib = triangle.b;
      const ic = triangle.c;
      this.indices.push(ia, ib, ic);

      const ax = this.positions[ia * 3];
      const ay = this.positions[ia * 3 + 1];
      const az = this.positions[ia * 3 + 2];
      const bx = this.positions[ib * 3];
      const by = this.positions[ib * 3 + 1];
      const bz = this.positions[ib * 3 + 2];
      const cx = this.positions[ic * 3];
      const cy = this.positions[ic * 3 + 1];
      const cz = this.positions[ic * 3 + 2];

      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const acx = cx - ax;
      const acy = cy - ay;
      const acz = cz - az;

      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;

      this.normals[ia * 3] += nx;
      this.normals[ia * 3 + 1] += ny;
      this.normals[ia * 3 + 2] += nz;
      this.normals[ib * 3] += nx;
      this.normals[ib * 3 + 1] += ny;
      this.normals[ib * 3 + 2] += nz;
      this.normals[ic * 3] += nx;
      this.normals[ic * 3 + 1] += ny;
      this.normals[ic * 3 + 2] += nz;
    }

    for (let index = 0; index < this.particles.length; index += 1) {
      const base = index * 3;
      const nx = this.normals[base];
      const ny = this.normals[base + 1];
      const nz = this.normals[base + 2];
      const invLength = 1 / Math.max(length3(nx, ny, nz), EPSILON);
      this.normals[base] = nx * invLength;
      this.normals[base + 1] = ny * invLength;
      this.normals[base + 2] = nz * invLength;
    }

    for (let index = 0; index < this.springs.length; index += 1) {
      const spring = this.springs[index];
      if (spring.broken) {
        continue;
      }
      const a = this.particles[spring.a].position;
      const b = this.particles[spring.b].position;
      const distance = length3(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const stretch = Math.abs(distance - spring.restLength) / Math.max(spring.restLength, EPSILON);
      this.strain[spring.a] = Math.max(this.strain[spring.a], stretch);
      this.strain[spring.b] = Math.max(this.strain[spring.b], stretch);
    }
  }

  dragSphere(timeSeconds) {
    this.sphere.center[0] = 0.25 + Math.sin(timeSeconds * 0.7) * 0.85;
    this.sphere.center[2] = Math.cos(timeSeconds * 0.45) * 0.35;
  }

  setSpherePosition(x, y, z = this.sphere.center[2]) {
    this.sphere.center[0] = x;
    this.sphere.center[1] = y;
    this.sphere.center[2] = z;
  }

  getStats() {
    let totalStretchRatio = 0;
    let maxStretchRatio = 0;
    let averageHeight = 0;
    let peakVertexStrain = 0;

    for (let index = 0; index < this.particles.length; index += 1) {
      averageHeight += this.particles[index].position[1];
      peakVertexStrain = Math.max(peakVertexStrain, this.strain[index] ?? 0);
    }

    for (let index = 0; index < this.springs.length; index += 1) {
      const spring = this.springs[index];
      if (spring.broken) {
        continue;
      }
      const a = this.particles[spring.a].position;
      const b = this.particles[spring.b].position;
      const distance = length3(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const stretchRatio = Math.abs(distance - spring.restLength) / Math.max(spring.restLength, EPSILON);
      totalStretchRatio += stretchRatio;
      maxStretchRatio = Math.max(maxStretchRatio, stretchRatio);
    }

    return {
      vertexCount: this.particles.length,
      springCount: this.springs.length - this.brokenSpringCount,
      totalSpringCount: this.totalSpringCount,
      brokenSpringCount: this.brokenSpringCount,
      averageStretchPercent: (this.springs.length - this.brokenSpringCount) ? (totalStretchRatio / (this.springs.length - this.brokenSpringCount)) * 100 : 0,
      maxStretchPercent: maxStretchRatio * 100,
      peakVertexStrainPercent: peakVertexStrain * 100,
      averageHeight: this.particles.length ? averageHeight / this.particles.length : 0,
      windEnabled: this.params.windEnabled,
      substeps: this.params.substeps,
      stiffness: this.params.stiffness,
      damping: this.params.damping,
      gravity: this.params.gravity,
      tearingEnabled: this.params.tearingEnabled,
      tearThreshold: this.params.tearThreshold,
      breaksLastStep: this.lastBreakCount,
    };
  }
}

export function formatNumber(value, digits = 2) {
  return clamp(value, -9999, 9999).toFixed(digits);
}
