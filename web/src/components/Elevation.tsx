import { Canvas, useFrame } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { facingAz, sunPosition } from "../arch";

type Props = {
  floors: number; subjectFloor: number; ptype: string; areaSqft: number; drawKey: number; band?: string;
  lat?: number; lon?: number; facing?: string; sunDoy?: number; sunHour?: number; built?: number | null;
};

const WHITE = new THREE.Color("#e8f1fb");
const CYAN = new THREE.Color("#7fb2e5");
const AMBER = new THREE.Color("#f2b233");
const FLOOR_H = 3.0;

function edges(w: number, h: number, d: number) {
  return new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
}

/** One storey drawn as linework; fades in on its turn so the building "draws" bottom-up. */
function Storey({ i, w, d, subject, start, ghost }: { i: number; w: number; d: number; subject: boolean; start: number; ghost?: boolean }) {
  const mat = useRef<THREE.LineBasicMaterial>(null!);
  const slab = useRef<THREE.MeshBasicMaterial>(null!);
  const geo = useMemo(() => edges(w, FLOOR_H, d), [w, d]);
  const delay = i * 0.07 + start * 0;
  const t0 = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (t0.current === null) t0.current = clock.elapsedTime;
    const t = Math.min(1, Math.max(0, (clock.elapsedTime - t0.current - delay) / 0.35));
    const e = 1 - Math.pow(1 - t, 3);
    mat.current.opacity = (ghost ? (subject ? 0.5 : 0.1) : subject ? 1 : 0.62) * e;
    if (slab.current) slab.current.opacity = (ghost ? 0.08 : 0.32) * e;
  });
  return (
    <group position={[0, i * FLOOR_H + FLOOR_H / 2, 0]}>
      <lineSegments geometry={geo}>
        <lineBasicMaterial ref={mat} color={subject ? AMBER : ghost ? CYAN : WHITE} transparent opacity={0} />
      </lineSegments>
      {subject && (
        <mesh>
          <boxGeometry args={[w * 0.999, FLOOR_H * 0.98, d * 0.999]} />
          <meshBasicMaterial ref={slab} color={AMBER} transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {/* window mullions on the long faces */}
      {!ghost && <Mullions w={w} d={d} subject={subject} start={delay} />}
    </group>
  );
}

function Mullions({ w, d, subject, start }: { w: number; d: number; subject: boolean; start: number }) {
  const mat = useRef<THREE.LineBasicMaterial>(null!);
  const geo = useMemo(() => {
    const pts: number[] = [];
    const n = Math.max(3, Math.round(w / 2.4));
    for (let k = 1; k < n; k++) {
      const x = -w / 2 + (k * w) / n;
      for (const z of [d / 2, -d / 2]) pts.push(x, -FLOOR_H * 0.32, z, x, FLOOR_H * 0.3, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [w, d]);
  const t0 = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (t0.current === null) t0.current = clock.elapsedTime;
    const t = Math.min(1, Math.max(0, (clock.elapsedTime - t0.current - start - 0.15) / 0.4));
    mat.current.opacity = (subject ? 0.9 : 0.28) * t;
  });
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial ref={mat} color={subject ? AMBER : CYAN} transparent opacity={0} />
    </lineSegments>
  );
}

function Dim({ from, to, offset = [0, 0, 0] as [number, number, number] }: {
  from: [number, number, number]; to: [number, number, number]; offset?: [number, number, number];
}) {
  const geo = useMemo(() => {
    const a = new THREE.Vector3(...from).add(new THREE.Vector3(...offset));
    const b = new THREE.Vector3(...to).add(new THREE.Vector3(...offset));
    const dir = b.clone().sub(a).normalize();
    const n = Math.abs(dir.y) > 0.5 ? new THREE.Vector3(0.7, 0, 0) : new THREE.Vector3(0, 0.7, 0);
    const tick = (p: THREE.Vector3) => [p.x - n.x, p.y - n.y, p.z - n.z, p.x + n.x, p.y + n.y, p.z + n.z];
    const ext = (p0: number[], p: THREE.Vector3) => [...p0, p.x, p.y, p.z];
    const pts = [a.x, a.y, a.z, b.x, b.y, b.z, ...tick(a), ...tick(b),
      ...ext(from, a), ...ext(to, b)];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [from, to, offset]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={CYAN} transparent opacity={0.7} />
    </lineSegments>
  );
}

type Layout = { house: boolean; n: number; w: number; d: number; sf: number; H: number; plotW: number; plotD: number };
function layoutFor({ floors, subjectFloor, ptype, areaSqft }: Props): Layout {
  const house = /house|villa/.test(ptype);
  const n = Math.max(1, Math.min(house ? 4 : 40, Math.round(floors)));
  const plate = Math.max(70, (areaSqft * 0.0929 * (house ? 1 : 4)) / 0.78);
  const w = Math.sqrt(plate * 1.45);
  const d = plate / w;
  const sf = Math.min(n - 1, Math.max(0, Math.round(subjectFloor)));
  return { house, n, w, d, sf, H: n * FLOOR_H, plotW: w + (house ? 6 : 14), plotD: d + (house ? 8 : 14) };
}

type Label = { pos: [number, number, number]; text: string; subject?: boolean };
function labelsFor(L: Layout, p: Props): Label[] {
  const extra: Label[] = [];
  if (p.lat != null && p.lon != null && p.sunDoy != null && p.sunHour != null) {
    const sp = sunPosition(p.lat, p.lon, p.sunDoy, p.sunHour);
    const R = Math.max(60, L.H * 1.4);
    if (sp.alt > 0) extra.push({ pos: bearingVec(sp.az, facingAz(p.facing ?? "East"), sp.alt).multiplyScalar(R).add(new THREE.Vector3(0, 4.5, 0)).toArray() as [number, number, number], text: `Sun ${Math.round(sp.alt)}° alt · ${Math.round(sp.az)}° az` });
  }
  if (p.built != null && p.built < L.n) extra.push({ pos: [-L.w / 6, Math.max(p.built, 0) * FLOOR_H + 5.5, -L.d / 2 - 3], text: p.built > 0 ? `Slab ${p.built} of ${L.n} cast` : "Excavation · plinth" });
  return [...extra,
    { pos: [L.w / 2 + 7, L.H / 2, L.d / 2], text: `${L.H.toFixed(1)} m · G+${L.n - 1}` },
    { pos: [0, 0, L.plotD / 2 + 3], text: `Plot ${L.plotW.toFixed(0)} m` },
    { pos: [-L.plotW / 2 - 3, 0, 0], text: `${L.plotD.toFixed(0)} m` },
    { pos: [-L.w / 2, L.sf * FLOOR_H + FLOOR_H / 2, L.d / 2], text: L.house ? "Subject dwelling" : `Subject unit · floor ${L.sf}`, subject: true },
  ];
}

/** Projects label anchors to screen each frame and moves plain DOM labels (no portals). */
function Projector({ labels, refs }: { labels: Label[]; refs: MutableRefObject<(HTMLDivElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    labels.forEach((l, i) => {
      const el = refs.current[i];
      if (!el) return;
      v.set(...l.pos).project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(${x}px, ${y}px) translate(${l.subject ? "-100%" : "-50%"}, -50%)`;
      el.style.opacity = v.z < 1 ? "1" : "0";
    });
  });
  return null;
}

function Building({ L, drawKey, built }: { L: Layout; drawKey: number; built: number | null }) {
  const start = useRef(0);
  const g = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    if (start.current === 0 || (g.current.userData.key !== drawKey)) {
      start.current = clock.elapsedTime;
      g.current.userData.key = drawKey;
    }
  });
  const { house, n, w, d, sf, H, plotW, plotD } = L;
  const plot = useMemo(() => edges(plotW, 0.01, plotD), [plotW, plotD]);
  return (
    <group ref={g} key={drawKey}>
      <lineSegments geometry={plot} position={[0, 0.02, 0]}>
        <lineBasicMaterial color={CYAN} transparent opacity={0.55} />
      </lineSegments>
      {Array.from({ length: n }, (_, i) => (
        <Storey key={`${drawKey}-${i}-${built != null && i >= built}`} i={i} w={w} d={d} subject={i === sf} start={start.current} ghost={built != null && i >= built} />
      ))}
      {house && (built == null || built >= n) && <Roof w={w} d={d} y={H} />}
      {built != null && built < n && <Crane w={w} d={d} H={H} top={Math.max(built, 0) * FLOOR_H} />}
      <Dim from={[w / 2, 0, d / 2]} to={[w / 2, H, d / 2]} offset={[7, 0, 0]} />
      <Dim from={[-plotW / 2, 0, plotD / 2]} to={[plotW / 2, 0, plotD / 2]} offset={[0, 0, 3]} />
      <Dim from={[-plotW / 2, 0, -plotD / 2]} to={[-plotW / 2, 0, plotD / 2]} offset={[-3, 0, 0]} />
    </group>
  );
}

/** Tower crane in linework: lattice mast, jib, counter-jib, hook line down to the working slab. */
function Crane({ w, d, H, top }: { w: number; d: number; H: number; top: number }) {
  const geo = useMemo(() => {
    const mx = w / 2 + 4, mz = -d / 2 - 3, s = 0.7, h = H + 9;
    const p: number[] = [];
    for (const [a, b] of [[-s, -s], [s, -s], [s, s], [-s, s]]) p.push(mx + a, 0, mz + b, mx + a, h, mz + b);
    for (let y = 0; y < h - 1.6; y += 1.6) {
      p.push(mx - s, y, mz - s, mx + s, y + 1.6, mz - s, mx + s, y, mz + s, mx - s, y + 1.6, mz + s);
    }
    const jx0 = mx + 9, jx1 = mx - w - 12;
    p.push(jx0, h, mz, jx1, h, mz, mx, h + 1.6, mz, jx1, h + 1.6 * 0, mz);
    for (let x = jx1; x < jx0 - 2; x += 2) p.push(x, h, mz, x + 1, h + 1.4, mz, x + 1, h + 1.4, mz, x + 2, h, mz);
    p.push(mx, h, mz, mx, h + 5, mz, mx, h + 5, mz, jx1 + 6, h, mz, mx, h + 5, mz, jx0, h, mz);
    const hx = -w / 6;
    p.push(hx, h, mz, hx, top + 2.4, mz);
    p.push(hx - 0.8, top + 2.4, mz, hx + 0.8, top + 2.4, mz);
    return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  }, [w, d, H, top]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={CYAN} transparent opacity={0.6} />
    </lineSegments>
  );
}

/** World direction for a compass bearing, given that the building front (+z) faces `front` degrees. */
function bearingVec(bearing: number, front: number, alt = 0) {
  const a = (bearing - front) * (Math.PI / 180), h = alt * (Math.PI / 180);
  return new THREE.Vector3(-Math.cos(h) * Math.sin(a), Math.sin(h), Math.cos(h) * Math.cos(a));
}

function NorthPoint({ front, plotW, plotD }: { front: number; plotW: number; plotD: number }) {
  const geo = useMemo(() => {
    const c = new THREE.Vector3(-plotW / 2 - 9, 0.05, plotD / 2 + 7);
    const n = bearingVec(0, front), e = bearingVec(90, front);
    const tip = c.clone().addScaledVector(n, 6), tail = c.clone().addScaledVector(n, -3.4);
    const l = c.clone().addScaledVector(e, -1.6), r = c.clone().addScaledVector(e, 1.6);
    const pts = [tail, tip, tip, l, tip, r, l, c, r, c];
    for (let k = 0; k < 48; k++) {
      const a0 = (k / 48) * Math.PI * 2, a1 = ((k + 1) / 48) * Math.PI * 2;
      pts.push(new THREE.Vector3(c.x + 3.4 * Math.cos(a0), 0.05, c.z + 3.4 * Math.sin(a0)), new THREE.Vector3(c.x + 3.4 * Math.cos(a1), 0.05, c.z + 3.4 * Math.sin(a1)));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [front, plotW, plotD]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={WHITE} transparent opacity={0.85} />
    </lineSegments>
  );
}

function hull(pts: [number, number][]) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], up: [number, number][] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

/** Sun path for the day, the sun itself, and the building's cast shadow on the ground. */
function SunStudy({ lat, lon, doy, hour, front, w, d, H }: { lat: number; lon: number; doy: number; hour: number; front: number; w: number; d: number; H: number }) {
  const R = Math.max(60, H * 1.4);
  const path = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let t = 4; t <= 20; t += 0.25) {
      const p = sunPosition(lat, lon, doy, t);
      if (p.alt > 0) pts.push(bearingVec(p.az, front, p.alt).multiplyScalar(R));
    }
    const seg: THREE.Vector3[] = [];
    for (let i = 0; i < pts.length - 1; i += 2) seg.push(pts[i], pts[i + 1]);
    return new THREE.BufferGeometry().setFromPoints(seg);
  }, [lat, lon, doy, front, R]);
  const sp = sunPosition(lat, lon, doy, hour);
  const dir = bearingVec(sp.az, front, sp.alt);
  const shadow = useMemo(() => {
    if (sp.alt < 2) return null;
    const k = H / Math.max(0.05, dir.y);
    const base: [number, number][] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
    const tops = base.map(([x, z]) => [x - dir.x * k, z - dir.z * k] as [number, number]);
    const hl = hull([...base, ...tops]);
    const shape = new THREE.Shape(hl.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.03, 0);
    const edge = new THREE.BufferGeometry().setFromPoints(hl.flatMap(([x, z], i) => {
      const [x2, z2] = hl[(i + 1) % hl.length];
      return [new THREE.Vector3(x, 0.04, z), new THREE.Vector3(x2, 0.04, z2)];
    }));
    return { g, edge };
  }, [sp.alt, dir.x, dir.y, dir.z, w, d, H]);
  return (
    <group>
      <lineSegments geometry={path}>
        <lineBasicMaterial color={WHITE} transparent opacity={0.45} />
      </lineSegments>
      {sp.alt > 0 && (
        <mesh position={dir.clone().multiplyScalar(R)}>
          <sphereGeometry args={[1.6, 20, 14]} />
          <meshBasicMaterial color={WHITE} />
        </mesh>
      )}
      {shadow && (
        <>
          <mesh geometry={shadow.g}><meshBasicMaterial color="#020f1e" transparent opacity={0.45} depthWrite={false} side={THREE.DoubleSide} /></mesh>
          <lineSegments geometry={shadow.edge}><lineBasicMaterial color={CYAN} transparent opacity={0.6} /></lineSegments>
        </>
      )}
    </group>
  );
}

function Roof({ w, d, y }: { w: number; d: number; y: number }) {
  const geo = useMemo(() => {
    const r = 2.6;
    const pts = [
      -w / 2, y, d / 2, 0, y + r, d / 2, 0, y + r, d / 2, w / 2, y, d / 2,
      -w / 2, y, -d / 2, 0, y + r, -d / 2, 0, y + r, -d / 2, w / 2, y, -d / 2,
      0, y + r, d / 2, 0, y + r, -d / 2,
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [w, d, y]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={WHITE} transparent opacity={0.6} />
    </lineSegments>
  );
}

export default function Elevation(p: Props) {
  const L = layoutFor(p);
  const labels = labelsFor(L, p);
  const front = facingAz(p.facing ?? "East");
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const H = Math.max(L.n, 2) * FLOOR_H;
  const dist = Math.max(48, H * 1.75);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
    <Canvas
      camera={{ position: [dist * 0.85, H * 0.75 + 10, dist * 0.95], fov: 34, near: 0.5, far: 2000 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      aria-label="Wireframe elevation of the subject property"
    >
      <Grid
        args={[400, 400]} cellSize={2} cellThickness={0.6} cellColor="#2a5a8a" sectionSize={10}
        sectionThickness={1} sectionColor="#3d74aa" fadeDistance={170} fadeStrength={1.6} infiniteGrid
      />
      <Building L={L} drawKey={p.drawKey} built={p.built ?? null} />
      <NorthPoint front={front} plotW={L.plotW} plotD={L.plotD} />
      {p.lat != null && p.lon != null && p.sunDoy != null && p.sunHour != null && (
        <SunStudy lat={p.lat} lon={p.lon} doy={p.sunDoy} hour={p.sunHour} front={front} w={L.w} d={L.d}
          H={(p.built != null ? Math.min(Math.max(p.built, 0), L.n) : L.n) * FLOOR_H + (L.house ? 2.6 : 0)} />
      )}
      <Projector labels={labels} refs={refs} />
      <OrbitControls
        target={[0, H * 0.42, 0]} autoRotate autoRotateSpeed={0.55} enablePan={false}
        minDistance={20} maxDistance={260} maxPolarAngle={Math.PI / 2.05}
      />
    </Canvas>
      {labels.map((l, i) => (
        <div key={l.text} ref={(el) => { refs.current[i] = el; }} aria-hidden
          style={{
            position: "absolute", left: 0, top: 0, pointerEvents: "none", whiteSpace: "nowrap", textTransform: "uppercase",
            fontStretch: "72%", fontWeight: l.subject ? 700 : 600, letterSpacing: "0.1em", fontSize: l.subject ? 11 : 10.5,
            color: l.subject ? "#071f38" : "#b5cde6", background: l.subject ? "#f2b233" : "#0b2a4a",
            padding: l.subject ? "2px 7px" : "1px 5px", marginLeft: l.subject ? -10 : 0, opacity: 0,
          }}>{l.text}</div>
      ))}
    </div>
  );
}
