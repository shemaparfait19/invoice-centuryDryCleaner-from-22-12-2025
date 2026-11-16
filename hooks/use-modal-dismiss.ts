"use client";

import { useEffect, useRef, type MouseEvent } from "react";

// Hand-rolled overlays (the invoice preview is one) only had a close button.
// This gives them the two habits people expect as well: Escape closes, and a
// click on the dark area beside the panel closes while a click inside it does
// not. Spread the returned handler on the backdrop element.
export function useModalDismiss(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // A dialog opened from inside this one owns Escape while it is open.
      const stacked = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
      );
      if (stacked) return;
      closeRef.current();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) closeRef.current();
  };
}
