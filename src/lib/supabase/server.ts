import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicConfig } from "../config";
export async function createClient() {
  const config = publicConfig();
  if (!config) throw new Error("Supabase is not configured");
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (entries) => {
        // Server Components cannot write cookies. Proxy refreshes before rendering;
        // Server Actions and Route Handlers can and must persist auth changes.
        try {
          entries.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch (error) {
          if (!String(error).includes("Cookies can only be modified"))
            throw error;
        }
      },
    },
  });
}
