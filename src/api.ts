import { AiImagesClient } from "@gadget-client/ai-images";

export const api = new AiImagesClient({
  authenticationMode: {
    browserSession: true,
  },
});