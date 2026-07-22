import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

interface AppState {
  theme: Theme;
  toggleTheme: () => void;
  storeName: string;
  userName: string;
  userEmail: string;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("stray-theme") as Theme) ?? "light",
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("stray-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === "light" ? "dark" : "light")),
    [],
  );

  const value = useMemo<AppState>(
    () => ({
      theme,
      toggleTheme,
      storeName: "Salt & Cotton",
      userName: "Rashmi Fonseka",
      userEmail: "rashmi@saltandcotton.lk",
    }),
    [theme, toggleTheme],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
