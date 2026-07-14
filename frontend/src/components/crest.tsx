import { useState } from "react";
import { cldLogo } from "@/lib/cloudinary";

/**
 * An institution's crest. When the institution has uploaded a real crest/logo
 * (`src`), that image is shown. Otherwise a platform-rendered placeholder — a
 * respectful generic shield in the house colours with its initials, plus a
 * small sun-and-waves nod to the coast — stands in. A broken/removed image URL
 * degrades to the same placeholder.
 */
export function Crest({
  colors = ["#123F2D", "#C7A24A"],
  label,
  size = 96,
  src,
}: {
  colors?: string[];
  label: string;
  size?: number;
  /** A real, uploaded crest/logo URL. Falls back to the placeholder shield when absent. */
  src?: string;
}) {
  const [failed, setFailed] = useState(false);
  const c1 = colors[0] ?? "#123F2D";
  const c2 = colors[1] ?? "#C7A24A";
  if (src && !failed) {
    return (
      <img
        src={cldLogo(src, size)}
        alt={`${label} crest`}
        width={size}
        height={(size * 140) / 120}
        loading="lazy"
        onError={() => setFailed(true)}
        className="object-contain"
        style={{ width: size, height: (size * 140) / 120 }}
      />
    );
  }
  const fontSize = label.length > 2 ? 26 : 34;
  return (
    <svg width={size} height={(size * 140) / 120} viewBox="0 0 120 140" fill="none" aria-hidden>
      <path d="M14 18 H106 V72 Q106 114 60 134 Q14 114 14 72 Z" fill={c1} stroke={c2} strokeWidth="2.5" />
      <path d="M21 25 H99 V71 Q99 108 60 126 Q21 108 21 71 Z" fill="none" stroke={c2} strokeWidth="1" opacity="0.55" />
      <text x="60" y="64" textAnchor="middle" fontFamily="'Cormorant Garamond', serif" fontWeight="600" fontSize={fontSize} fill={c2}>
        {label}
      </text>
      <circle cx="60" cy="84" r="6" fill="none" stroke={c2} strokeWidth="1.6" opacity="0.8" />
      <path d="M36 104 q6 -5 12 0 t12 0 t12 0 t12 0" fill="none" stroke={c2} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
      <path d="M40 112 q5 -4 10 0 t10 0 t10 0" fill="none" stroke={c2} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}
