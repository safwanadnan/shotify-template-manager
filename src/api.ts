import { AiImagesClient } from "@gadget-client/ai-images";

export const api = new AiImagesClient({
  endpoint: "/api/graphql",
  environment: (import.meta.env.VITE_GADGET_ENV || "development") as any,
  authenticationMode: {
    anonymous: true,
  },
});