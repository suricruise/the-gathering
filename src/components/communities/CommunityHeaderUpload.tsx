"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { prepareHeaderUpload } from "../../lib/communities/prepare-header-upload";
import { HEADER_SOURCE_BYTES } from "../../lib/communities/header-limits";
export function CommunityHeaderUpload({ communityId, hasImage }: { communityId: string; hasImage: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (pending) return;
    const form = event ? new FormData(event.currentTarget) : undefined;
    const file = form?.get("file");
    if (file instanceof File && file.size > HEADER_SOURCE_BYTES) {
      setError("Choose an image up to 5 MB. Resize or compress this image and try again.");
      setNotice("");
      return;
    }
    setPending(true); setError(""); setNotice("");
    try {
      if (form && file instanceof File) {
        try { form.set("file", await prepareHeaderUpload(file)); }
        catch (error) {
          setError(error instanceof Error ? error.message : "This image could not be prepared.");
          return;
        }
      }
      const response = await fetch(`/api/communities/${communityId}/header`, {
        method: event ? "POST" : "DELETE",
        ...(form ? { body: form } : {}),
      });
      const result = await response.json();
      if (!response.ok) { setError(result.error || "Header could not be saved."); return; }
      setNotice(result.notice); formRef.current?.reset(); router.refresh();
    } catch { setError("Could not reach the server. Check your connection and retry."); }
    finally { setPending(false); }
  }
  return (
    <section className="community-form" aria-labelledby="header-upload-heading">
      <h3 id="header-upload-heading">Community header image</h3>
      <p className="muted">Upload a JPEG, PNG or WebP image up to 5 MB. A wide image around 1920 × 640 works best; the center is cropped to fit. Private community headers are visible only to authorized members.</p>
      <form ref={formRef} onSubmit={save}>
        <fieldset disabled={pending}>
          <label className="field">Header image<input type="file" name="file" accept="image/jpeg,image/png,image/webp" required /></label>
          <div className="button-row">
            <button type="submit" className="button primary">{pending ? "Saving…" : "Upload header image"}</button>
            {hasImage && <button type="button" className="button secondary" onClick={() => void save()}>Remove header image</button>}
          </div>
        </fieldset>
      </form>
      {pending && <p role="status">Saving your header…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </section>
  );
}
