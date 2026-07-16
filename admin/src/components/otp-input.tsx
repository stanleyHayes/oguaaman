import { useEffect, useRef } from "react";

const LEN = 6;

// Mirrors the app's inputCls idiom (auth-theme-cream + rounded-xl border-sand
// bg-cream text-ink with the gold focus ring), sized as a square-ish digit box.
// The auth-theme-cream marker keeps the boxes readable inside the dark auth
// backdrop and is a no-op on the theme-aware Settings surfaces.
const boxCls =
  "auth-theme-cream h-12 w-11 rounded-xl border border-sand bg-cream text-center text-lg font-semibold text-ink transition-colors focus:border-gold-border focus:bg-paper focus:outline-none focus:ring-2 focus:ring-gold/20";

/** Splits a value into a fixed-length slot array so each box maps to one index. */
function slots(value: string): string[] {
  const arr = value.split("").slice(0, LEN);
  while (arr.length < LEN) arr.push("");
  return arr;
}

/**
 * Six-box one-time-code input. Controlled from the parent's `value` string so
 * existing submit logic (code.trim(), completeMfa(...)) is untouched. Only digits
 * are accepted; onComplete fires once all six are filled (including via paste).
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  autoFocus,
  ariaLabel = "One-time code",
}: Readonly<{
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
  ariaLabel?: string;
}>) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const digits = slots(value);

  const emit = (next: string) => {
    onChange(next);
    if (next.length === LEN) onComplete?.(next);
  };

  const focusBox = (i: number) => {
    const el = refs.current[i];
    if (el) {
      el.focus();
      el.select();
    }
  };

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const typed = e.target.value.replace(/\D/g, "");
    const chars = slots(value);
    if (!typed) {
      // A cut/replace that left no digit — clear this slot.
      if (chars[index]) emit(chars.slice(0, index).join("") + chars.slice(index + 1).join(""));
      return;
    }
    let i = index;
    for (const d of typed) {
      if (i >= LEN) break;
      chars[i] = d;
      i += 1;
    }
    emit(chars.join("").slice(0, LEN));
    focusBox(Math.min(i, LEN - 1));
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const chars = slots(value);
    if (e.key === "Backspace") {
      e.preventDefault();
      if (chars[index]) {
        emit(chars.slice(0, index).join(""));
      } else if (index > 0) {
        emit(chars.slice(0, index - 1).join(""));
        focusBox(index - 1);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === "ArrowRight" && index < LEN - 1) {
      e.preventDefault();
      focusBox(index + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LEN);
    if (!pasted) return;
    emit(pasted);
    focusBox(Math.min(pasted.length, LEN - 1));
  };

  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-2">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1} of ${LEN}`}
          value={digit}
          onChange={(e) => handleChange(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={boxCls}
        />
      ))}
    </div>
  );
}
