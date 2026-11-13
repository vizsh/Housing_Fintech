import { Canvas, useFrame } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { Flow } from "../api";
import { inr } from "../format";

type Props = { flows: Flow[]; wale: number; exitValue: number; exitCap: number; drawKey: number };

const WHITE = new THREE.Color("#e8f1fb");
const CYAN = new THREE.Color("#7fb2e5");
const SP = 4.2, W = 2.6, HMAX = 22;

const xOf = (year: number) => (year - 5.5) * SP;

/** One year of net income as a wireframe column; the filled core is its present value. */
function Column({ f, h, hpv, drawKey }: { f: Flow; h: number; hpv: number; drawKey: number }) {
  const g = useRef<THREE.Group>(null!);
  const t0 = useRef<{ k: number; t: number } | null>(null);
  const outer = useMemo(() => {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(W, h, W));
    geo.translate(0, h / 2, 0);
    return geo;
  }, [h]);
  const core = useMemo(() => {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(W * 0.62, hpv, W * 0.62));
    geo.translate(0, hpv / 2, 0);
    return geo;
  }, [hpv]);
  const ref = useRef<THREE.LineSegments>(null!);
  useFrame(({ clock }) => {
    if (!t0.current || t0.current.k !== drawKey) {
      t0.current = { k: drawKey, t: clock.elapsedTime };
      ref.current?.computeLineDistances();
    }
    const t = Math.min(1, Math.max(0, (clock.elapsedTime - t0.current.t - f.year * 0.08) / 0.55));
    g.current.scale.y = Math.max(0.001, 1 - Math.pow(1 - t, 3));
  });
  return (
    <group ref={g} position={[xOf(f.year), 0, 0]}>
      <lineSegments ref={ref} geometry={outer}>
        {f.leased
          ? <lineBasicMaterial color={WHITE} transparent opacity={0.85} />
          : <lineDashedMaterial color={CYAN} dashSize={0.6} gapSize={0.4} transparent opacity={0.9} />}
      </lineSegments>
      <mesh position={[0, hpv / 2, 0]}>
        <boxGeometry args={[W * 0.62, hpv, W * 0.62]} />
        <meshBasicMaterial color={f.leased ? "#b5cde6" : "#7fb2e5"} transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <lineSegments geometry={core}>
        <lineBasicMaterial color={CYAN} transparent opacity={0.7} />
      </lineSegments>
    </group>
  );
}

function ExpiryPlane({ x }: { x: number }) {
  const geo = useMemo(() => {
    const h = HMAX * 1.25, d = 4.5;
    const p = [x, 0, -d, x, h, -d, x, h, -d, x, h, d, x, h, d, x, 0, d, x, 0, d, x, 0, -d];
    for (let y = 2; y < h; y += 2) p.push(x, y, -d, x, Math.min(h, y + 2), d); // hatch
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    return g;
  }, [x]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={CYAN} transparent opacity={0.4} />
    </lineSegments>
  );
}

type Label = { pos: [number, number, number]; text: string; kind?: "axis" | "callout" };

function Projector({ labels, refs }: { labels: Label[]; refs: MutableRefObject<(HTMLDivElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    labels.forEach((l, i) => {
      const el = refs.current[i];
      if (!el) return;
      v.set(...l.pos).project(camera);
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * size.width}px, ${(-v.y * 0.5 + 0.5) * size.height}px) translate(-50%, -50%)`;
      el.style.opacity = v.z < 1 ? "1" : "0";
    });
  });
  return null;
}

export default function CashflowSkyline({ flows, wale, exitValue, exitCap, drawKey }: Props) {
  const max = Math.max(...flows.map((f) => f.noi), 1);
  const hs = flows.map((f) => ({ h: Math.max(0.2, (f.noi / max) * HMAX), hpv: Math.max(0.1, (f.pv / max) * HMAX) }));
  const expiryX = wale < 10 ? xOf(Math.floor(wale) + 0.5) : null;
  const last = flows[flows.length - 1];
  const labels: Label[] = [
    ...flows.map((f) => ({ pos: [xOf(f.year), -1.2, W / 2 + 1.2] as [number, number, number], text: `Y${f.year}`, kind: "axis" as const })),
    { pos: [xOf(1), hs[0].h + 1.6, 0], text: `NOI ${inr(flows[0].noi)}` },
    { pos: [xOf(last.year), hs[hs.length - 1].h + 1.6, 0], text: `${inr(last.noi)} · +exit ${inr(exitValue)} at ${(exitCap * 100).toFixed(2)}%` },
    ...(expiryX !== null ? [{ pos: [expiryX, HMAX * 1.25 + 1.2, 0] as [number, number, number], text: `Lease expiry · ${wale.toFixed(1)} yrs`, kind: "callout" as const }] : []),
  ];
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Canvas camera={{ position: [30, 26, 52], fov: 36, near: 0.5, far: 1000 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}
        aria-label="Ten-year net operating income, drawn as columns; filled cores show present value">
        <Grid args={[300, 300]} cellSize={2} cellThickness={0.6} cellColor="#2a5a8a" sectionSize={SP * 2.5}
          sectionThickness={1} sectionColor="#3d74aa" fadeDistance={140} fadeStrength={1.6} infiniteGrid />
        {flows.map((f, i) => <Column key={`${drawKey}-${f.year}`} f={f} h={hs[i].h} hpv={hs[i].hpv} drawKey={drawKey} />)}
        {expiryX !== null && <ExpiryPlane x={expiryX} />}
        <Projector labels={labels} refs={refs} />
        <OrbitControls target={[0, 12, 0]} autoRotate autoRotateSpeed={0.3} enablePan={false} minDistance={20} maxDistance={160} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
      {labels.map((l, i) => (
        <div key={`${l.text}-${i}`} ref={(el) => { refs.current[i] = el; }} aria-hidden
          style={{
            position: "absolute", left: 0, top: 0, pointerEvents: "none", whiteSpace: "nowrap", textTransform: "uppercase",
            fontStretch: "72%", fontWeight: 600, letterSpacing: "0.1em", fontSize: l.kind === "axis" ? 10 : 10.5, opacity: 0,
            color: l.kind === "axis" ? "#86a8cb" : "#b5cde6", background: l.kind === "axis" ? "transparent" : "#0b2a4a",
            border: l.kind === "callout" ? "1px solid rgba(214,233,252,0.32)" : 0, padding: l.kind === "axis" ? 0 : "1px 5px",
          }}>{l.text}</div>
      ))}
      <div className="label" style={{ position: "absolute", left: 16, bottom: 12, fontSize: 9.5, display: "flex", gap: 16, pointerEvents: "none" }}>
        <span><span style={{ display: "inline-block", width: 14, borderTop: "1px solid var(--ink)", verticalAlign: "middle", marginRight: 6 }} />Contracted lease</span>
        <span><span style={{ display: "inline-block", width: 14, borderTop: "1px dashed var(--cyan)", verticalAlign: "middle", marginRight: 6 }} />Re-let at market</span>
        <span><span style={{ display: "inline-block", width: 10, height: 8, background: "rgba(181,205,230,0.3)", verticalAlign: "middle", marginRight: 6 }} />Present value</span>
      </div>
    </div>
  );
}
