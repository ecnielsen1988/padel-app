const META_MARKER = "\n<!--PADEL_EVENT_META:";
const META_SUFFIX = "-->";

export type PartnerTeamMeta = {
  id: string;
  playerIds: [string, string];
  playerNames: [string, string];
};

export type EventSubmissionRange = {
  from: number;
  to: number;
};

export type EventMeta = {
  format?: "standard" | "partner";
  partnerTeams?: PartnerTeamMeta[];
  submissionRange?: EventSubmissionRange | null;
};

export function parseEventRulesText(raw: string | null | undefined) {
  const value = (raw ?? "").toString();
  const markerIndex = value.indexOf(META_MARKER);

  if (markerIndex === -1) {
    return {
      visibleRulesText: value.trim(),
      meta: {} as EventMeta,
    };
  }

  const visibleRulesText = value.slice(0, markerIndex).trim();
  const afterMarker = value.slice(markerIndex + META_MARKER.length);
  const suffixIndex = afterMarker.indexOf(META_SUFFIX);

  if (suffixIndex === -1) {
    return {
      visibleRulesText: value.trim(),
      meta: {} as EventMeta,
    };
  }

  const jsonText = afterMarker.slice(0, suffixIndex).trim();

  try {
    const parsed = JSON.parse(jsonText) as EventMeta;
    return {
      visibleRulesText,
      meta: parsed && typeof parsed === "object" ? parsed : ({} as EventMeta),
    };
  } catch {
    return {
      visibleRulesText,
      meta: {} as EventMeta,
    };
  }
}

export function buildEventRulesText(
  visibleRulesText: string | null | undefined,
  meta: EventMeta
) {
  const visible = (visibleRulesText ?? "").trim();
  const hasMeta =
    (meta.format && meta.format !== "standard") ||
    (meta.partnerTeams && meta.partnerTeams.length > 0) ||
    (meta.submissionRange &&
      Number.isFinite(meta.submissionRange.from) &&
      Number.isFinite(meta.submissionRange.to));

  if (!hasMeta) {
    return visible || null;
  }

  const payload = JSON.stringify(meta);
  return `${visible}${META_MARKER}${payload}${META_SUFFIX}`;
}

export function isPartnerEvent(raw: string | null | undefined) {
  return parseEventRulesText(raw).meta.format === "partner";
}

export function getEventAdminHref(
  id: string | number,
  rulesText: string | null | undefined
) {
  return isPartnerEvent(rulesText) ? `/makkerevent/${id}` : `/event/${id}`;
}
