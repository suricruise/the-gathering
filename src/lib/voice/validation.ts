import { z } from "zod";
export const tokenInput = z.object({ channel: z.uuid() }).strict();
export const sessionInput = z.object({ ticket: z.uuid() }).strict();
export const controlInput = z.discriminatedUnion("operation", [
  z
    .object({
      channel: z.uuid(),
      operation: z.literal("remove"),
      target: z.uuid(),
    })
    .strict(),
  z
    .object({
      channel: z.uuid(),
      operation: z.literal("settings"),
      limit: z.number().int().min(2).max(50),
      locked: z.boolean(),
    })
    .strict(),
]);
export type VoiceAdmission = {
  room: string;
  ticket: string;
  limit: number;
  name: string;
};
export type VoiceCredentials = {
  token: string;
  serverUrl: string;
  ticket: string;
  channel: string;
  name: string;
};
