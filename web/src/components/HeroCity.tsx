import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const WHITE = new THREE.Color("#e8f1fb");
const CYAN = new THREE.Color("#7fb2e5");
const AMBER = new THREE.Color("#f2b233");

type Lot = { x: number; z: number; w: number; d: number; h: number; dist: number; subject: boolean };

function rand(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function lots(): Lot[] {
  const r = rand(42);
  const out: Lot[] = [];
  const N = 6, P = 13;
  for (let i = -N; i <= N; i++) {
    for (let j = -N; j <= N; j++) {
      if ((i === 2 || i === -3) || j === 1) continue; // streets
      const subject = i === 0 && j === 0;
      const dist = Math.hypot(i, j);
      if (dist > N + 0.4 || (!subject && r() < 0.12)) continue;
      const w = 5 + r() * 5, d = 5 + r() * 5;
      const core = Math.max(0, 1 - dist / N);
      const h = subject ? 46 : 4 + Math.pow(r(), 1.6) * 30 * (0.35 + core) + (r() < 0.06 ? 22 : 0);
      out.push({ x: i * P + (r() - 0.5) * 2, z: j * P + (r() - 0.5) * 2, w: subject ? 8 : w, d: subject ? 8 : d, h, dist, subject });
    }
  }
  return out;
}

function Tower({ l, t0 }: { l: Lot; t0: React.MutableRefObject<number | null> }) {
  const g = useRef<THREE.Group>(null!);
  const geo = useMemo(() => {
    const e = new THREE.EdgesGeometry(new THREE.BoxGeometry(l.w, l.h, l.d));
    e.translate(0, l.h / 2, 0);
    return e;
  }, [l]);
  const floors = useMemo(() => {
    const p: number[] = [];
    const step = 3;
    for (let y = step; y < l.h - 0.5; y += step) {
      p.push(-l.w / 2, y, l.d / 2, l.w / 2, y, l.d / 2, l.w / 2, y, l.d / 2, l.w / 2, y, -l.d / 2);
    }
    const b = new THREE.BufferGeometry();
    b.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    return b;
  }, [l]);
  const mat = useRef<THREE.LineBasicMaterial>(null!);
  useFrame(({ clock }) => {
    if (t0.current === null) t0.current = clock.elapsedTime;
    const t = Math.min(1, Math.max(0, (clock.elapsedTime - t0.current - l.dist * 0.16) / 1.1));
    const e = 1 - Math.pow(1 - t, 4);
    g.current.scale.y = Math.max(0.001, e);
    if (mat.current) mat.current.opacity = (l.subject ? 1 : 0.62 - l.dist * 0.045) * Math.min(1, t * 2);
  });
  const col = l.subject ? AMBER : WHITE;
  return (
    <group ref={g} position={[l.x, 0, l.z]}>
      <lineSegments geometry={geo}>
        <lineBasicMaterial ref={mat} color={col} transparent opacity={0} />
      </lineSegments>
      <lineSegments geometry={floors}>
        <lineBasicMaterial color={l.subject ? AMBER : CYAN} transparent opacity={l.subject ? 0.7 : 0.16} />
      </lineSegments>
      {l.subject && (
        <mesh position={[0, l.h / 2, 0]}>
          <boxGeometry args={[l.w * 0.99, l.h, l.d * 0.99]} />
          <meshBasicMaterial color={AMBER} transparent opacity={0.14} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Expanding survey ring: the engine scanning the neighbourhood for evidence. */
function Scan() {
  const m = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime % 4.2) / 4.2;
    const r = 4 + t * 90;
    m.current.scale.set(r, r, r);
    mat.current.opacity = 0.55 * (1 - t);
  });
  return (
    <mesh ref={m} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
      <ringGeometry args={[0.985, 1, 128]} />
      <meshBasicMaterial ref={mat} color={CYAN} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function Rig({ target }: { target: React.MutableRefObject<{ x: number; y: number }> }) {
  const g = useRef<THREE.Group>(null!);
  const { camera } = useThree();
  useFrame(({ clock }) => {
    const a = clock.elapsedTime * 0.06 + target.current.x * 0.35;
    const R = 150;
    camera.position.set(Math.sin(a) * R, 78 + target.current.y * 14, Math.cos(a) * R);
    camera.lookAt(0, 14, 0);
  });
  return <group ref={g} />;
}

/** Projects the subject's roof to the screen and moves the value tag there. */
function Tag({ el }: { el: React.MutableRefObject<HTMLDivElement | null> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size, clock }) => {
    if (!el.current) return;
    v.set(0, 50, 0).project(camera);
    el.current.style.transform = `translate(${(v.x * 0.5 + 0.5) * size.width}px, ${(-v.y * 0.5 + 0.5) * size.height}px) translate(-50%, -100%)`;
    el.current.style.opacity = clock.elapsedTime > 2.4 ? "1" : "0";
  });
  return null;
}

export default function HeroCity() {
  const L = useMemo(lots, []);
  const t0 = useRef<number | null>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const tag = useRef<HTMLDivElement | null>(null);
  return (
    <div style={{ position: "absolute", inset: 0 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mouse.current = { x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 };
      }}>
      <Canvas camera={{ position: [120, 80, 120], fov: 32, near: 1, far: 2000 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}
        aria-label="A wireframe city rising around an amber subject building while a survey ring scans the neighbourhood">
        <Grid args={[800, 800]} cellSize={4} cellThickness={0.5} cellColor="#1d4b78" sectionSize={13} sectionThickness={0.9}
          sectionColor="#2f6aa3" fadeDistance={260} fadeStrength={1.4} infiniteGrid />
        {L.map((l, i) => <Tower key={i} l={l} t0={t0} />)}
        <Scan />
        <Rig target={mouse} />
        <Tag el={tag} />
      </Canvas>
      <div ref={tag} aria-hidden className="hero-tag" style={{
        position: "absolute", left: 0, top: 0, pointerEvents: "none", opacity: 0, transition: "opacity .6s",
        background: "var(--amber)", color: "#071f38", padding: "6px 10px 7px", whiteSpace: "nowrap",
      }}>
        <div className="label" style={{ fontSize: 9, color: "#071f38" }}>Subject · 2 BHK · floor 9</div>
        <div className="num" style={{ fontStretch: "80%", fontWeight: 800, fontSize: 20, lineHeight: 1.05 }}>₹2.82 Cr <span style={{ fontWeight: 600, fontSize: 13 }}>± 22.5%</span></div>
        <div className="label" style={{ fontSize: 9, color: "#071f38" }}>Desk review · 40 comps ≤ 1 km</div>
        <div style={{ position: "absolute", left: "50%", bottom: -10, width: 1, height: 10, background: "var(--amber)" }} />
      </div>
    </div>
  );
}
