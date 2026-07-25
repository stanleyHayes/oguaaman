import type { ArtistRelease } from "@/lib/types";

export const STREAMING_PLATFORMS = [
  { label: "Spotify", mark: "◉" }, { label: "Apple Music", mark: "♪" },
  { label: "YouTube Music", mark: "▶" }, { label: "YouTube", mark: "▷" },
  { label: "Amazon Music", mark: "a" }, { label: "Audiomack", mark: "▥" },
  { label: "Boomplay", mark: "B" }, { label: "SoundCloud", mark: "☁" },
  { label: "Bandcamp", mark: "▰" }, { label: "Deezer", mark: "▤" },
  { label: "TIDAL", mark: "◆" }, { label: "Qobuz", mark: "Q" },
  { label: "Pandora", mark: "P" }, { label: "Anghami", mark: "A" },
  { label: "JioSaavn", mark: "J" }, { label: "JOOX", mark: "JX" },
  { label: "Claro Música", mark: "C" }, { label: "iHeartRadio", mark: "♥" },
  { label: "NetEase Cloud Music", mark: "N" }, { label: "QQ Music", mark: "QQ" },
  { label: "Kugou Music", mark: "K" }, { label: "Kuwo Music", mark: "K" },
  { label: "WeSing", mark: "W" }, { label: "Mixcloud", mark: "M" },
  { label: "Beatport", mark: "b" }, { label: "Traxsource", mark: "T" },
  { label: "ReverbNation", mark: "R" }, { label: "Shazam", mark: "S" },
] as const;

export const SOCIAL_PLATFORMS = [
  { label: "Website", mark: "W" }, { label: "Instagram", mark: "IG" },
  { label: "Facebook", mark: "f" }, { label: "TikTok", mark: "TT" },
  { label: "YouTube", mark: "▶" }, { label: "X / Twitter", mark: "X" },
  { label: "LinkedIn", mark: "in" }, { label: "WhatsApp", mark: "WA" },
  { label: "Threads", mark: "@" }, { label: "Snapchat", mark: "S" },
  { label: "Pinterest", mark: "P" }, { label: "Telegram", mark: "TG" },
  { label: "Discord", mark: "D" }, { label: "Twitch", mark: "T" },
  { label: "GitHub", mark: "GH" }, { label: "Behance", mark: "Bē" },
  { label: "Dribbble", mark: "Dr" }, { label: "Google Business Profile", mark: "G" },
] as const;

export function newArtistRelease(): ArtistRelease {
  return {
    id: `release-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    kind: "single",
    tracks: [],
  };
}
