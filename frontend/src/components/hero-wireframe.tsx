import { useEffect, useMemo, useRef, useState } from "react";

const ASAFO_COMPANIES = [
  { s: "Bentsir", x: "8%", y: "18%" },
  { s: "Anaafo", x: "19%", y: "74%" },
  { s: "Ntsin", x: "84%", y: "20%" },
  { s: "Nkum", x: "78%", y: "50%" },
  { s: "Amanful", x: "92%", y: "70%" },
  { s: "Brofomba", x: "55%", y: "11%" },
  { s: "Akrampa", x: "34%", y: "86%" },
];

function Prism({
  width,
  height,
  depth,
  x,
  y,
  z,
  className = "",
}: Readonly<{
  width: number;
  height: number;
  depth: number;
  x: number;
  y: number;
  z: number;
  className?: string;
}>) {
  const hw = width / 2;
  const hh = height / 2;
  const hd = depth / 2;
  const face = `absolute border border-cream/70 bg-cream/[0.07] ${className}`;
  return (
    <div
      className="absolute left-1/2 top-1/2 [transform-style:preserve-3d]"
      style={{ width, height, transform: `translate3d(${x}px, ${y}px, ${z}px)` }}
    >
      <span className={face} style={{ inset: 0, transform: `translateZ(${hd}px)` }} />
      <span className={face} style={{ inset: 0, transform: `rotateY(180deg) translateZ(${hd}px)` }} />
      <span className={face} style={{ inset: 0, width: depth, left: hw - hd, transform: `rotateY(90deg) translateZ(${hw}px)` }} />
      <span className={face} style={{ inset: 0, width: depth, left: hw - hd, transform: `rotateY(-90deg) translateZ(${hw}px)` }} />
      <span className={face} style={{ inset: 0, height: depth, top: hh - hd, transform: `rotateX(90deg) translateZ(${hh}px)` }} />
      <span className={face} style={{ inset: 0, height: depth, top: hh - hd, transform: `rotateX(-90deg) translateZ(${hh}px)` }} />
    </div>
  );
}

function CrenelLine({
  positions,
  y,
  z,
  along = "x",
}: Readonly<{
  positions: number[];
  y: number;
  z: number;
  along?: "x" | "z";
}>) {
  return (
    <>
      {positions.map((pos) => (
        <Prism
          key={`${along}-${z}-${pos}`}
          width={10}
          height={12}
          depth={10}
          x={along === "x" ? pos : z}
          y={y}
          z={along === "x" ? z : pos}
        />
      ))}
    </>
  );
}

function Battlements({ tick }: Readonly<{ tick: number }>) {
  const pulse = 0.75 + Math.sin(tick * 1.4) * 0.08;
  const frontBack = Array.from({ length: 13 }, (_, i) => -120 + i * 20);
  const sides = Array.from({ length: 6 }, (_, i) => -44 + i * 20);
  return (
    <>
      <CrenelLine positions={frontBack} y={-78} z={56} />
      <CrenelLine positions={frontBack} y={-78} z={-56} />
      <CrenelLine positions={sides} y={-78} z={-130} along="z" />
      <CrenelLine positions={sides} y={-78} z={130} along="z" />
      <div
        className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 rounded-full border border-cream/50 bg-cream/[0.03]"
        style={{
          transform: `translate3d(0px, -92px, 0px) rotateX(90deg) scale(${pulse})`,
        }}
      />
    </>
  );
}

