import { useEffect, useMemo, useRef, useState } from "react";

type AxisVal = -1 | 0 | 1;
type Axis = "x" | "y" | "z";
type TurnDir = 1 | -1;
type CubiePoint = { x: AxisVal; y: AxisVal; z: AxisVal };
type Face = "front" | "back" | "right" | "left" | "top" | "bottom";
type Stickers = Record<Face, string | null>;
type CubieState = CubiePoint & { id: number; stickers: Stickers };
type TurnState = { axis: Axis; layer: AxisVal; dir: TurnDir; angle: number };

const CUBIE_SIZE = 66;
const CUBIE_GAP = 6;
const CUBIE_STEP = CUBIE_SIZE + CUBIE_GAP;
const TURN_TARGET = 90;
const TURN_SPEED_DEG_PER_MS = 0.24;

const AXIS_VALUES = [-1, 0, 1] as const;
const CUBIES: CubieState[] = AXIS_VALUES.flatMap((x) =>
  AXIS_VALUES.flatMap((y) => AXIS_VALUES.map((z) => ({
    id: (x + 1) * 9 + (y + 1) * 3 + (z + 1),
    x,
    y,
    z,
    stickers: {
      front: z === 1 ? "#f4efe0" : null,
      back: z === -1 ? "#1e6b4f" : null,
      right: x === 1 ? "#b07d32" : null,
      left: x === -1 ? "#b0503c" : null,
      top: y === -1 ? "#0e7c6b" : null,
      bottom: y === 1 ? "#2e4d90" : null,
    },
  }))),
);

function asAxisVal(value: number): AxisVal {
  if (value === -1) return -1;
  if (value === 0) return 0;
  return 1;
}

function rotatePointQuarter(cubie: CubiePoint, axis: Axis, dir: TurnDir): CubiePoint {
  const { x, y, z } = cubie;
  switch (axis) {
    case "x":
      return dir === 1 ? { x, y: asAxisVal(-z), z: y } : { x, y: z, z: asAxisVal(-y) };
    case "y":
      return dir === 1 ? { x: z, y, z: asAxisVal(-x) } : { x: asAxisVal(-z), y, z: x };
    case "z":
      return dir === 1 ? { x: asAxisVal(-y), y: x, z } : { x: y, y: asAxisVal(-x), z };
  }
}

function rotatePointByAngle(cubie: CubiePoint, axis: Axis, angleDeg: number): { x: number; y: number; z: number } {
  const t = (angleDeg * Math.PI) / 180;
  const { x, y, z } = cubie;
  const c = Math.cos(t);
  const s = Math.sin(t);
  switch (axis) {
    case "x":
      return { x, y: y * c - z * s, z: y * s + z * c };
    case "y":
      return { x: x * c + z * s, y, z: -x * s + z * c };
    case "z":
      return { x: x * c - y * s, y: x * s + y * c, z };
  }
}

function rotateStickersQuarter(stickers: Stickers, axis: Axis, dir: TurnDir): Stickers {
  const s = stickers;
  if (axis === "x" && dir === 1) return { ...s, front: s.bottom, top: s.front, back: s.top, bottom: s.back };
  if (axis === "x" && dir === -1) return { ...s, front: s.top, top: s.back, back: s.bottom, bottom: s.front };
  if (axis === "y" && dir === 1) return { ...s, front: s.left, right: s.front, back: s.right, left: s.back };
  if (axis === "y" && dir === -1) return { ...s, front: s.right, right: s.back, back: s.left, left: s.front };
  if (axis === "z" && dir === 1) return { ...s, top: s.left, right: s.top, bottom: s.right, left: s.bottom };
  return { ...s, top: s.right, right: s.bottom, bottom: s.left, left: s.top };
}

function applyTurn(cubies: CubieState[], turn: Omit<TurnState, "angle">): CubieState[] {
  return cubies.map((cubie) => {
    if (cubie[turn.axis] !== turn.layer) return cubie;
    const nextPos = rotatePointQuarter(cubie, turn.axis, turn.dir);
    return {
      ...cubie,
      ...nextPos,
      stickers: rotateStickersQuarter(cubie.stickers, turn.axis, turn.dir),
    };
  });
}

