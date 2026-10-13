// 선으로 그린 아이콘 모음 (이모지 대신 사용)

const PATHS: Record<string, string> = {
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  cards: 'M3 7h14v14H3z M7 3h12a2 2 0 0 1 2 2v12',
  grammar: 'M3 7V5h12v2 M9 5v14 M6 19h6 M14 15l2.5 2.5L21 13',
  mic: 'M9 3h6v11H9z M5 11a7 7 0 0 0 14 0 M12 18v3',
  chat: 'M4 5h16v11H9l-5 4z',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12 M18 6 6 18',
  speaker: 'M4 9v6h4l5 4V5L8 9z M16.5 8.5a5 5 0 0 1 0 7',
  play: 'M7 4v16l13-8z',
  pause: 'M6 4h4v16H6z M14 4h4v16h-4z',
  upload: 'M12 16V4 M6 10l6-6 6 6 M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  settings: 'M4 6h9 M17 6h3 M4 12h3 M11 12h9 M4 18h11 M19 18h1',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14 M20 20l-4-4',
  pdf: 'M6 3h8l5 5v13H6z M14 3v5h5 M9 13h7 M9 17h5',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  next: 'M9 5l7 7-7 7',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7',
  check: 'M5 12l5 5 9-10',
};

const CIRCLES: Record<string, [number, number][]> = {
  settings: [
    [15, 6],
    [9, 12],
    [17, 18],
  ],
};

export function Icon({ name, size = 22, filled = false }: { name: keyof typeof PATHS | string; size?: number; filled?: boolean }) {
  const d = PATHS[name] ?? '';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : 'M' + seg} />
      ))}
      {(CIRCLES[name] ?? []).map(([cx, cy], i) => (
        <circle key={`c${i}`} cx={cx} cy={cy} r={2} />
      ))}
    </svg>
  );
}
