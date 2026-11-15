// map.js — COLDSTORE, an original cold-storage depot: a freezer hall in the
// north-west (site A), a loading dock in the south-west (site B), a crate
// hall between them, and three lanes east from the Runner spawn. The map is
// data first: every solid is an AABB in BOXES, and the same list builds the
// meshes, the collision world and the minimap, so what you see is exactly
// what you collide with. Waypoint nodes for the bots sit on the lanes; edges
// are derived at load from line of sight, never hand-wired.

import * as THREE from 'three';

export const PALETTE = {
  floor: 0x4c555e, wall: 0x8b98a4, wallDark: 0x5d6a75, steel: 0x3d4854,
  frost: 0xa9c9d9, frostPanel: 0xcfe4ee, crateWood: 0x9a7648, crateBlue: 0x3f6d8e,
  crateOlive: 0x6b7048, container: 0xa34a38, container2: 0x38618f, dockYellow: 0xc9a227,
  siteA: 0x7fd4ff, siteB: 0xffb648, trim: 0x222a31,
};

// cx, cz = centre; w, d = footprint; h = height; y0 = base height.
// opts: c colour key, collide=false for paint and trim, emissive for lamps.
export const BOXES = [];
function box(cx, cz, w, d, h, opts = {}) {
  BOXES.push({ cx, cz, w, d, h, y0: opts.y0 || 0, c: opts.c || 'wall', collide: opts.collide !== false, e: opts.e || 0 });
  return BOXES[BOXES.length - 1];
}

// ---- perimeter (walls 5 high, 1 thick) --------------------------------
box(0, -26.5, 70, 1, 5, { c: 'wall' }); box(0, 26.5, 70, 1, 5, { c: 'wall' });
box(-34.5, 0, 1, 54, 5, { c: 'wall' }); box(34.5, 0, 1, 54, 5, { c: 'wall' });

// ---- freezer A (north-west room): walls with two door gaps -------------
box(-22, -25.5, 22, 1, 4.2, { c: 'frostPanel' });            // north wall of the freezer
box(-32.5, -19, 1, 12, 4.2, { c: 'frostPanel' });            // west wall (against perimeter)
box(-22, -12.5, 8, 1, 4.2, { c: 'frostPanel' });             // south wall, west part (gap at x -16..-12)
box(-8.5, -12.5, 5, 1, 4.2, { c: 'frostPanel' });            // south wall, east part
box(-11.5, -19, 1, 12, 4.2, { c: 'frostPanel' });            // east wall
// freezer units and cold crates inside A
box(-27, -21, 5, 3, 2.7, { c: 'frost' }); box(-19, -22, 4, 2.4, 2.7, { c: 'frost' });
box(-28, -14.5, 3.4, 3.4, 1.35, { c: 'crateBlue' }); box(-28, -14.5, 3.4, 3.4, 1.35, { c: 'crateBlue', y0: 1.35 });
box(-15.5, -21.5, 2.6, 2.6, 1.35, { c: 'crateWood' }); box(-24.5, -17.5, 1.3, 1.3, 1.35, { c: 'crateOlive' });

// ---- north corridor (east-west lane into A) -----------------------------
box(-2, -21.5, 3.4, 3.4, 1.35, { c: 'crateWood' }); box(-2, -21.5, 3.4, 3.4, 1.35, { c: 'crateWood', y0: 1.35 });
box(10, -17, 2.6, 2.6, 1.35, { c: 'crateBlue' }); box(18, -21, 4.5, 2.2, 2.2, { c: 'container2' });
box(4, -25.5, 10, 1, 3.4, { c: 'wallDark' });                 // corridor back wall segment

