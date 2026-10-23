// Source images may be 5 MiB. Browser uploads stay below Vercel's 4.5 MB body ceiling.
export const HEADER_SOURCE_BYTES = 5 * 1024 * 1024;
export const HEADER_UPLOAD_BYTES = 3 * 1024 * 1024;
export const HEADER_MAX_PIXELS = 20_000_000;
