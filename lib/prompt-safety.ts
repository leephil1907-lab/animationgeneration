const HARD_BLOCKED = [
  /\b(child|minor|underage|preteen|toddler|infant|kid|schoolgirl|schoolboy)\b/i,
  /\b(non[- ]?consensual|without consent|forced|coerced|rape|sexual assault)\b/i,
  /\b(real person|celebrity|public figure)\b.*\b(nude|naked|sexual|explicit)\b/i,
];

export function moderatePrompt(prompt: string) {
  const text = prompt.trim();
  if (!text) return { allowed: false, level: 'block' as const, reason: 'A prompt is required.' };
  if (HARD_BLOCKED.some((pattern) => pattern.test(text))) {
    return { allowed: false, level: 'block' as const, reason: 'This prompt contains prohibited content involving minors, non-consent, or sexualized real-person likenesses.' };
  }
  return { allowed: true, level: 'allow' as const, reason: '' };
}
