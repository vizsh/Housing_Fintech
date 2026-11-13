import { motion, useReducedMotion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

export function Panel({ title, meta, children, style, bodyStyle, className }: {
  title: string; meta?: ReactNode; children: ReactNode; style?: CSSProperties; bodyStyle?: CSSProperties; className?: string;
}) {
  return (
    <section className={className} style={{ position: "relative", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, ...style }}>
      <header style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12,
        padding: "10px 16px 8px", borderBottom: "1px solid var(--line)",
      }}>
        <h2 className="label" style={{ margin: 0, color: "var(--ink-2)", fontSize: 11 }}>{title}</h2>
        {meta && <div className="label" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.08em" }}>{meta}</div>}
      </header>
      <div style={{ position: "relative", flex: 1, minHeight: 0, ...bodyStyle }}>{children}</div>
    </section>
  );
}

/** Digits settle one by one, like a mechanical counter, when the value changes. */
export function RollingNumber({ text, size = 64, color = "var(--ink)", weight = 600 }: {
  text: string; size?: number; color?: string; weight?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <span aria-label={text} style={{ display: "inline-flex", fontSize: size, lineHeight: 1, color, fontWeight: weight, fontStretch: "82%" }}>
      {text.split("").map((ch, i) => {
        const isDigit = /\d/.test(ch);
        if (!isDigit || reduce) return <span key={`${i}-${ch}`} aria-hidden>{ch}</span>;
        const d = Number(ch);
        return (
          <span key={i} aria-hidden style={{ display: "inline-block", height: "1em", overflow: "hidden", width: "0.6em", textAlign: "center" }}>
            <motion.span
              key={`${text}-${i}`}
              initial={{ y: `${-(10 + d)}em` }}
              animate={{ y: `${-d}em` }}
              transition={{ duration: 0.9 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: "flex", flexDirection: "column" }}
            >
              {Array.from({ length: 20 }, (_, k) => <span key={k} style={{ height: "1em" }}>{k % 10}</span>)}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: {
  value: T; options: { v: T; t: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "flex", border: "1px solid var(--line-2)" }}>
      {options.map((o, i) => {
        const on = o.v === value;
        return (
          <button
            key={o.v} role="radio" aria-checked={on} onClick={() => onChange(o.v)}
            style={{
              flex: 1, padding: "7px 6px", border: 0, borderLeft: i ? "1px solid var(--line-2)" : 0, cursor: "pointer",
              background: on ? "var(--ink)" : "transparent", color: on ? "var(--ground)" : "var(--ink-2)",
              fontStretch: "78%", fontWeight: 600, fontSize: 12, letterSpacing: "0.04em", transition: "background .2s",
            }}
          >{o.t}</button>
        );
      })}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span className="label">{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{hint}</span>}
    </label>
  );
}

export const inputStyle: CSSProperties = {
  width: "100%", background: "transparent", border: 0, borderBottom: "1px solid var(--line-2)", padding: "6px 0 5px",
  fontSize: 15, fontWeight: 500, outline: "none", color: "var(--ink)",
};

export function Stamp({ band, children }: { band: "green" | "amber" | "red"; children: ReactNode }) {
  const c = band === "green" ? "var(--green)" : band === "amber" ? "var(--amber)" : "var(--red)";
  return (
    <span style={{
      display: "inline-block", border: `1.5px solid ${c}`, color: c, padding: "2px 8px", fontStretch: "70%",
      fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 11,
    }}>{children}</span>
  );
}
