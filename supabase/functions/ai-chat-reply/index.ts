import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  readJson,
  requireUser,
  stringValue,
} from "../_shared/http.ts";
import { buildSystemPrompt, enforceReplyLength } from "./prompt.ts";
import { canUseReviewAi } from "./review-access.ts";

type ConversationMessage = {
  role?: string;
  content?: string;
};

const requestWindows = new Map<string, { count: number; startedAt: number }>();
const requestWindowMs = 60_000;
const authenticatedRequestsPerWindow = 20;
const reviewRequestsPerWindow = 8;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("仅支持 POST。", 405);

  try {
    const body = await readJson(req);
    const message = stringValue(body.message);
    if (!message) throw new Error("请先输入要发送的内容。");
    if (Array.from(message).length > 600) throw new Error("单次消息不能超过 600 个字符。");

    const address = clientAddress(req);
    const reviewMode = body.reviewMode === true || body.review_mode === true;
    if (reviewMode) {
      const allowed = canUseReviewAi({
        requested: true,
        enabled: Deno.env.get("NAVA_REVIEW_AI_ENABLED"),
        origin: req.headers.get("origin") ?? "",
        configuredOrigins: Deno.env.get("NAVA_REVIEW_ALLOWED_ORIGINS"),
      });
      if (!allowed) throw new Error("当前公开评审来源未获准调用 AI。请使用项目发布的预览链接。");
      enforceRateLimit(`review:${address}`, reviewRequestsPerWindow);
    } else {
      const { user } = await requireUser(req);
      enforceRateLimit(`${user.id}:${address}`, authenticatedRequestsPerWindow);
    }

    const lang = stringValue(body.lang) === "en" || stringValue(body.language) === "en" ? "en" : "zh";
    const reply = await buildReply({
      message,
      dataType: stringValue(body.dataType) ?? stringValue(body.data_type),
      extractedData: body.extractedData ?? body.extracted_data ?? null,
      healthContext: body.healthContext ?? body.health_context ?? null,
      conversationHistory: Array.isArray(body.conversationHistory) ? body.conversationHistory : [],
      lang,
    });
    return jsonResponse(reply);
  } catch (error) {
    return errorResponse(error);
  }
});

async function buildReply(input: {
  message: string;
  dataType?: string;
  extractedData: unknown;
  healthContext: unknown;
  conversationHistory: ConversationMessage[];
  lang: "zh" | "en";
}) {
  const endpoint = Deno.env.get("NAVA_AI_CHAT_URL");
  const apiKey = Deno.env.get("NAVA_AI_CHAT_KEY");

  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`AI 回复服务返回 ${response.status}`);
    const data = await response.json();
    return normalizeProviderReply(data, input.lang);
  }

  const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (deepseekKey) return deepSeekReply(input, deepseekKey);

  throw new Error("真实 AI 模型尚未配置，请联系管理员检查模型服务密钥。");
}

async function deepSeekReply(input: {
  message: string;
  dataType?: string;
  extractedData: unknown;
  healthContext: unknown;
  conversationHistory: ConversationMessage[];
  lang: "zh" | "en";
}, apiKey: string) {
  const zh = input.lang !== "en";
  const systemPrompt = buildSystemPrompt(input.lang);

  const history = input.conversationHistory
    .filter((item) => item && typeof item.content === "string" && (item.role === "user" || item.role === "assistant"))
    .slice(-10)
    .map((item) => ({ role: item.role as "user" | "assistant", content: item.content as string }));

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.72,
      max_tokens: 260,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        {
          role: "user",
          content: `${input.message}\n\n以下是仅供内部推理的上下文，不要逐字复述，也不要暴露字段结构：${JSON.stringify({
            dataType: input.dataType ?? null,
            extractedData: input.extractedData ?? null,
            healthContext: input.healthContext ?? null,
          })}`,
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`AI 回复服务返回 ${response.status}`);
  const data = await response.json();
  return {
    reply: enforceReplyLength(
      String(data?.choices?.[0]?.message?.content ?? "").trim() || (zh ? "模型暂时没有生成有效回复，请稍后重试。" : "The model did not return a valid response. Please try again."),
      input.lang,
    ),
    provider: "deepseek",
    modelVersion: "deepseek-chat-2026-07",
    actions: [],
  };
}

function normalizeProviderReply(data: Record<string, unknown>, lang: "zh" | "en") {
  const reply = enforceReplyLength(String(data.reply ?? data.message ?? data.content ?? ""), lang);
  if (!reply) throw new Error("真实 AI 服务没有返回有效内容。");
  return {
    reply,
    provider: "provider",
    modelVersion: String(data.modelVersion ?? data.model_version ?? "ai-chat-provider-2026-07"),
    actions: Array.isArray(data.actions) ? data.actions : [],
  };
}

function clientAddress(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("cf-connecting-ip")
    ?? "unknown";
}

function enforceRateLimit(key: string, maxRequests: number) {
  const now = Date.now();
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt >= requestWindowMs) {
    requestWindows.set(key, { count: 1, startedAt: now });
    return;
  }
  if (current.count >= maxRequests) throw new Error("请求过于频繁，请稍后再试。");
  current.count += 1;
}
