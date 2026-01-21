import { SystemMessage } from "@langchain/core/messages";
import {
  Annotation,
  LangGraphRunnableConfig,
  MessagesAnnotation,
} from "@langchain/langgraph";

// Copied from the OpenAI example repository
export const BLOCKED_DOMAINS = [
  "maliciousbook.com",
  "evilvideos.com",
  "darkwebforum.com",
  "shadytok.com",
  "suspiciouspins.com",
  "ilanbigio.com",
];

export const CUAAnnotation = Annotation.Root({
  /**
   * The message list between the user & assistant. This contains
   * messages, including the computer use calls.
   */
  messages: MessagesAnnotation.spec.messages,
  /**
   * The ID of the instance to use for this thread.
   * @default undefined
   */
  instanceId: Annotation<string | undefined>({
    reducer: (_state, update) => update,
    default: () => undefined,
  }),
  /**
   * The ID of the current auth session being used, if any.
   */
  authenticatedId: Annotation<string | undefined>({
    reducer: (_state, update) => update,
    default: () => undefined,
  }),
});

export const CUAConfigurable = Annotation.Root({
  /**
   * The auth state ID to use.
   * @default undefined
   */
  authStateId: Annotation<string | undefined>({
    reducer: (_state, update) => update,
    default: () => undefined,
  }),
  /**
   * The system prompt to use when calling the model.
   */
  prompt: Annotation<string | SystemMessage | undefined>({
    reducer: (_state, update) => update,
    default: () => undefined,
  }),
  /**
   * Domains to block the browser instance from visiting.
   * If a value is passed, it will override the default, not
   * append to it.
   */
  blockedDomains: Annotation<string[]>({
    reducer: (_state, update) => update,
    default: () => BLOCKED_DOMAINS,
  }),
});

export interface ComputerAction {
  type: string;
  x?: number;
  y?: number;
  text?: string;
  scroll_x?: number;
  scroll_y?: number;
  keys?: string[];
  button?: string;
  path?: { x: number; y: number }[];
  safety_decision?: {
    explanation: string;
    decision: "require_confirmation" | "proceed";
  };
}

export interface ComputerToolCall {
  type: "computer_call";
  call_id: string;
  action: ComputerAction;
}

/**
 * Gets the configuration with default values.
 *
 * @param {LangGraphRunnableConfig} config - The configuration to use.
 * @returns {typeof CUAConfigurable.State} - The configuration with default values.
 */
export function getConfigurationWithDefaults(
  config: LangGraphRunnableConfig
): typeof CUAConfigurable.State {
  return {
    authStateId: config.configurable?.authStateId ?? undefined,
    prompt: config.configurable?.prompt ?? undefined,
    blockedDomains: config.configurable?.blockedDomains ?? BLOCKED_DOMAINS,
  };
}

export type CUAState = typeof CUAAnnotation.State;
export type CUAUpdate = typeof CUAAnnotation.Update;
