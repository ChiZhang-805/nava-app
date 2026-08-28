export function voiceEndpointDelayMs(transcript: string, isFinal: boolean) {
  const normalized = transcript.trim();
  if (!normalized) return 2800;
  if (!isFinal) return 3000;
  if (/[，,：:；;…]$/.test(normalized)) return 2800;
  if (/(?:然后|但是|不过|因为|所以|如果|还有|就是|比如|我觉得|我想|呃|嗯|and|but|because|so|if|also)$/i.test(normalized)) return 2800;
  if (Array.from(normalized).length <= 4) return 2300;
  if (/[。！？!?]$/.test(normalized)) return 1100;
  return 1800;
}
