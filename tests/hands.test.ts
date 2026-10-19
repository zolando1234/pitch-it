import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeHand, angleAt, fingers3D, palmNormalZ, type World3 } from "../src/lib/coach/pose/hands.ts";

/*
  Rozpoznanie rúk: reálny výstup modelu MediaPipe HandLandmarker pre testovacie obrázky
  (px = pixely, world = svetové súradnice v metroch) a syntetické ruky pre smer dlane.
*/

type Raw = { px: number[][]; world: number[][] };
const pts = (r: Raw) => r.px.map(([x, y]) => ({ x, y }));
const world = (r: Raw): World3[] => r.world.map(([x, y, z]) => ({ x, y, z }));

const THUMB_UP: Raw = {
  px: [[243.6,273],[242.8,217.9],[219.2,167.3],[190.4,131.9],[181.5,101.8],[156.1,191.6],[129.2,190],[168.6,206.3],[183.6,209.4],[150.5,223.7],[130.6,226.4],[176.6,236.4],[180.6,228],[150.9,251.9],[130.8,255.5],[171.8,261.1],[177.7,252.3],[151.3,277.8],[136.8,285],[162.6,285],[168.9,280.2]],
  world: [[0.06767,0.03154,0.05232],[0.0632,-0.00387,0.02011],[0.05398,-0.03926,0.01002],[0.03504,-0.06931,0.00356],[0.01851,-0.08722,0.00744],[0.00449,-0.02814,-0.004],[-0.00392,-0.02501,-0.03294],[0.00734,-0.01996,-0.03218],[0.02428,-0.01566,-0.00475],[-0.00451,-0.00414,0.00254],[-0.01123,-0.00381,-0.03554],[0.01569,0.00245,-0.03558],[0.0192,-0.00407,0.00375],[-0.00539,0.01719,0.00352],[-0.01136,0.01739,-0.02873],[0.01331,0.01882,-0.02674],[0.02057,0.0127,-0.00057],[0.00082,0.04362,0.00549],[-0.01114,0.03869,-0.01641],[0.00597,0.03601,-0.02907],[0.01175,0.03883,-0.01461]],
};
const POINTING_UP: Raw = {
  px: [[171.9,280.4],[194.1,249.7],[207,211.4],[188.7,189],[158.7,187.4],[169.3,166.1],[171.8,123.5],[173.6,98],[170.8,74.4],[140.9,177.9],[150.5,159.1],[165.2,195.9],[163.9,209.6],[119.5,195.1],[129.4,183.6],[147,215.5],[145.1,224.4],[100.3,215.9],[110.3,202.6],[126.9,222.3],[126.6,230.6]],
  world: [[0.01647,0.08629,0.03691],[0.04206,0.0563,0.02061],[0.05095,0.03182,0.00477],[0.04324,0.00812,-0.02255],[0.01607,0.00446,-0.03482],[0.02428,-0.01303,0.0054],[0.02479,-0.0419,-0.00192],[0.02575,-0.06288,-0.00924],[0.02402,-0.07992,-0.03056],[0.00038,-0.00624,0.00498],[0.00821,-0.01749,-0.02968],[0.01845,0.00749,-0.03731],[0.01729,0.01733,-0.01216],[-0.01795,0.00615,-0.00321],[-0.00926,0.00507,-0.03461],[0.00529,0.02765,-0.03308],[0.00605,0.03649,-0.00811],[-0.03125,0.02934,-0.01052],[-0.02409,0.0206,-0.02853],[-0.00821,0.03096,-0.0329],[-0.00953,0.03874,-0.01909]],
};
const OPEN_A: Raw = {
  px: [[582.8,353.3],[511.4,336.8],[461.2,289.6],[427.9,237.3],[394.3,204.4],[500,218.3],[480,141.2],[469.4,92.4],[463.5,51.4],[543.1,208.4],[536.9,121.4],[533.5,64.7],[531.3,20.6],[582.5,213.2],[588.7,133.4],[593.1,79.5],[594.9,39.1],[617.3,225.1],[633.7,162.6],[643.6,123.6],[651.6,90.5]],
  world: [[0.01287,0.06051,0.03961],[-0.01336,0.04392,0.03098],[-0.02441,0.02635,0.02797],[-0.04041,0.00429,0.01909],[-0.06238,-0.00884,0.0097],[-0.014,0.00002,-0.00042],[-0.02161,-0.01978,-0.00406],[-0.02909,-0.0399,0.00047],[-0.03746,-0.06254,0.00881],[-0.00216,-0.0014,-0.00091],[-0.00303,-0.02923,-0.00294],[-0.00753,-0.05651,-0.00175],[-0.01651,-0.08553,0.00705],[0.00711,-0.00163,-0.00116],[0.0105,-0.01981,-0.00044],[0.01413,-0.04898,0.00065],[0.012,-0.07211,0.00698],[0.01357,0.00872,0.00979],[0.02615,-0.00875,0.00879],[0.03293,-0.03182,0.00717],[0.03302,-0.04846,0.01088]],
};
const OPEN_B: Raw = {
  px: [[137.2,27.6],[208,44.7],[258,90.8],[291.6,143.2],[325.1,177.1],[216.9,161.6],[238.5,240.5],[250.6,288.5],[257.5,328.4],[173.9,170.5],[181.2,260.2],[185.9,317.4],[188.8,361.5],[135.4,166.3],[129.1,247],[125.5,299.9],[124.1,338.5],[101.5,155.5],[86.6,219.3],[77.2,258.2],[69.2,290.9]],
  world: [[-0.01226,-0.057,0.04293],[0.01301,-0.03951,0.03423],[0.02415,-0.02259,0.02847],[0.03855,-0.00383,0.01996],[0.05942,0.0073,0.00744],[0.01369,0.00099,-0.00243],[0.02219,0.01807,-0.00576],[0.02905,0.03789,0.00034],[0.03876,0.05882,0.011],[0.00182,0.00122,-0.00149],[0.00258,0.02553,-0.00375],[0.00831,0.0543,0.00021],[0.01687,0.08172,0.01272],[-0.00753,0.00111,0.00059],[-0.01027,0.01755,0.002],[-0.01395,0.0461,0.00591],[-0.01226,0.06906,0.01342],[-0.01217,-0.00743,0.01338],[-0.02422,0.00925,0.01299],[-0.02993,0.03012,0.01484],[-0.03027,0.04677,0.01868]],
};