function Cubie({
  cubie,
  activeTurn,
}: Readonly<{
  cubie: CubieState;
  activeTurn: TurnState | null;
}>) {
  const half = CUBIE_SIZE / 2;
  let x = cubie.x;
  let y = cubie.y;
  let z = cubie.z;
  let extraRotate = "";

  if (activeTurn && cubie[activeTurn.axis] === activeTurn.layer) {
    const rotated = rotatePointByAngle(cubie, activeTurn.axis, activeTurn.angle);
    x = rotated.x;
    y = rotated.y;
    z = rotated.z;
    extraRotate = activeTurn.axis === "x"
      ? ` rotateX(${activeTurn.angle}deg)`
      : activeTurn.axis === "y"
        ? ` rotateY(${activeTurn.angle}deg)`
        : ` rotateZ(${activeTurn.angle}deg)`;
  }

  const shell = `translate3d(${x * CUBIE_STEP}px, ${y * CUBIE_STEP}px, ${z * CUBIE_STEP}px)${extraRotate}`;
  const face = "absolute inset-0 rounded-[8px] border border-cream/25 bg-[#0f3a2b]";
  const sticker = "absolute inset-[14%] rounded-[5px]";

  return (
    <div
      className="absolute left-1/2 top-1/2 [transform-style:preserve-3d]"
      style={{ width: CUBIE_SIZE, height: CUBIE_SIZE, transform: shell }}
    >
      <span className={face} style={{ transform: `translateZ(${half}px)` }}>
        {cubie.stickers.front && <span className={sticker} style={{ backgroundColor: cubie.stickers.front }} />}
      </span>
      <span className={face} style={{ transform: `rotateY(180deg) translateZ(${half}px)` }}>
        {cubie.stickers.back && <span className={sticker} style={{ backgroundColor: cubie.stickers.back }} />}
      </span>
      <span className={face} style={{ transform: `rotateY(90deg) translateZ(${half}px)` }}>
        {cubie.stickers.right && <span className={sticker} style={{ backgroundColor: cubie.stickers.right }} />}
      </span>
      <span className={face} style={{ transform: `rotateY(-90deg) translateZ(${half}px)` }}>
        {cubie.stickers.left && <span className={sticker} style={{ backgroundColor: cubie.stickers.left }} />}
      </span>
      <span className={face} style={{ transform: `rotateX(90deg) translateZ(${half}px)` }}>
        {cubie.stickers.top && <span className={sticker} style={{ backgroundColor: cubie.stickers.top }} />}
      </span>
      <span className={face} style={{ transform: `rotateX(-90deg) translateZ(${half}px)` }}>
        {cubie.stickers.bottom && <span className={sticker} style={{ backgroundColor: cubie.stickers.bottom }} />}
      </span>
    </div>
  );
}

export function HeroWireframe() {
  const [cubies, setCubies] = useState<CubieState[]>(CUBIES);
  const [rotation, setRotation] = useState({ x: -22, y: 26 });
  const [dragging, setDragging] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [activeTurn, setActiveTurn] = useState<TurnState | null>(null);
  const dragPoint = useRef<{ x: number; y: number } | null>(null);
  const spinFrame = useRef<number | null>(null);
  const turnFrame = useRef<number | null>(null);
  const lastTurnTick = useRef<number | null>(null);
  const activeTurnRef = useRef<TurnState | null>(null);

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
      spinFrame.current = window.requestAnimationFrame(loop);
    };
    spinFrame.current = window.requestAnimationFrame(loop);
    return () => {
      if (spinFrame.current !== null) window.cancelAnimationFrame(spinFrame.current);
    };
  }, [dragging, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      if (dragging || activeTurnRef.current) return;
      const axis: Axis = ["x", "y", "z"][Math.floor(Math.random() * 3)] as Axis;
      const layer: AxisVal = AXIS_VALUES[Math.floor(Math.random() * AXIS_VALUES.length)];
      const dir: TurnDir = Math.random() > 0.5 ? 1 : -1;
      const nextTurn: TurnState = { axis, layer, dir, angle: 0 };
      activeTurnRef.current = nextTurn;
      setActiveTurn(nextTurn);
    }, 1700);
    return () => window.clearInterval(timer);
  }, [dragging, reducedMotion]);

  useEffect(() => {
    if (!activeTurn) return;
    lastTurnTick.current = null;
    const tick = (now: number) => {
      const current = activeTurnRef.current;
      if (!current) return;
      const prev = lastTurnTick.current ?? now;
      const dt = now - prev;
      lastTurnTick.current = now;

      const nextAngle = current.angle + TURN_SPEED_DEG_PER_MS * dt * current.dir;
      const reached = current.dir === 1 ? nextAngle >= TURN_TARGET : nextAngle <= -TURN_TARGET;
      const settledAngle = reached ? TURN_TARGET * current.dir : nextAngle;
      const nextTurn = { ...current, angle: settledAngle };
      activeTurnRef.current = nextTurn;
      setActiveTurn(nextTurn);

      if (reached) {
        setCubies((prevCubies) => applyTurn(prevCubies, current));
        activeTurnRef.current = null;
        setActiveTurn(null);
        lastTurnTick.current = null;
        return;
      }
      turnFrame.current = window.requestAnimationFrame(tick);
    };
    turnFrame.current = window.requestAnimationFrame(tick);
    return () => {
      if (turnFrame.current !== null) window.cancelAnimationFrame(turnFrame.current);
    };
  }, [activeTurn]);

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
            {cubies.map((cubie) => (
              <Cubie key={cubie.id} cubie={cubie} activeTurn={activeTurn} />
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
