"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
type Theme = "light" | "dark" | "system";
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
}>({ theme: "system", setTheme: () => {} });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, updateTheme] = useState<Theme>("system");
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      let saved: Theme = "system";
      try {
        const value = localStorage.getItem("evershine:theme");
        if (value === "light" || value === "dark") saved = value;
      } catch {}
      updateTheme(saved);
      document.documentElement.dataset.theme =
        saved === "system" ? (media.matches ? "dark" : "light") : saved;
    };
    apply();
    media.addEventListener("change", apply);
    window.addEventListener("storage", apply);
    return () => {
      media.removeEventListener("change", apply);
      window.removeEventListener("storage", apply);
    };
  }, []);
  function setTheme(value: Theme) {
    updateTheme(value);
    try {
      localStorage.setItem("evershine:theme", value);
    } catch {}
    document.documentElement.dataset.theme =
      value === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : value;
  }
  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>;
}
export function ThemeControl() {
  const { theme, setTheme } = useContext(ThemeContext);
  return (
    <div className="segmented theme-control" aria-label="Appearance">
      {(
        [
          { id: "light", Icon: Sun },
          { id: "dark", Icon: Moon },
          { id: "system", Icon: Monitor },
        ] as const
      ).map(({ id, Icon }) => (
        <button
          key={id}
          title={`${id[0].toUpperCase()}${id.slice(1)} theme`}
          aria-label={`${id[0].toUpperCase()}${id.slice(1)} theme`}
          aria-pressed={theme === id}
          onClick={() => setTheme(id)}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
