/** Public administrator DTO. Never add credentials, user data or provider payloads here. */
export type ServiceSignal = 'success' | 'error' | 'unknown';
export type ConfigState = 'configured' | 'missing' | 'invalid';
export type ServiceId = 'chat_text' | 'chat_images' | 'record_text' | 'record_food_image' | 'record_face_image' | 'extract_text' | 'diet_photo' | 'face_photo' | 'health_report' | 'diet_report' | 'food_visual' | 'food_matting';
export type CredentialMetadata = { name: string; configured: boolean; required: boolean };
export type FunctionStatus = {
  id: ServiceId;
  configuration: ConfigState;
  credentials: CredentialMetadata[];
  signal: ServiceSignal;
  reason: 'not_observed' | 'configuration_missing' | 'configuration_invalid' | 'recent_success' | 'recent_failure' | 'observation_stale' | 'needs_details' | 'observation_unavailable' | 'provider_unavailable';
  observedAt: string | null;
  errorCode: string | null;
};
export type BalanceState = 'available' | 'insufficient' | 'unconfigured' | 'unauthorized' | 'rate_limited' | 'unavailable' | 'unknown';
export type DeepSeekBalance = {
  state: BalanceState;
  checkedAt: string;
  balances: Array<{ currency: 'CNY' | 'USD'; total: string; granted: string; toppedUp: string }>;
};
export type AdminServiceSnapshot = {
  version: 1;
  checkedAt: string;
  deepseek: DeepSeekBalance;
  services: FunctionStatus[];
  foodActivity: { available: boolean; windowHours: 24; sampleLimit: 50; sampled: number; ready: number; failed: number; needsDetails: number };
};
