import { GoogleGenAI } from "@google/genai";

const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

function createAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY must be set. Please add your Gemini API key to the environment secrets.",
    );
  }
  return new GoogleGenAI({
    apiKey,
    ...(baseUrl ? { httpOptions: { apiVersion: "", baseUrl } } : {}),
  });
}

// Lazy proxy — the real client is only created on first property access,
// so the server can start without GEMINI_API_KEY and only fails when the
// AI endpoints are actually called.
export const ai = new Proxy({} as GoogleGenAI, {
  get(_target, prop) {
    const client = createAiClient();
    return (client as any)[prop];
  },
});
