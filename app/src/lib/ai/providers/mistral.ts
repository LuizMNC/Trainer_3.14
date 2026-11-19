import { createChatCompletionsProvider } from "./chatCompletions.ts";
export const mistralProvider = createChatCompletionsProvider({ id: "mistral", name: "Mistral", modelsUrl: "https://api.mistral.ai/v1/models", chatUrl: "https://api.mistral.ai/v1/chat/completions" });
