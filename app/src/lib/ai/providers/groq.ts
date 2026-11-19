import { createChatCompletionsProvider } from "./chatCompletions.ts";
export const groqProvider = createChatCompletionsProvider({ id: "groq", name: "Groq", modelsUrl: "https://api.groq.com/openai/v1/models", chatUrl: "https://api.groq.com/openai/v1/chat/completions" });
