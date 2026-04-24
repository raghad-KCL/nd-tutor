import { useState, useEffect } from "react";

/**
 * Tracks the browser window width and provides responsive breakpoint flags.
 *
 * @returns {{ windowWidth: number, isNarrow: boolean, isMobile: boolean }}
 *   `windowWidth` is the current `window.innerWidth`, `isNarrow` is true
 *   below 860 px, and `isMobile` is true below 768 px.
 */
export default function useWindowWidth() {
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isNarrow = windowWidth < 860;
  const isMobile = windowWidth < 768;
  return { windowWidth, isNarrow, isMobile };
}
