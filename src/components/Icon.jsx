// Minimal line-icon set, stroke-based, inherits currentColor.
export function Icon({ name, size = 18, className = "", strokeWidth = 1.6 }) {
  const paths = {
    bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
    play: <path d="M6 4v16l13-8L6 4Z" />,
    stop: <path d="M6 5h4v14H6zM14 5h4v14h-4z" />,
    gauge: (
      <>
        <path d="M12 13 17 8" />
        <path d="M3 12a9 9 0 1 1 18 0" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    link: (
      <>
        <path d="M10 14a4 4 0 0 0 6 .5l3-3a4 4 0 0 0-5.5-5.5l-1.5 1.5" />
        <path d="M14 10a4 4 0 0 0-6-.5l-3 3a4 4 0 0 0 5.5 5.5l1.5-1.5" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    chart: <path d="M3 21h18M5 17v-5M10 17V8M15 17v-7M20 17v-3" />,
    trash: (
      <>
        <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        <path d="M6 7l1 13h10l1-13" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
    flame: <path d="M12 2c2 4-1 5-1 8a3 3 0 0 0 6 0c0-2-1-3-1-3 2 2 3 4 3 7a7 7 0 1 1-14 0c0-5 4-7 7-12Z" />,
    shield: <path d="M12 2 4 5v6c0 5 3 9 8 11 5-2 8-6 8-11V5l-8-3Z" />,
    check: <path d="M4 12l5 5L20 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    sliders: (
      <>
        <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5" />
        <circle cx="16" cy="6" r="2" />
        <circle cx="8" cy="12" r="2" />
        <circle cx="13" cy="18" r="2" />
      </>
    ),
    power: (
      <>
        <path d="M12 3v9" />
        <path d="M6.5 6.5a8 8 0 1 0 11 0" />
      </>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
