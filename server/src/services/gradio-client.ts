import { Client } from "@gradio/client";
import { config } from '../config/index.js';

let clientInstance: Client | null = null;
let connectionPromise: Promise<Client> | null = null;

/**
 * Get a lazy-initialized Gradio client connected to the ACE-Step Gradio app.
 * Caches the connection for reuse across requests.
 */
export async function getGradioClient(): Promise<Client> {
  if (clientInstance) return clientInstance;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    try {
      const client = await Client.connect(config.acestep.apiUrl, {
        events: ["data", "status"],
      });
      clientInstance = client;
      console.log(`[Gradio] Connected to ${config.acestep.apiUrl}`);
      return client;
    } catch (error) {
      console.error(`[Gradio] Failed to connect to ${config.acestep.apiUrl}:`, error);
      throw error;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

/**
 * Reset the cached Gradio client, forcing a new connection on next use.
 */
export function resetGradioClient(): void {
  clientInstance = null;
  connectionPromise = null;
}

/**
 * Check if the Gradio app is reachable.
 */
export async function isGradioAvailable(): Promise<boolean> {
  try {
    // Try OpenAI API endpoint first (newer ACE-Step versions)
    const openaiUrl = `${config.acestep.apiUrl}/v1/models`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(openaiUrl, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (response.ok) return true;

    // Fallback: try Gradio endpoint (older ACE-Step versions)
    const gradioUrl = `${config.acestep.apiUrl}/gradio_api/info`;
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 3000);
    const response2 = await fetch(gradioUrl, {
      signal: controller2.signal,
    });
    clearTimeout(timeout2);
    return response2.ok;
  } catch {
    return false;
  }
}
