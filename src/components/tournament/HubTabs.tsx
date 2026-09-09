"use client";

import { useRef } from "react";
import { HUB_TABS, type HubTab } from "./hub-tab";

export function hubTabId(key: HubTab): string {
  return `hub-tab-${key}`;
}

export function hubPanelId(key: HubTab): string {
  return `hub-panel-${key}`;
}

/**
 * Three equal tabs in a segmented control. Same ARIA shape as the admin
 * `EventTabs` (tablist / tab / aria-selected), plus arrow-key movement. Fits
 * a 320px screen with room to spare: no icons, three short words.
 */
export function HubTabs({
  value,
  onChange,
}: {
  value: HubTab;
  onChange: (next: HubTab) => void;
}) {
  const refs = useRef<Partial<Record<HubTab, HTMLButtonElement | null>>>({});

  const move = (from: HubTab, delta: number) => {
    const i = HUB_TABS.findIndex((t) => t.key === from);
    const next = HUB_TABS[(i + delta + HUB_TABS.length) % HUB_TABS.length].key;
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Schedule and standings"
      className="grid grid-cols-3 gap-1 bg-surface-2 rounded-lg p-1"
    >
      {HUB_TABS.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[t.key] = el;
            }}
            id={hubTabId(t.key)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={hubPanelId(t.key)}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                move(t.key, 1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                move(t.key, -1);
              } else if (e.key === "Home") {
                e.preventDefault();
                onChange(HUB_TABS[0].key);
                refs.current[HUB_TABS[0].key]?.focus();
              } else if (e.key === "End") {
                e.preventDefault();
                const lastKey = HUB_TABS[HUB_TABS.length - 1].key;
                onChange(lastKey);
                refs.current[lastKey]?.focus();
              }
            }}
            className={`min-h-[44px] px-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
              active ? "bg-base text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
