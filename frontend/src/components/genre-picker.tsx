const GENRES = [
  ["Highlife", "HL"], ["Hiplife", "HP"], ["Gospel", "GS"], ["Afrobeats", "AF"],
  ["Afrobeat", "AB"], ["Amapiano", "AM"], ["Hip-hop", "HH"], ["R&B / Soul", "RB"],
  ["Reggae", "RG"], ["Dancehall", "DH"], ["Jazz", "JZ"], ["Traditional", "TR"],
  ["Fante Folk", "FF"], ["Asafo Music", "AS"], ["Brass Band", "BR"], ["Palm-wine", "PW"],
  ["Acoustic", "AC"], ["Spoken Word", "SW"], ["Electronic", "EL"],
] as const;

export function GenrePicker({ value, onChange }: Readonly<{ value: string[]; onChange: (value: string[]) => void }>) {
  const options = [...GENRES, ...value.filter((genre) => !GENRES.some(([label]) => label.toLowerCase() === genre.toLowerCase())).map((genre) => [genre, "•"] as const)];
  function toggle(genre: string) {
    const selected = value.some((item) => item.toLowerCase() === genre.toLowerCase());
    onChange(selected ? value.filter((item) => item.toLowerCase() !== genre.toLowerCase()) : [...value, genre]);
  }
  return <fieldset className="space-y-3">
    <div className="flex items-end justify-between gap-4"><div><legend className="text-sm font-semibold text-ink">Genre(s)</legend><p className="mt-1 text-xs text-ink-faint">Select every sound that describes the artist.</p></div><span className="shrink-0 rounded-full bg-green/[0.08] px-3 py-1 text-xs font-semibold text-green-text">{value.length} selected</span></div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{options.map(([genre, mark]) => {
      const selected = value.some((item) => item.toLowerCase() === genre.toLowerCase());
      return <button type="button" key={genre} aria-pressed={selected} onClick={() => toggle(genre)} className={`relative flex min-h-14 items-center gap-3 overflow-hidden rounded-xl border px-3 py-2 text-left transition ${selected ? "border-green bg-green/[0.09] text-green-text ring-1 ring-green/20" : "border-sand bg-paper text-ink-muted hover:border-green/35"}`}><span aria-hidden className="pointer-events-none absolute -bottom-5 right-1 text-6xl font-bold opacity-[0.05]">♫</span><span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[0.62rem] font-bold ${selected ? "bg-green text-on-green" : "bg-cream text-ink-faint"}`}>{selected ? "✓" : mark}</span><span className="relative text-sm font-semibold leading-tight">{genre}</span></button>;
    })}</div>
  </fieldset>;
}
