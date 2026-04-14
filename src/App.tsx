import { useState, useEffect } from "react";
import { AppShell } from "./components/AppShell";
import { FuzzyFinder } from "./components/FuzzyFinder";
import { useSidebarStore } from "./store/sidebar-store";
import "./styles/globals.css";

function App() {
  const [fuzzyFinderOpen, setFuzzyFinderOpen] = useState(false);
  const toggleSidebar = useSidebarStore((s) => s.toggle);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "p") {
        e.preventDefault();
        setFuzzyFinderOpen((o) => !o);
      }
      if (e.metaKey && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  return (
    <>
      <AppShell />
      <FuzzyFinder
        isOpen={fuzzyFinderOpen}
        onClose={() => setFuzzyFinderOpen(false)}
      />
    </>
  );
}

export default App;
