import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { CUAState } from "../types.js";
import { BrowserManager } from "../browser-manager.js";

export async function createVMInstance(
  state: CUAState,
  _config: LangGraphRunnableConfig
) {
  const { instanceId } = state;
  if (instanceId) {
    // Instance already exists, no need to initialize
    return {};
  }

  const browserManager = BrowserManager.getInstance();
  const newInstanceId = await browserManager.createInstance();

  return { instanceId: newInstanceId };
}
