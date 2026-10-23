import { operationalEvent } from "./src/lib/operations/monitoring";
export async function register() {}
export function onRequestError(error: { digest?: string }) {
  operationalEvent("server_error", error.digest);
}