// ---- central crate hall --------------------------------------------------
box(0, 0, 3.2, 3.2, 3.4, { c: 'steel' });                    // centre pillar block
box(-8, -6, 4.6, 2.4, 1.35, { c: 'crateWood' }); box(-8, -6, 4.6, 2.4, 1.35, { c: 'crateWood', y0: 1.35 });
box(6, 5, 4.6, 2.4, 1.35, { c: 'crateBlue' }); box(6, 5, 2.4, 2.4, 1.35, { c: 'crateOlive', y0: 1.35 });
box(-6, 7, 2.6, 4.4, 1.35, { c: 'container' });
box(12, -6, 2.6, 2.6, 1.35, { c: 'crateWood' }); box(12, -6, 2.6, 2.6, 1.35, { c: 'crateBlue', y0: 1.35 });
box(-14, 1.5, 1.2, 7, 3.4, { c: 'wallDark' });               // hall divider, gaps both ends
box(16, 0.5, 1.2, 6, 3.4, { c: 'wallDark' });                // east divider, gaps both ends
// catwalk along the hall's north side: deck at 3.0 with three step boxes
box(-4, -9.6, 14, 2.2, 0.3, { c: 'steel', y0: 2.7 });
box(3.6, -9.6, 1.1, 2.2, 1.0, { c: 'steel' }); box(4.7, -9.6, 1.1, 2.2, 2.0, { c: 'steel' });
box(-9.9, -9.6, 1.1, 2.2, 1.0, { c: 'steel' }); box(-8.8, -9.6, 1.1, 2.2, 2.0, { c: 'steel' });
box(-4, -10.9, 14, 0.15, 1.0, { c: 'steel', y0: 3.0, collide: false }); // rail (visual)

// ---- dock B (south-west): container stacks and the dock office ---------
box(-22, 25.5, 22, 1, 4.2, { c: 'wallDark' });               // south wall of the dock
box(-11.5, 19, 1, 12, 4.2, { c: 'wallDark' });               // east wall
box(-22, 12.5, 8, 1, 4.2, { c: 'wallDark' });                // north wall, west part (gap x -16..-12)
box(-8.5, 12.5, 5, 1, 4.2, { c: 'wallDark' });               // north wall, east part
box(-28, 20, 6, 2.6, 2.6, { c: 'container' }); box(-28, 20, 6, 2.6, 2.6, { c: 'container2', y0: 2.6 });
box(-18, 22, 5, 2.4, 2.6, { c: 'container2' });
box(-27, 14.5, 3.2, 3.2, 1.35, { c: 'crateWood' }); box(-15.5, 15.5, 2.4, 2.4, 1.35, { c: 'crateBlue' });
box(-31, 8, 3.5, 3.5, 2.2, { c: 'steel' });                  // dock office block

// ---- south corridor -------------------------------------------------------
box(10, 17, 2.6, 2.6, 1.35, { c: 'crateOlive' }); box(-2, 21.5, 3.4, 3.4, 1.35, { c: 'crateWood' });
box(18, 21, 4.5, 2.2, 2.2, { c: 'container' }); box(4, 25.5, 10, 1, 3.4, { c: 'wallDark' });

// ---- east yard (Runner spawn side): light cover so the exit is a choice --
box(24, -10, 2.6, 2.6, 1.35, { c: 'crateBlue' }); box(24, 10, 2.6, 2.6, 1.35, { c: 'crateBlue' });
box(27, 0, 2.2, 5, 2.2, { c: 'container2' });

// ---- floor paint (decor only, never collides) -----------------------------
box(-22, -16, 10.5, 10.5, 0.02, { c: 'siteA', collide: false, y0: 0.005 });
box(-22, 17, 10.5, 10.5, 0.02, { c: 'siteB', collide: false, y0: 0.005 });
box(0, -19, 60, 0.35, 0.02, { c: 'dockYellow', collide: false, y0: 0.005 });
box(0, 19, 60, 0.35, 0.02, { c: 'dockYellow', collide: false, y0: 0.005 });
box(0, 0, 0.35, 44, 0.02, { c: 'dockYellow', collide: false, y0: 0.005 });

export const SITES = {
  A: { x: -22, z: -16, r: 5.2, label: 'Freezer A', color: PALETTE.siteA },
  B: { x: -22, z: 17, r: 5.2, label: 'Dock B', color: PALETTE.siteB },
};

export const SPAWNS = {
  def: [[-30, -4], [-30, 0], [-30, 4], [-27, -7], [-27, 7]],
  atk: [[30, -4], [30, 0], [30, 4], [27, -7], [27, 7]],
};

