import { createChatCompletionsProvider } from "./chatCompletions.ts";
export const openrouterProvider = createChatCompletionsProvider({ id: "openrouter", name: "OpenRouter", modelsUrl: "https://openrouter.ai/api/v1/models/user", chatUrl: "https://openrouter.ai/api/v1/chat/completions" });
