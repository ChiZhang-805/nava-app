/** Compile-time native boundary: no simulator UI, state machine or event bus. */
export default function PreviewDisabled() { return null; }
export const registerPreviewActivity = () => () => {};
export const presentPhonePreviewNotification = () => false;
export const phoneNotificationOpenEvent = "";
