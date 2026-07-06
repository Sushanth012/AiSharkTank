"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";

export function ReportActions({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function deleteReport() {
    const confirmed = window.confirm("Delete this report? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    const response = await fetch(`/api/reports/${reportId}`, { method: "DELETE" });
    setDeleting(false);

    if (response.ok) {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="grid" style={{ marginTop: 14 }}>
      <button className="button secondary" onClick={() => window.print()} type="button">
        <Download size={17} aria-hidden="true" />
        Save as PDF
      </button>
      <button className="button ghost" disabled={deleting} onClick={deleteReport} type="button">
        <Trash2 size={17} aria-hidden="true" />
        {deleting ? "Deleting..." : "Delete report"}
      </button>
    </div>
  );
}
