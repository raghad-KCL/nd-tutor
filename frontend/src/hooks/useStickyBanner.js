import { useCallback, useEffect, useState } from "react";

/**
 * Returns `{ compact, wrapperRef }` where `wrapperRef` is a callback ref.
 *
 * Attach it to any wrapper div that is a direct child of the scroll container:
 *   <div ref={wrapperRef}>…</div>
 *
 * The hook finds the scroll container via node.parentElement and wires a
 * rAF-throttled scroll listener to it.  Because wrapperRef is a callback ref
 * (not a useRef object), the effect re-fires whenever the element mounts or
 * unmounts — which is essential when the wrapped content is conditionally
 * rendered (e.g. only when a certain page is active).
 *
 * Hysteresis (engage >60 px, release <40 px) + a 450 ms post-change lock
 * prevent mid-animation layout-shift feedback loops.
 */
export function useStickyBanner() {
  const [compact, setCompact] = useState(false);
  const [container, setContainer] = useState(null);

  // Callback ref: called by React whenever the element mounts (node) or
  // unmounts (null).  Storing the *parent* avoids a second .parentElement
  // lookup inside the effect.
  const wrapperRef = useCallback((node) => {
    setContainer(node ? node.parentElement : null);
  }, []);

  useEffect(() => {
    if (!container) {
      setCompact(false); // reset when page unmounts so it opens fresh next time
      return;
    }

    let ticking = false;
    let locked = false;
    let isCompact = false;

    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          if (!locked) {
            const scrollY = container.scrollTop;
            if (!isCompact && scrollY > 60) {
              isCompact = true;
              locked = true;
              setCompact(true);
              setTimeout(() => { locked = false; }, 450);
            } else if (isCompact && scrollY < 40) {
              isCompact = false;
              locked = true;
              setCompact(false);
              setTimeout(() => { locked = false; }, 450);
            }
          }
          ticking = false;
        });
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [container]);

  return { compact, wrapperRef };
}