test("palec hore s ohnutými prstami nie je päsť (3D), v 2D to bola päsť", () => {
  const flat = analyzeHand(pts(THUMB_UP), "right");
  assert.equal(flat.source, "2d");
  assert.equal(flat.shape, "fist"); // pôvodné 2D vyhodnotenie sa mýlilo

  const info = analyzeHand(pts(THUMB_UP), "right", world(THUMB_UP));
  assert.equal(info.source, "3d");
  assert.equal(info.gesture, "thumb_up");
  assert.notEqual(info.shape, "fist");
  assert.equal(info.extendedFingers, 1);
});

test("ukazovák hore sa berie ako počítanie, s jedným vystretým prstom", () => {
  const info = analyzeHand(pts(POINTING_UP), "right", world(POINTING_UP));
  assert.equal(info.shape, "count");
  assert.equal(info.extendedFingers, 1);
  assert.equal(info.gesture, null);
});

test("dve otvorené ruky: päť prstov, tvar open", () => {
  for (const raw of [OPEN_A, OPEN_B]) {
    const info = analyzeHand(pts(raw), "right", world(raw));
    assert.equal(info.shape, "open");
    assert.equal(info.extendedFingers, 5);
  }
});

test("uhly kĺbov a neplatné body", () => {
  assert.equal(Math.round(angleAt({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })), 90);
  assert.equal(Math.round(angleAt({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: -1, y: 0, z: 0 })), 180);
  assert.equal(angleAt({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), 0);
  assert.equal(fingers3D(world(OPEN_A).slice(0, 20)), null);
  const broken = world(OPEN_A);
  broken[8] = { x: NaN, y: 0, z: 0 };
  assert.equal(fingers3D(broken), null);
  // ruka s neplatnými 3D bodmi sa vyhodnotí v 2D zálohe
  assert.equal(analyzeHand(pts(OPEN_A), "right", broken).source, "2d");
});

test("smer dlane: pravá a ľavá ruka majú opačné znamienko, hrana ruky a zdegenerovaná ruka sú neisté", () => {
  const hand = (mirror: number, tilt = 0): World3[] => {
    const w = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    w[5] = { x: -0.03 * mirror, y: -0.09, z: 0 };
    w[17] = { x: 0.03 * mirror, y: -0.09, z: tilt };
    return w;
  };
  const right = palmNormalZ(hand(1), "right");
  const left = palmNormalZ(hand(1), "left");
  assert.ok(right !== null && left !== null);
  assert.equal(Math.sign(right!), -Math.sign(left!));
  // zrkadlená ruka má opačný smer dlane
  assert.equal(Math.sign(palmNormalZ(hand(-1), "right")!), -Math.sign(right!));
  // hrana ruky ku kamere: normála leží v rovine obrazu, |nz| je malé
  const edge = hand(1).map((p) => ({ x: p.z, y: p.y, z: p.x }));
  assert.ok(Math.abs(palmNormalZ(edge, "right")!) < 0.35);
  // všetky body v jednom mieste: neznámy smer
  assert.equal(palmNormalZ(Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })), "right"), null);
});

test("dlaň ku kamere v 3D: pravá ruka s dlaňou ku kamere je palmFacing, ľavá s tou istou geometriou nie", () => {
  const w = world(OPEN_A);
  const nz = palmNormalZ(w, "right")!;
  const facingRight = analyzeHand(pts(OPEN_A), "right", w).palmFacing;
  const facingLeft = analyzeHand(pts(OPEN_A), "left", w).palmFacing;
  assert.equal(facingRight, nz < -0.35);
  assert.equal(facingLeft, -nz < -0.35);
  assert.ok(!(facingRight && facingLeft));
});
