import { useEffect, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number; z: number; size: number; rx: number; ry: number };

const CUBES: Point[] = [
  { x: -112, y: -112, z: 14, size: 84, rx: 6, ry: -12 },
  { x: -30, y: -128, z: 28, size: 90, rx: -10, ry: 16 },
  { x: 54, y: -108, z: -12, size: 80, rx: 12, ry: -10 },
  { x: -136, y: -24, z: 4, size: 86, rx: -6, ry: 9 },
  { x: -52, y: -24, z: 44, size: 74, rx: 8, ry: -16 },
  { x: 34, y: -16, z: 10, size: 92, rx: -8, ry: 12 },
  { x: 118, y: -22, z: -22, size: 80, rx: 10, ry: -12 },
  { x: -122, y: 66, z: -16, size: 90, rx: -10, ry: 8 },
  { x: -30, y: 56, z: 8, size: 92, rx: 6, ry: -8 },
  { x: 58, y: 68, z: 28, size: 84, rx: -12, ry: 14 },
  { x: 136, y: 62, z: -8, size: 76, rx: 6, ry: -16 },
  { x: -18, y: 146, z: -14, size: 88, rx: -8, ry: 6 },
];

const SYMBOLS = [
  { s: "lambda", x: "8%", y: "18%" },
  { s: "pi", x: "20%", y: "74%" },
  { s: "Sigma", x: "84%", y: "20%" },
  { s: "sqrt", x: "76%", y: "48%" },
  { s: "delta", x: "92%", y: "70%" },
  { s: "integral", x: "56%", y: "12%" },
];

function Cube({ cube }: Readonly<{ cube: Point }>) {
  const half = cube.size / 2;
  const shell = `translate3d(${cube.x}px, ${cube.y}px, ${cube.z}px) rotateX(${cube.rx}deg) rotateY(${cube.ry}deg)`;
  const face = "absolute inset-0 border border-cream/65 bg-transparent";
  return (
    <div
      className="absolute left-1/2 top-1/2 [transform-style:preserve-3d]"
      style={{ width: cube.size, height: cube.size, transform: shell }}
    >
      <span className={face} style={{ transform: `translateZ(${half}px)` }} />
      <span className={face} style={{ transform: `rotateY(180deg) translateZ(${half}px)` }} />
      <span className={face} style={{ transform: `rotateY(90deg) translateZ(${half}px)` }} />
      <span className={face} style={{ transform: `rotateY(-90deg) translateZ(${half}px)` }} />
      <span className={face} style={{ transform: `rotateX(90deg) translateZ(${half}px)` }} />
      <span className={face} style={{ transform: `rotateX(-90deg) translateZ(${half}px)` }} />
    </div>
  );
}

export function HeroWireframe() {
  const [rotation, setRotation] = useState({ x: -22, y: 26 });
  const [dragging, setDragging] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
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
    if (dragging || reducedMotion) return;
    const loop = () => {
      setRotation((prev) => ({ x: prev.x, y: prev.y + 0.16 }));
      frame.current = window.requestAnimationFrame(loop);
    };
    frame.current = window.requestAnimationFrame(loop);
    return () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, [dragging, reducedMotion]);

  const wireTransform = useMemo(
    () => `translate(-50%, -50%) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
    [rotation.x, rotation.y],
  );

  return (
    <div className="relative ml-auto hidden w-full max-w-[36rem] lg:block">
      <div className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-gold/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-16 -left-14 h-52 w-52 rounded-full bg-teal/15 blur-3xl" aria-hidden />
      {SYMBOLS.map((glyph) => (
        <span
          key={glyph.s}
          className="pointer-events-none absolute text-base font-medium tracking-wide text-cream/20"
          style={{ left: glyph.x, top: glyph.y }}
          aria-hidden
        >
          {glyph.s}
        </span>
      ))}
      <div
        className={`relative h-[32rem] w-full touch-none select-none overflow-hidden rounded-[2.5rem] border border-cream/16 bg-gradient-to-b from-green-900/20 via-green-900/10 to-teal/20 shadow-[var(--shadow-lift)] ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ perspective: "1200px" }}
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
        aria-label="Interactive wireframe cube sculpture"
      >
        <div className="absolute inset-0 [transform-style:preserve-3d]">
          <div
            className="absolute left-1/2 top-1/2 [transform-style:preserve-3d] will-change-transform"
            style={{ transform: wireTransform }}
          >
            {CUBES.map((cube, index) => (
              <Cube key={`${cube.x}-${cube.y}-${index}`} cube={cube} />
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs font-medium tracking-wide text-cream/60">
        Drag to rotate
      </p>
    </div>
  );
}
