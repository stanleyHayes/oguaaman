import { useEffect, useMemo, useRef, useState } from "react";

type CubiePoint = { x: -1 | 0 | 1; y: -1 | 0 | 1; z: -1 | 0 | 1 };

const CUBIE_SIZE = 66;
const CUBIE_GAP = 6;
const CUBIE_STEP = CUBIE_SIZE + CUBIE_GAP;

const AXIS_VALUES = [-1, 0, 1] as const;
const CUBIES: CubiePoint[] = AXIS_VALUES.flatMap((x) =>
  AXIS_VALUES.flatMap((y) =>
    AXIS_VALUES.map((z) => ({ x, y, z })),
  ),
);

function Cubie({ cubie }: Readonly<{ cubie: CubiePoint }>) {
  const half = CUBIE_SIZE / 2;
  const shell = `translate3d(${cubie.x * CUBIE_STEP}px, ${cubie.y * CUBIE_STEP}px, ${cubie.z * CUBIE_STEP}px)`;
  const face = "absolute inset-0 rounded-[8px] border border-cream/25 bg-[#0f3a2b]";
  const sticker = "absolute inset-[14%] rounded-[5px]";

  const faceFill = {
    front: "#f4efe0",
    back: "#1e6b4f",
    right: "#b07d32",
    left: "#b0503c",
    top: "#0e7c6b",
    bottom: "#2e4d90",
  } as const;

  return (
    <div
      className="absolute left-1/2 top-1/2 [transform-style:preserve-3d]"
      style={{ width: CUBIE_SIZE, height: CUBIE_SIZE, transform: shell }}
    >
      <span className={face} style={{ transform: `translateZ(${half}px)` }}>
        {cubie.z === 1 && <span className={sticker} style={{ backgroundColor: faceFill.front }} />}
      </span>
      <span className={face} style={{ transform: `rotateY(180deg) translateZ(${half}px)` }}>
        {cubie.z === -1 && <span className={sticker} style={{ backgroundColor: faceFill.back }} />}
      </span>
      <span className={face} style={{ transform: `rotateY(90deg) translateZ(${half}px)` }}>
        {cubie.x === 1 && <span className={sticker} style={{ backgroundColor: faceFill.right }} />}
      </span>
      <span className={face} style={{ transform: `rotateY(-90deg) translateZ(${half}px)` }}>
        {cubie.x === -1 && <span className={sticker} style={{ backgroundColor: faceFill.left }} />}
      </span>
      <span className={face} style={{ transform: `rotateX(90deg) translateZ(${half}px)` }}>
        {cubie.y === -1 && <span className={sticker} style={{ backgroundColor: faceFill.top }} />}
      </span>
      <span className={face} style={{ transform: `rotateX(-90deg) translateZ(${half}px)` }}>
        {cubie.y === 1 && <span className={sticker} style={{ backgroundColor: faceFill.bottom }} />}
      </span>
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
      <div
        className={`relative h-[32rem] w-full touch-none select-none overflow-hidden rounded-[2.5rem] border border-cream/16 bg-gradient-to-b from-green-900/35 via-green-900/20 to-teal/25 shadow-[var(--shadow-lift)] ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ perspective: "1400px" }}
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
        aria-label="Interactive rotating Rubik's cube"
      >
        <div className="absolute inset-0 [transform-style:preserve-3d]">
          <div
            className="absolute left-1/2 top-1/2 [transform-style:preserve-3d] will-change-transform"
            style={{ transform: wireTransform }}
          >
            {CUBIES.map((cubie, index) => (
              <Cubie key={`${cubie.x}-${cubie.y}-${cubie.z}-${index}`} cubie={cubie} />
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
