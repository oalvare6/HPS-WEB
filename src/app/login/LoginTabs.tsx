"use client";

import { ReactNode, useState } from "react";

type Tab = "magic" | "password";

/**
 * Client-side tab switcher for the player sign-in surface.
 *
 * Both forms are pre-rendered as ReactNode props so the parent server
 * component can keep doing the dynamic redirect / error handling, and we
 * don't lose any per-form state across switches. Email is intentionally not
 * shared between tabs in Phase 11 — keep both forms self-contained.
 */
export function LoginTabs({
  magicLink,
  password,
  defaultTab = "magic",
}: {
  magicLink: ReactNode;
  password: ReactNode;
  defaultTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(defaultTab);

  return (
    <div>
      <div
        role="tablist"
        aria-label="Sign-in method"
        className="flex border-b border-border-token mb-6"
      >
        <TabButton
          active={tab === "magic"}
          onClick={() => setTab("magic")}
          controls="login-tab-magic"
          label="Magic link"
        />
        <TabButton
          active={tab === "password"}
          onClick={() => setTab("password")}
          controls="login-tab-password"
          label="Password"
        />
      </div>

      <div
        role="tabpanel"
        id="login-tab-magic"
        hidden={tab !== "magic"}
        aria-hidden={tab !== "magic"}
      >
        {tab === "magic" ? magicLink : null}
      </div>
      <div
        role="tabpanel"
        id="login-tab-password"
        hidden={tab !== "password"}
        aria-hidden={tab !== "password"}
      >
        {tab === "password" ? password : null}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  controls,
  label,
}: {
  active: boolean;
  onClick: () => void;
  controls: string;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={`flex-1 pb-3 text-sm font-semibold transition-colors -mb-px border-b-2 ${
        active
          ? "text-white border-brand"
          : "text-zinc-400 border-transparent hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}