function Tower({
  x,
  z,
  tick,
}: Readonly<{ x: number; z: number; tick: number }>) {
  const sway = Math.sin(tick * 1.1 + (x + z) * 0.02) * 0.9;
  return (
    <div
      className="absolute left-1/2 top-1/2 [transform-style:preserve-3d]"
      style={{ transform: `translate3d(${x}px, ${sway}px, ${z}px)` }}
    >
      <Prism width={38} height={118} depth={38} x={0} y={-20} z={0} className="bg-cream/[0.08]" />
      <Prism width={30} height={18} depth={30} x={0} y={-86} z={0} />
      <Prism width={8} height={14} depth={8} x={-11} y={-100} z={14} />
      <Prism width={8} height={14} depth={8} x={0} y={-100} z={14} />
      <Prism width={8} height={14} depth={8} x={11} y={-100} z={14} />
      <div
        className="absolute left-1/2 top-1/2 h-8 w-[2px] rounded-full border border-cream/70 bg-cream/[0.2]"
        style={{ transform: "translate3d(0px, -114px, 8px)" }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-3 w-8 rounded-sm border border-gold/70 bg-gold/25"
        style={{ transform: `translate3d(14px, -126px, 8px) rotateY(20deg) skewX(${Math.sin(tick * 1.5) * 7}deg)` }}
      />
    </div>
  );
}

export function HeroWireframe() {
  const [rotation, setRotation] = useState({ x: -16, y: 18 });
  const [dragging, setDragging] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [tick, setTick] = useState(0);
  const dragPoint = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const loop = () => {
      setTick((prev) => prev + 0.007);
      setRotation((prev) => (dragging ? prev : { x: prev.x, y: prev.y + 0.04 }));
      frame.current = window.requestAnimationFrame(loop);
    };
    frame.current = window.requestAnimationFrame(loop);
    return () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, [dragging, reducedMotion]);

  const castleTransform = useMemo(() => {
    const driftX = Math.sin(tick * 0.26) * 16;
    const driftZ = Math.cos(tick * 0.2) * 14;
    const bob = Math.sin(tick * 0.9) * 1.1;
    return `translate3d(${driftX}px, ${bob}px, ${driftZ}px)`;
  }, [tick]);

  const sceneTransform = useMemo(
    () => `translate(-50%, -50%) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
    [rotation.x, rotation.y],
  );

  return (
    <div className="relative ml-auto hidden w-full max-w-[36rem] lg:block">
      <div className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-gold/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-16 -left-14 h-52 w-52 rounded-full bg-teal/15 blur-3xl" aria-hidden />
      {ASAFO_COMPANIES.map((glyph) => (
        <span
          key={glyph.s}
          className="pointer-events-none absolute text-sm font-semibold tracking-wide text-cream/30"
          style={{ left: glyph.x, top: glyph.y }}
          aria-hidden
        >
          {glyph.s}
        </span>
      ))}
      <div
        className={`relative h-[30rem] w-full touch-none select-none overflow-hidden rounded-[2.5rem] border border-cream/16 bg-gradient-to-b from-green-900/25 via-green-900/12 to-teal/20 shadow-[var(--shadow-lift)] ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ perspective: "1300px" }}
        onPointerDown={(event) => {
          setDragging(true);
          dragPoint.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragging || !dragPoint.current) return;
          const dx = event.clientX - dragPoint.current.x;
          const dy = event.clientY - dragPoint.current.y;
          dragPoint.current = { x: event.clientX, y: event.clientY };
          setRotation((prev) => ({
            x: Math.max(-52, Math.min(34, prev.x - dy * 0.18)),
            y: prev.y + dx * 0.18,
          }));
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          dragPoint.current = null;
          setDragging(false);
        }}
        onPointerCancel={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          dragPoint.current = null;
          setDragging(false);
        }}
        onPointerLeave={() => {
          dragPoint.current = null;
          setDragging(false);
        }}
        role="img"
        aria-label="Interactive transparent castle in 3D space"
      >
        <div className="absolute inset-0 [transform-style:preserve-3d]">
          <div
            className="absolute left-1/2 top-1/2 h-[23rem] w-[23rem] rounded-full border border-cream/15"
            style={{
              transform: "translate(-50%, -50%) rotateX(90deg) translateZ(-118px)",
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(246,241,231,0.07), rgba(246,241,231,0.07) 1px, transparent 1px, transparent 26px), repeating-linear-gradient(90deg, rgba(246,241,231,0.07), rgba(246,241,231,0.07) 1px, transparent 1px, transparent 26px)",
            }}
            aria-hidden
          />
          <div
            className="absolute left-1/2 top-1/2 [transform-style:preserve-3d] will-change-transform"
            style={{ transform: sceneTransform }}
          >
            <div
              className="absolute left-1/2 top-1/2 [transform-style:preserve-3d]"
              style={{ transform: castleTransform }}
            >
              {/* Seafront platform and long main mass (Cape Coast silhouette) */}
              <Prism width={286} height={14} depth={152} x={0} y={46} z={0} className="bg-cream/[0.05]" />
              <Prism width={258} height={88} depth={116} x={0} y={-10} z={0} className="bg-cream/[0.09]" />
              <Prism width={184} height={66} depth={64} x={-18} y={-50} z={-14} className="bg-cream/[0.08]" />

              {/* Central gatehouse / portal toward the sea */}
              <Prism width={64} height={92} depth={40} x={8} y={-30} z={82} className="bg-cream/[0.08]" />
              <Prism width={28} height={54} depth={22} x={8} y={-14} z={94} className="bg-green-950/30" />
              <Prism width={16} height={44} depth={14} x={-18} y={-20} z={82} className="bg-cream/[0.05]" />
              <Prism width={16} height={44} depth={14} x={34} y={-20} z={82} className="bg-cream/[0.05]" />

              {/* Repetitive facade blocks to suggest barracks windows */}
              <Prism width={14} height={24} depth={12} x={-82} y={-20} z={44} className="bg-cream/[0.04]" />
              <Prism width={14} height={24} depth={12} x={-54} y={-20} z={44} className="bg-cream/[0.04]" />
              <Prism width={14} height={24} depth={12} x={-26} y={-20} z={44} className="bg-cream/[0.04]" />
              <Prism width={14} height={24} depth={12} x={2} y={-20} z={44} className="bg-cream/[0.04]" />
              <Prism width={14} height={24} depth={12} x={30} y={-20} z={44} className="bg-cream/[0.04]" />
              <Prism width={14} height={24} depth={12} x={58} y={-20} z={44} className="bg-cream/[0.04]" />

              {/* Asymmetric corner bastions/towers */}
              <Tower x={-122} z={-44} tick={tick} />
              <Tower x={108} z={-42} tick={tick} />
              <Tower x={-130} z={40} tick={tick} />
              <Tower x={102} z={38} tick={tick} />

              <Battlements tick={tick} />
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs font-medium tracking-wide text-cream/60">
        Drag to orbit Cape Coast Castle
      </p>
    </div>
  );
}
