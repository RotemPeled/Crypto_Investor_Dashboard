import React, { useEffect, useState } from "react";

function IconMoon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 14.5A8.5 8.5 0 0 1 9.5 3a7 7 0 1 0 11.5 11.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSun({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2.5v2.3M12 19.2v2.3M21.5 12h-2.3M4.8 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "day");
  const isNight = theme === "night";

  useEffect(() => {
    document.body.classList.toggle("theme-night", isNight);
    localStorage.setItem("theme", theme);
  }, [theme, isNight]);

  return (
    <button
      className="themeToggle"
      type="button"
      onClick={() => setTheme((t) => (t === "night" ? "day" : "night"))}
      aria-label={isNight ? "Switch to day mode" : "Switch to night mode"}
      title={isNight ? "Day mode" : "Night mode"}
    >
      <span className="themeIcon" aria-hidden="true">
        {isNight ? <IconSun /> : <IconMoon />}
      </span>
    </button>
  );
}
