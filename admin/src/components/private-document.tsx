import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { mediaUrl } from "@/lib/cloudinary";
import { BusyLabel } from "@/components/skeleton";

const PRIVATE_PREFIX = "private:";

type Loaded = { status: "idle" } | { status: "loading" } | { status: "ready"; url: string; type: string } | { status: "error"; message: string };

const linkCls = "text-xs font-semibold text-teal-text underline underline-offset-4";

/**
 * A KYC / ID document (K8, D6). New submissions are "private:<id>" refs: the
 * file is fetched with the staff token from GET /api/admin/private-uploads/{id}
 * into a short-lived blob URL — never a public link — only when the reviewer
 * asks for it. Values on record from before private uploads are older public
 * links; they are shown as such so the reviewer knows.
 */
export function PrivateDocument({ docRef, label }: Readonly<{ docRef: string; label: string }>) {
  const [doc, setDoc] = useState<Loaded>({ status: "idle" });
  const blobUrl = doc.status === "ready" ? doc.url : null;

  // Release the object URL when it is replaced or the row unmounts.
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  if (!docRef.startsWith(PRIVATE_PREFIX)) {
    if (!/^(https?:\/\/|\/)/i.test(docRef)) return <span className="text-xs text-ink-faint">{label}: unreadable reference</span>;
    return (
      <a href={mediaUrl(docRef)} target="_blank" rel="noopener noreferrer" className={linkCls}>
        {label} (older public link) ↗
      </a>
    );
  }

  async function load() {
    setDoc({ status: "loading" });
    try {
      const { url, type } = await api.privateDocument(docRef);
      setDoc({ status: "ready", url, type });
    } catch (e) {
      setDoc({ status: "error", message: e instanceof Error ? e.message : "Couldn't open this document." });
    }
  }

  if (doc.status === "loading") return <BusyLabel label={`Opening ${label}`} />;
  if (doc.status === "ready") {
    return (
      <span className="inline-flex flex-col gap-1.5">
        {doc.type.startsWith("image/") && (
          <img src={doc.url} alt={label} className="max-h-48 max-w-xs rounded-lg border border-sand object-contain" />
        )}
        <a href={doc.url} target="_blank" rel="noopener noreferrer" className={linkCls}>Open {label} ↗</a>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" onClick={load} className={`${linkCls} text-left`}>View {label} (private)</button>
      {doc.status === "error" && <span className="text-xs text-clay-text" role="alert">{doc.message}</span>}
    </span>
  );
}
