import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { registerLinkedInResearchTools } from "./src/tools.js";

export default function register(api: OpenClawPluginApi): void {
  registerLinkedInResearchTools(api);
}
