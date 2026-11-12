import * as THREE from 'three';

// Procedural low-poly WWII-style fighter. Nose points +Z (so mesh.lookAt aims it).
// Everything generated in code - no external assets.
export function buildPlane({ body = 0x5a6b46, wing = 0x4c5c3c, accent = 0xd8c24a, canopy = 0x9fd4e8 } = {}) {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });

  // fuselage: lathe profile, nose at +Z
  const pts = [];
  pts.push(new THREE.Vector2(0.02, -5.6));   // tail tip
  pts.push(new THREE.Vector2(0.28, -4.6));
  pts.push(new THREE.Vector2(0.52, -2.2));
  pts.push(new THREE.Vector2(0.78, 0.2));    // widest at cockpit
  pts.push(new THREE.Vector2(0.72, 2.0));
  pts.push(new THREE.Vector2(0.5, 3.6));
  pts.push(new THREE.Vector2(0.34, 4.6));    // spinner backplate
  pts.push(new THREE.Vector2(0.02, 5.0));
  const fus = new THREE.Mesh(new THREE.LatheGeometry(pts, 10), mat(body));
  fus.rotation.x = Math.PI / 2; // lathe Y-axis -> Z-axis (nose +Z)
  g.add(fus);

  // main wing: swept, tapered
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.9);
  wingShape.lineTo(4.4, -0.5);
  wingShape.lineTo(4.6, -1.5);
  wingShape.lineTo(0, -1.5);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.16, bevelEnabled: false });
  wingGeo.rotateX(Math.PI / 2);           // shape XY -> XZ plane, thickness in Y
  wingGeo.translate(0, 0.02, 0);
  const wings = new THREE.Mesh(wingGeo, mat(wing));
  const wingsL = wings.clone();
  wingsL.scale.x = -1;
  wings.position.y = -0.28; wingsL.position.y = -0.28;
  g.add(wings); g.add(wingsL);

  // tailplanes
  const tailGeo = new THREE.BoxGeometry(3.0, 0.12, 1.1);
  const tail = new THREE.Mesh(tailGeo, mat(wing));
  tail.position.set(0, 0.12, -4.5);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 1.3), mat(wing));
  fin.position.set(0, 0.85, -4.6);
  g.add(fin);

  // canopy
  const can = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), new THREE.MeshLambertMaterial({ color: canopy, transparent: true, opacity: 0.85 }));
  can.scale.set(0.85, 0.7, 1.6);
  can.position.set(0, 0.75, 0.6);
  g.add(can);

  // spinner + prop (prop is separate so it can spin)
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 8), mat(accent));
  spinner.rotation.x = Math.PI / 2;
  spinner.position.set(0, 0, 5.35);
  g.add(spinner);
  const prop = new THREE.Group();
  const bladeGeo = new THREE.BoxGeometry(0.28, 3.4, 0.08);
  const blade1 = new THREE.Mesh(bladeGeo, mat(0x2a2a26));
  const blade2 = blade1.clone(); blade2.rotation.z = Math.PI / 2;
  prop.add(blade1); prop.add(blade2);
  prop.position.set(0, 0, 5.55);
  g.add(prop);

  // wing accent bands (silhouette at distance)
  const bandGeo = new THREE.BoxGeometry(1.1, 0.2, 1.6);
  const bandR = new THREE.Mesh(bandGeo, mat(accent));
  bandR.position.set(3.6, -0.28, -0.5);
  const bandL = bandR.clone(); bandL.position.x = -3.6;
  g.add(bandR); g.add(bandL);

  // gun muzzle anchor points on the wings (world-space via getWorldPosition)
  const guns = [];
  for (const x of [-2.1, -2.9, 2.1, 2.9]) {
    const anchor = new THREE.Object3D();
    anchor.position.set(x, -0.3, 0.4);
    g.add(anchor);
    guns.push(anchor);
  }

  return { group: g, prop, guns, length: 11, wingspan: 9.4 };
}

export const PLAYER_LIVERY = { body: 0x5a6b46, wing: 0x4c5c3c, accent: 0xd8c24a, canopy: 0x9fd4e8 };
export const ENEMY_LIVERY = { body: 0x6e6f78, wing: 0x595a63, accent: 0xb03030, canopy: 0x8fb8c8 };
