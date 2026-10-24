import { z } from "zod";
import type { Attachment } from "./types";
const attachment = z.object({ id: z.uuid(), filename: z.string().max(120), mime: z.string(), kind: z.enum(["photo", "gif", "file"]), byte_size: z.number().int().positive() });
/** Real byte progress; 100% means processing, not a committed upload. */
export function uploadChatFile(channel: string, file: File, progress: (percent: number) => void) {
  const xhr = new XMLHttpRequest();
  const result = new Promise<Attachment>((resolve, reject) => {
    xhr.open("POST", "/api/chat/upload");
    xhr.timeout = 90000;
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
    xhr.onerror = xhr.ontimeout = () => reject(Error("Upload failed. Check your connection and retry."));
    xhr.onabort = () => reject(Error("Upload cancelled."));
    xhr.onload = () => {
      try {
        const value = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300) throw Error(typeof value.error === "string" ? value.error : "Upload rejected. Please retry.");
        const parsed = attachment.safeParse(value);
        if (!parsed.success) throw Error("Upload could not be confirmed. Please retry.");
        resolve(parsed.data);
      } catch (error) { reject(error instanceof SyntaxError ? Error("Upload unavailable. Please retry.") : error instanceof Error ? error : Error("Upload unavailable.")); }
    };
    const data = new FormData(); data.set("channel", channel); data.set("file", file);
    xhr.send(data);
  });
  return { result, abort: () => xhr.abort() };
}
