import { Toaster } from "sonner";
import type { ReactNode } from "react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminGate>
        <AdminShell>{children}</AdminShell>
      </AdminGate>
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
