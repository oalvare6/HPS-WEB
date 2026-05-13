import { Toaster } from "sonner";
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "rgb(15 29 51)",
            border: "1px solid rgb(30 47 77)",
            color: "white",
          },
        }}
      />
    </>
  );
}
