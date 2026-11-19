import { createChatCompletionsProvider } from "./chatCompletions.ts";
export const deepseekProvider = createChatCompletionsProvider({ id: "deepseek", name: "DeepSeek", modelsUrl: "https://api.deepseek.com/models", chatUrl: "https://api.deepseek.com/chat/completions" });
