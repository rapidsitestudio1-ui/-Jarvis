export type OrbState =
  | "idle"
  | "listening"
  | "thinking"
  | "executing"
  | "speaking"
  | "error"
  | "success";

export const ORB_STATE_HUES: Record<OrbState, number> = {
  idle: 197,
  listening: 190,
  thinking: 262,
  executing: 36,
  speaking: 165,
  error: 355,
  success: 140,
};

export const ORB_STATE_LABELS: Record<OrbState, string> = {
  idle: "Standing by",
  listening: "Listening",
  thinking: "Thinking",
  executing: "Executing",
  speaking: "Speaking",
  error: "Fault detected",
  success: "Complete",
};
