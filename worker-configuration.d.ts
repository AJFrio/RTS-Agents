/**
 * Minimal Cloudflare Workers environment for the unified web build.
 * Generated full types are not needed; the worker only uses the ASSETS binding.
 */

interface Env {
  /** Workers Assets binding — serves the Vite build from dist/renderer. */
  ASSETS: Fetcher;
}
