export const RESULT_CHANGE_PREFIX = "[RESULT_CHANGE_REQUEST]";

export type ResultChangeSet = {
  id: number;
  scoreA: number;
  scoreB: number;
};

export type ResultChangeRequestPayload = {
  type: "result_change_request";
  version: 1;
  requestedBy: string;
  requestedAt: string;
  comment?: string;
  sets: ResultChangeSet[];
};

export function encodeResultChangeRequest(payload: ResultChangeRequestPayload) {
  return `${RESULT_CHANGE_PREFIX}${JSON.stringify(payload)}`;
}

export function parseResultChangeRequest(raw: string | null | undefined) {
  const text = (raw ?? "").toString().trim();
  if (!text.startsWith(RESULT_CHANGE_PREFIX)) return null;

  try {
    const payload = JSON.parse(text.slice(RESULT_CHANGE_PREFIX.length)) as ResultChangeRequestPayload;
    if (payload?.type !== "result_change_request" || payload?.version !== 1) {
      return null;
    }
    if (!Array.isArray(payload.sets)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function formatResultChangeSetSummary(sets: ResultChangeSet[]) {
  return sets.map((set) => `${set.scoreA}-${set.scoreB}`).join(" ");
}
