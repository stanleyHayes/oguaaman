import { useState } from "react";
import { initials } from "@/lib/format";
import { LOGOS } from "@/lib/logos";
import { cldLogo } from "@/lib/cloudinary";

/**
 * A platform-rendered crest placeholder — a respectful generic shield in the
 * institution's house colours with its initials, plus a small sun-and-waves nod
 * to the coast. Used wherever an official logo has not yet been supplied.
 */
export function Crest({
  colors = ["#123F2D", "#C7A24A"],
  label,
  size = 40,
}: Readonly<{
  colors?: string[];
  label: string;
  size?: number;
}>) {
  const c1 = colors[0] ?? "#123F2D";
  const c2 = colors[1] ?? "#C7A24A";
  const fontSize = label.length > 2 ? 26 : 34;
  return (
    <svg width={size} height={(size * 140) / 120} viewBox="0 0 120 140" fill="none" aria-hidden>
      <path d="M14 18 H106 V72 Q106 114 60 134 Q14 114 14 72 Z" fill={c1} stroke={c2} strokeWidth="2.5" />
      <path d="M21 25 H99 V71 Q99 108 60 126 Q21 108 21 71 Z" fill="none" stroke={c2} strokeWidth="1" opacity="0.55" />
      <text x="60" y="64" textAnchor="middle" fontFamily="'Fraunces', serif" fontWeight="600" fontSize={fontSize} fill={c2}>
        {label}
      </text>
      <circle cx="60" cy="84" r="6" fill="none" stroke={c2} strokeWidth="1.6" opacity="0.8" />
      <path d="M36 104 q6 -5 12 0 t12 0 t12 0 t12 0" fill="none" stroke={c2} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
      <path d="M40 112 q5 -4 10 0 t10 0 t10 0" fill="none" stroke={c2} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

/**
 * The mark shown beside an institution: its real logo when one has been supplied
 * (see lib/logos.ts), otherwise the house-colour Crest. If a logo file fails to
 * load at runtime, it degrades to the Crest as well.
 */
export function InstitutionLogo({
  org,
  size = 40,
}: Readonly<{
  org: { slug: string; name: string; houseColors?: string[]; crestUrl?: string };
  size?: number;
}>) {
  // Prefer the institution's own uploaded crest, then the bundled logo map, then
  // the generated house-colour placeholder.
  const src = org.crestUrl ?? LOGOS[org.slug];
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-sand bg-white"
        style={{ width: size, height: size }}
      >
        <img
          src={cldLogo(src, size)}
          alt={`${org.name} logo`}
          loading="lazy"
          className="h-full w-full object-contain p-1"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <Crest colors={org.houseColors} label={initials(org.name)} size={size} />
    </span>
  );
}
