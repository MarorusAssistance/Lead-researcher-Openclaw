import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { registerNotionRecruiterTools } from "./src/tools.js";

export default function register(api: OpenClawPluginApi): void {
  registerNotionRecruiterTools(api);
}
