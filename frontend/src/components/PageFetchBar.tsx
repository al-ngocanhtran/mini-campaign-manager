import { useEffect, useRef, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

import { cn } from "@/lib/utils";

const SHOW_DELAY_MS = 150;
const MIN_VISIBLE_MS = 400;

export function PageFetchBar() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const active = fetching > 0 || mutating > 0;

  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      if (hideTimer.current !== null) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      if (!visible && showTimer.current === null) {
        showTimer.current = window.setTimeout(() => {
          shownAt.current = Date.now();
          setVisible(true);
          showTimer.current = null;
        }, SHOW_DELAY_MS);
      }
      return;
    }

    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (visible && hideTimer.current === null) {
      const elapsed = Date.now() - (shownAt.current ?? 0);
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
      hideTimer.current = window.setTimeout(() => {
        setVisible(false);
        shownAt.current = null;
        hideTimer.current = null;
      }, remaining);
    }
  }, [active, visible]);

  useEffect(
    () => () => {
      if (showTimer.current !== null) window.clearTimeout(showTimer.current);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  return (
    <div
      role="progressbar"
      aria-busy={visible}
      aria-hidden={!visible}
      aria-label="Loading"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] overflow-hidden",
        "transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <span className="absolute inset-y-0 block w-1/3 bg-accent motion-safe:animate-fetch-bar" />
    </div>
  );
}
