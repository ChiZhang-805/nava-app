type ProfileRecord = Record<string, unknown> | null;

type ConsentQuery = {
  data: unknown;
  error: { message?: string } | null;
};

type ConsentClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<ConsentQuery>;
      };
    };
  };
};

export type NavaConsentFlags = {
  aiPersonalization: boolean;
  healthSync: boolean;
};

/**
 * The dedicated profile columns are authoritative. Onboarding JSON is only a
 * compatibility fallback for profiles created before those columns existed.
 * This is important for revocation: an old `true` answer must never override a
 * later explicit `false` saved in the profile column.
 */
export function resolveConsentFlag(explicitValue: unknown, legacyValue: unknown) {
  if (typeof explicitValue === "boolean") return explicitValue;
  return legacyValue === true;
}

export function consentFlagsFromProfile(value: unknown): NavaConsentFlags {
  const profile = record(value);
  const answers = record(profile?.onboarding_answers);
  return {
    aiPersonalization: resolveConsentFlag(profile?.ai_personalization_consent, answers?.aiPersonalizationConsent),
    healthSync: resolveConsentFlag(profile?.health_data_consent, answers?.healthDataConsent),
  };
}

export async function loadConsentFlags(client: unknown, userId: string): Promise<NavaConsentFlags> {
  const result = await (client as ConsentClient)
    .from("profiles")
    .select("health_data_consent,ai_personalization_consent,onboarding_answers")
    .eq("id", userId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message || "无法核对数据授权状态。");
  return consentFlagsFromProfile(result.data);
}

export async function requireHealthSyncConsent(client: unknown, userId: string, lang: "zh" | "en" = "zh") {
  const flags = await loadConsentFlags(client, userId);
  if (!flags.healthSync) {
    throw new Error(lang === "en"
      ? "Health data sync is disabled in your privacy settings."
      : "你已在隐私设置中关闭健康数据同步，当前数据不会上传。");
  }
  return flags;
}

export async function requireAiPersonalizationConsent(client: unknown, userId: string, lang: "zh" | "en" = "zh") {
  const flags = await loadConsentFlags(client, userId);
  if (!flags.aiPersonalization) {
    throw new Error(lang === "en"
      ? "Personalized AI is disabled in your privacy settings."
      : "你已在隐私设置中关闭个性化 AI，当前不会读取历史健康记录生成报告。");
  }
  return flags;
}

function record(value: unknown): ProfileRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
