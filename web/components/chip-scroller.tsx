"use client";

import { useEffect, useRef } from "react";

/** Horizontal chip row that keeps the selected chip visible on narrow screens. */
export function ChipScroller({ children, label }: { children: React.ReactNode; label: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    const left = active.offsetLeft - nav.clientWidth / 2 + active.offsetWidth / 2;
    nav.scrollLeft = Math.max(0, left);
  });
  return (
    <nav ref={ref} aria-label={label} className="-mx-4 overflow-x-auto px-4 no-scrollbar">
      {children}
    </nav>
  );
}
