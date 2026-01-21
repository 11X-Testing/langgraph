import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { ComputerToolCall } from "./types.js";

/**
 * Checks if the given tool outputs are a computer call.
 *
 * @param {unknown} toolOutputs The tool outputs to check.
 * @returns {boolean} True if the tool outputs are a computer call, false otherwise.
 */
export function isComputerToolCall(
  toolOutputs: unknown
): toolOutputs is ComputerToolCall[] {
  if (!toolOutputs || !Array.isArray(toolOutputs)) {
    return false;
  }
  return (
    toolOutputs.filter((output) => output.type === "computer_call").length > 0
  );
}

/**
 * Maps Gemini tool calls to ComputerToolCall format.
 */
function mapGeminiToolToComputerAction(toolCall: { name: string; args: any; id?: string }): ComputerToolCall | null {
  const { name, args, id } = toolCall;
  const call_id = id || "unknown"; // Gemini SDK matching might handle IDs differently, but LangChain provides them.

  const safety_decision = args.safety_decision;

  let action: any = null;

  switch (name) {
    case "click_at":
      action = { type: "click", x: args.x, y: args.y, button: "left" };
      break;
    case "type_text_at":
      // Composite action: click then type? Or just pass params. 
      // take-computer-action needs to be robust. For now mapping to "type"
      // and ensuring we pass coordinates if available.
      action = {
        type: "type",
        text: args.text,
        x: args.x,
        y: args.y,
        // Gemini implies clicking there first?
      };
      break;
    case "scroll_at":
      // Gemini sends direction ('up', 'down', 'left', 'right') and magnitude (pixels)
      // Playwright wheel expects deltaX, deltaY.
      let scroll_x = 0;
      let scroll_y = 0;
      if (args.direction === "up") scroll_y = -args.magnitude;
      if (args.direction === "down") scroll_y = args.magnitude;
      if (args.direction === "left") scroll_x = -args.magnitude;
      if (args.direction === "right") scroll_x = args.magnitude;

      action = { type: "scroll", x: args.x, y: args.y, scroll_x, scroll_y };
      break;

    case "drag_and_drop":
      action = {
        type: "drag",
        path: [
          { x: args.x, y: args.y },
          { x: args.destination_x, y: args.destination_y },
        ],
      };
      break;

    case "key_combination":
      // Gemini sends "keys" string e.g. "Control+A"
      // take-computer-action expects array of strings.
      action = {
        type: "keypress",
        keys: args.keys.split("+"),
      };
      break;

    case "open_web_browser":
      action = { type: "open_browser" };
      break;

    case "navigate":
      action = { type: "navigate", text: args.url };
      break;

    default:
      return null;
  }

  if (action) {
    if (safety_decision) {
      action.safety_decision = safety_decision;
    }
    return {
      type: "computer_call",
      call_id,
      action
    };
  }
  return null;
}

/**
 * Gets the tool outputs from an AIMessage.
 *
 * @param {AIMessage} message The message to get tool outputs from.
 * @returns {ComputerToolCall[] | undefined} The tool outputs from the message, or undefined if there are none.
 */
export function getToolOutputs(
  message: AIMessage
): ComputerToolCall[] | undefined {
  // Check standard tool_calls first (LangChain standard)
  if (message.tool_calls && message.tool_calls.length > 0) {
    const actions: ComputerToolCall[] = [];
    for (const toolCall of message.tool_calls) {
      const mapped = mapGeminiToolToComputerAction(toolCall);
      if (mapped) actions.push(mapped);
    }
    return actions.length > 0 ? actions : undefined;
  }

  // Fallback for legacy or manual kwargs (if we manually stuff them)
  const toolOutputs = message.additional_kwargs?.tool_outputs;
  if (toolOutputs && Array.isArray(toolOutputs)) {
    return toolOutputs.filter(
      (output: any) => output.type === "computer_call"
    ) as ComputerToolCall[];
  }

  return undefined;
}

/**
 * Checks if a message is a computer call tool message.
 *
 * @param {BaseMessage} message The message to check.
 * @returns {boolean} True if the message is a computer call tool message, false otherwise.
 */
export function isComputerCallToolMessage(
  message: BaseMessage
): message is ToolMessage {
  // We identify computer tool OUTPUT messages (ToolMessage) 
  // currently primarily by the "computer_call_output" type in additional_kwargs.
  // This is set by take-computer-action.ts so it remains consistent.
  return (
    message.getType() === "tool" &&
    message.additional_kwargs?.type === "computer_call_output"
  );
}
