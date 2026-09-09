"use client";

import { useEffect } from "react";

/** Submits the exchange form once JS is running; the button remains for no-JS. */
export function ExchangeAutoSubmit({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId);
    if (form instanceof HTMLFormElement) {
      form.requestSubmit();
    }
  }, [formId]);
  return null;
}
