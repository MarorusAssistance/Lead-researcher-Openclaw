import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { registerNotionCrmWriterTools } from "./src/tools.js";

export default function register(api: OpenClawPluginApi): void {
  registerNotionCrmWriterTools(api);
}
