import { supabase } from "./supabaseClient";
import type { ChatMessage } from "../types";

function assertNoError(error: unknown) {
  if (!error) return;
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  throw new Error(message);
}

export async function loadConversation(userId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("ai_conversations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(80);
  assertNoError(error);
  return (data ?? []) as ChatMessage[];
}

export async function sendAiMessage(input: {
  userId: string;
  message: string;
  history: ChatMessage[];
  lang?: "zh" | "en";
}) {
  const userInsert = await supabase
    .from("ai_conversations")
    .insert({
      user_id: input.userId,
      role: "user",
      content: input.message,
    })
    .select("*")
    .single();
  assertNoError(userInsert.error);

  const extract = await supabase.functions.invoke("ai-extract-data", {
    body: {
      message: input.message,
      todos: [],
      lang: input.lang ?? "zh",
    },
  });

  const extractedData = extract.error ? null : extract.data?.extractedData ?? extract.data ?? null;

  const reply = await supabase.functions.invoke("ai-chat-reply", {
    body: {
      message: input.message,
      extractedData,
      conversationHistory: input.history.slice(-10),
      todos: [],
      lang: input.lang ?? "zh",
    },
  });
  assertNoError(reply.error);

  const content = reply.data?.reply ?? reply.data?.message ?? reply.data?.content ?? "我已经收到，会结合你的记录继续分析。";
  const assistantInsert = await supabase
    .from("ai_conversations")
    .insert({
      user_id: input.userId,
      role: "assistant",
      content,
    })
    .select("*")
    .single();
  assertNoError(assistantInsert.error);

  return {
    userMessage: userInsert.data as ChatMessage,
    assistantMessage: assistantInsert.data as ChatMessage,
    extractedData,
  };
}

