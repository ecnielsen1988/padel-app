import { parseEventRulesText } from "@/lib/eventConfig";

type EventSubmissionMeta = {
  id: string | number;
  date: string | null;
  rules_text?: string | null;
};

const KAMPID_EPOCH = "2024-01-01T00:00:00Z";

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 1000;
  }
  return hash;
}

function getDaySerial(isoDate: string) {
  const base = new Date(KAMPID_EPOCH).getTime();
  const date = new Date(`${isoDate}T12:00:00Z`).getTime();
  const diff = date - base;
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function getEventKampidBase(event: EventSubmissionMeta) {
  const isoDate = (event.date ?? "").trim();
  if (!isoDate) return null;

  const daySerial = getDaySerial(isoDate);
  const hash = hashString(String(event.id));

  return daySerial * 100_000 + hash * 100;
}

export function getEventKampidForGroup(
  event: EventSubmissionMeta,
  groupIndex: number
) {
  const base = getEventKampidBase(event);
  if (base == null) return null;
  return base + groupIndex + 1;
}

export function getEventKampidRange(event: EventSubmissionMeta) {
  const storedRange = parseEventRulesText(event.rules_text).meta.submissionRange;
  if (
    storedRange &&
    Number.isFinite(storedRange.from) &&
    Number.isFinite(storedRange.to)
  ) {
    return {
      from: Number(storedRange.from),
      to: Number(storedRange.to),
    };
  }

  const base = getEventKampidBase(event);
  if (base == null) return null;
  return {
    from: base,
    to: base + 99,
  };
}

export async function getNextKampId(supabase: any) {
  const { data, error } = await supabase
    .from("newresults")
    .select("kampid")
    .order("kampid", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const current = Number(data?.kampid ?? 0);
  return Number.isFinite(current) && current > 0 ? current + 1 : 1;
}

export async function getEventSubmissionState(
  supabase: any,
  event: EventSubmissionMeta
) {
  const range = getEventKampidRange(event);
  if (!range || !event.date) {
    return { submitted: false, count: 0 };
  }

  const { count, error } = await supabase
    .from("newresults")
    .select("id", { count: "exact", head: true })
    .gte("kampid", range.from)
    .lte("kampid", range.to)
    .eq("date", event.date)
    .eq("event", true);

  if (error) {
    throw error;
  }

  return {
    submitted: (count ?? 0) > 0,
    count: count ?? 0,
  };
}
