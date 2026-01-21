import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ToolMessage } from "@langchain/core/messages";
import { RunnableLambda } from "@langchain/core/runnables";
import { Page } from "playwright";
import { CUAState } from "../types.js";
import { getToolOutputs } from "../utils.js";
import { BrowserManager } from "../browser-manager.js";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const CUA_KEY_TO_PLAYWRIGHT_KEY: Record<string, string> = {
  "/": "Slash",
  "\\": "Backslash",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  arrowup: "ArrowUp",
  backspace: "Backspace",
  capslock: "CapsLock",
  cmd: "Meta",
  delete: "Delete",
  end: "End",
  enter: "Enter",
  esc: "Escape",
  home: "Home",
  insert: "Insert",
  option: "Alt",
  pagedown: "PageDown",
  pageup: "PageUp",
  tab: "Tab",
  win: "Meta",
};

export async function takeComputerAction(
  state: CUAState,
  config: LangGraphRunnableConfig,
  {
    uploadScreenshot,
    onSafetyConfirmation,
  }: {
    uploadScreenshot?: (screenshot: string) => Promise<string>;
    onSafetyConfirmation?: (safetyDecision: { explanation: string; decision: "require_confirmation" | "proceed" }) => Promise<boolean>;
  }
) {
  if (!state.instanceId) {
    throw new Error("Can not take computer action without an instance ID.");
  }

  const message = state.messages[state.messages.length - 1];
  const toolOutputs = getToolOutputs(message);
  if (!toolOutputs?.length) {
    throw new Error(
      "Can not take computer action without a computer call in the last message."
    );
  }

  const browserManager = BrowserManager.getInstance();
  const page = browserManager.getPage(state.instanceId);

  if (!page) {
    throw new Error(`Browser instance ${state.instanceId} not found or closed.`);
  }

  const output = toolOutputs[toolOutputs.length - 1];
  const { action } = output;
  let computerCallToolMsg: ToolMessage | undefined;

  try {
    let base64Image: string | undefined;
    let safetyAcknowledged = false;

    if (action.safety_decision?.decision === "require_confirmation") {
      if (!onSafetyConfirmation) {
        throw new Error("Model requires safety confirmation but no callback provided.");
      }
      const confirmed = await onSafetyConfirmation(action.safety_decision);
      if (!confirmed) {
        throw new Error("Safety confirmation denied by user.");
      }
      safetyAcknowledged = true;
    }

    switch (action.type) {
      case "open_browser":
        // Browser is already opened by createVMInstance, just ensure it's ready?
        // Or simply take a screenshot of the initial state.
        break;
      case "navigate":
        if (action.text) {
          await page.goto(action.text);
        }
        break;
      case "click":
        if (action.x !== undefined && action.y !== undefined) {
          await page.mouse.click(action.x, action.y, {
            button: action.button === "wheel" ? "middle" : action.button as "left" | "right" | "middle" ?? "left",
          });
        }
        break;
      case "double_click":
        if (action.x !== undefined && action.y !== undefined) {
          await page.mouse.dblclick(action.x, action.y, {
            button: "left",
          });
        }
        break;
      case "drag":
        if (action.path && action.path.length > 0) {
          // Start drag
          const start = action.path[0];
          await page.mouse.move(start.x, start.y);
          await page.mouse.down();

          // Move through path
          for (const point of action.path.slice(1)) {
            await page.mouse.move(point.x, point.y);
          }
          // End drag
          await page.mouse.up();
        }
        break;
      case "keypress": {
        if (action.keys) {
          // Playwright press accepts slightly different format, but generally similar.
          // We might need to handle combination of keys.
          // CUA usually sends keys separated by +.
          // But here action.keys is an array of strings? existing code: action.keys.map...
          // Checking existing code: it was `action.keys` array.

          // If multiple keys are pressed together, we probably need `keyboard.press` with combined string like "Control+o"
          // or perform down/up.

          for (const key of action.keys) {
            const mappedKey = CUA_KEY_TO_PLAYWRIGHT_KEY[key.toLowerCase()] ?? key;
            await page.keyboard.press(mappedKey);
          }
        }
        break;
      }
      case "move":
        if (action.x !== undefined && action.y !== undefined) {
          await page.mouse.move(action.x, action.y);
        }
        break;
      case "screenshot":
        // Actions automatically take screenshot at the end effectively, 
        // but explicit screenshot action also exists.
        break;
      case "wait":
        await sleep(2000);
        break;
      case "scroll":
        // Scroll relative to current mouse position or just scroll?
        // Scrapybara impl used deltaX/Y. Playwright mouse.wheel
        if (action.x !== undefined && action.y !== undefined) {
          await page.mouse.move(action.x, action.y);
        }
        await page.mouse.wheel(action.scroll_x ?? 0, action.scroll_y ?? 0);
        break;
      case "type":
        if (action.text) {
          await page.keyboard.type(action.text);
        }
        break;
      default:
        throw new Error(
          `Unknown computer action received: ${JSON.stringify(action, null, 2)}`
        );
    }

    // Always take a screenshot after action
    // Playwright screenshot returns Buffer
    const screenshotBuffer = await page.screenshot({ type: "png" });
    base64Image = screenshotBuffer.toString("base64");

    let screenshotContent = `data:image/png;base64,${base64Image}`;
    if (uploadScreenshot) {
      const uploadScreenshotRunnable = RunnableLambda.from(
        uploadScreenshot
      ).withConfig({ runName: "upload-screenshot" });
      screenshotContent = await uploadScreenshotRunnable.invoke(
        screenshotContent
      );
    }

    computerCallToolMsg = new ToolMessage({
      content: screenshotContent,
      tool_call_id: output.call_id,
      additional_kwargs: {
        type: "computer_call_output",
        url: page.url(),
        safety_acknowledgement: safetyAcknowledged
      },
    });
  } catch (e) {
    console.error(
      { error: e, computerCall: output },
      "Failed to execute computer call."
    );
    // Even if it fails, we might want to return an error message to the model so it can correct itself.
    // For now keeping existing behavior but maybe with error message content?
    // Existing behavior was just logging and returning empty list ?? No, existing behavior caught error and returned empty list?
    // Let's return a tool message with error if possible, or just rethrow?
    // CUA usually expects a screenshot. If we failed, maybe a screenshot of failure state?

    try {
      // Try to take screenshot even on failure
      const screenshotBuffer = await page.screenshot({ type: "png" });
      const base64Image = screenshotBuffer.toString("base64");
      computerCallToolMsg = new ToolMessage({
        content: `data:image/png;base64,${base64Image}`,
        tool_call_id: output.call_id,
        additional_kwargs: {
          type: "computer_call_output",
          error: String(e),
          url: page?.url() || "about:blank"
        },
      });
    } catch (innerE) {
      // If screenshot also fails
      computerCallToolMsg = new ToolMessage({
        content: "Failed to execute action and failed to take screenshot: " + String(e),
        tool_call_id: output.call_id,
        additional_kwargs: { type: "computer_call_output" },
      });
    }
  }

  return {
    messages: computerCallToolMsg ? [computerCallToolMsg] : [],
    instanceId: state.instanceId,
    // streamUrl, // No longer supported in local playwright unless we setup a streamer, skipping for now
    authenticatedId: state.authenticatedId,
  };
}