// Waypoint nodes: [x, z]. Bots route over the graph these form.
export const NODES = [
  [-28, 0], [-22, -16], [-18, -19], [-25, -9], [-14, -16], [-14, 16], [-22, 17], [-25, 9],
  [-8, -18], [2, -19], [12, -18], [20, -15], [24, -7], [31, 0], [24, 7], [20, 15],
  [12, 18], [2, 19], [-8, 18], [-12, 8], [-12, -8], [-4, -3], [4, 2], [12, 6],
  [12, -8], [18, 0], [-19, 0], [-17.5, -10.5], [-19, 11], [6, -12], [-5, 11],
  [-14.5, -12.8], [-14.5, 12.8],
];
export const NODE = { DEF_SPAWN: 0, A: 1, A_N: 2, A_S: 3, A_E: 4, B_E: 5, B: 6, B_S: 7, MID_W: 26, MID: 22, ATK_SPAWN: 13 };

export const BOUNDS = { minX: -33.8, maxX: 33.8, minZ: -25.8, maxZ: 25.8 };

// Colliders as flat min/max records, built once from BOXES.
export const COLLIDERS = BOXES.filter(b => b.collide).map(b => ({
  minX: b.cx - b.w / 2, maxX: b.cx + b.w / 2,
  minZ: b.cz - b.d / 2, maxZ: b.cz + b.d / 2,
  minY: b.y0, maxY: b.y0 + b.h,
}));

function textTexture(text, fg, bg, w = 512, h = 256) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = `800 ${h * 0.62}px system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(0x9db8c8);
  scene.fog = new THREE.Fog(0x9db8c8, 55, 140);

  const hemi = new THREE.HemisphereLight(0xd6e6f2, 0x2c343a, 1.15);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0xbcd2e8, 0.55);   // sky bounce from the west
  fill.position.set(-24, 30, -18);
  scene.add(fill);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
  sun.position.set(28, 42, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 38; sun.shadow.camera.bottom = -38;
  sun.shadow.camera.far = 110; sun.shadow.bias = -0.0006;
  scene.add(sun);
  const cold = new THREE.PointLight(0x7fd4ff, 24, 26, 1.8);   // freezer glow
  cold.position.set(-22, 3.6, -16); scene.add(cold);
  const warm = new THREE.PointLight(0xffb648, 20, 26, 1.8);   // dock sodium lamps
  warm.position.set(-22, 3.8, 17); scene.add(warm);

  const floorMat = new THREE.MeshStandardMaterial({ color: PALETTE.floor, roughness: 0.94, metalness: 0.02 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 54), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);

  const mats = {};
  for (const key of Object.keys(PALETTE)) {
    mats[key] = new THREE.MeshStandardMaterial({
      color: PALETTE[key], roughness: key === 'steel' ? 0.6 : 0.85,
      metalness: key === 'steel' ? 0.18 : 0.05,
      emissive: key === 'siteA' || key === 'siteB' ? PALETTE[key] : 0x000000,
      emissiveIntensity: key === 'siteA' || key === 'siteB' ? 0.35 : 0,
    });
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (const b of BOXES) {
    const m = new THREE.Mesh(geo, mats[b.c]);
    m.position.set(b.cx, b.y0 + b.h / 2, b.cz);
    m.scale.set(b.w, b.h, b.d);
    m.castShadow = b.collide && b.h > 0.4;
    m.receiveShadow = true;
    scene.add(m);
  }

  // Roof trusses: long beams on pillars, high enough never to collide.
  const trussMat = mats.steel;
  for (const z of [-19, 0, 19]) {
    const beam = new THREE.Mesh(geo, trussMat);
    beam.position.set(0, 6.4, z); beam.scale.set(69, 0.5, 0.8);
    scene.add(beam);
  }

  // Site letters and the depot sign, drawn on canvas — the game's own art.
  const signA = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2),
    new THREE.MeshBasicMaterial({ map: textTexture('A', '#0b2a3a', '#7fd4ff') }));
  signA.position.set(-22, 3.1, -25.9); scene.add(signA);
  const signB = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2),
    new THREE.MeshBasicMaterial({ map: textTexture('B', '#3a2403', '#ffb648') }));
  signB.position.set(-22, 3.1, 25.9); signB.rotation.y = Math.PI; scene.add(signB);
  const depot = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.6),
    new THREE.MeshBasicMaterial({ map: textTexture('COLDSTORE DEPOT 7', '#dcebf5', '#26313a', 1024, 200) }));
  depot.position.set(33.9, 3.6, 0); depot.rotation.y = -Math.PI / 2; scene.add(depot);

  // Site rings: a bright circle on the floor of each site.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.35, s.r, 40),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.03, s.z);
    scene.add(ring);
  }
}
