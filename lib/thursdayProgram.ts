export function programTime(value: unknown): string | null {
  const match = /^([01]\d|2[0-3])[:.]([0-5]\d)(?::[0-5]\d)?$/.exec(typeof value === "string" ? value.trim() : "");
  return match ? `${match[1]}:${match[2]}` : null;
}

export type ThursdaySet = {
  group_index: number;
  set_index: number;
  court_label: string | null;
  start_time: string | null;
  end_time: string | null;
  holdA1: string | null;
  holdA2: string | null;
  holdB1: string | null;
  holdB2: string | null;
};

export function savedThursdayGroups(rows: ThursdaySet[]) {
  const groups = new Map<number, ThursdaySet[]>();
  for (const row of rows) {
    const sets = groups.get(row.group_index) ?? [];
    sets.push(row);
    groups.set(row.group_index, sets);
  }

  return [...groups].sort(([a], [b]) => a - b).map(([gi, sets]) => {
    sets.sort((a, b) => a.set_index - b.set_index);
    const first = sets[0];
    return {
      gi,
      court: first.court_label ?? "",
      start: programTime(first.start_time) ?? "",
      end: programTime(first.end_time) ?? "",
      sets: Object.fromEntries(sets.map(set => [set.set_index, set])),
      rounds: sets.at(-1)!.set_index + 1,
    };
  });
}

export function thursdaySetNames(set: ThursdaySet) {
  return [set.holdA1, set.holdA2, set.holdB1, set.holdB2] as const;
}

const pendingWrites = new Map<string, Promise<void>>();

export function queueThursdayWrite(eventId: string, write: () => Promise<void>) {
  const pending = (pendingWrites.get(eventId) ?? Promise.resolve()).catch(() => {}).then(write);
  pendingWrites.set(eventId, pending);
  void pending.finally(() => {
    if (pendingWrites.get(eventId) === pending) pendingWrites.delete(eventId);
  }).catch(() => {});
  return pending;
}

export async function waitForThursdayWrites(eventId: string) {
  await pendingWrites.get(eventId);
}

export function parseThursdayPublication(value: unknown, eventId: string) {
  if (!Array.isArray(value) || !value.length || value.length > 500) {
    throw new Error("Programmet skal indeholde mellem 1 og 500 sæt.");
  }
  const seen = new Set<string>();
  return value.map(row => {
    if (!row || !Number.isInteger(row.group_index) || row.group_index < 0 || row.group_index > 499 ||
        !Number.isInteger(row.set_index) || row.set_index < 0 || row.set_index > 499) {
      throw new Error("Programmet indeholder et ugyldigt kamp- eller sætnummer.");
    }
    const key = `${row.group_index}-${row.set_index}`;
    if (seen.has(key)) throw new Error("Programmet indeholder samme sæt flere gange.");
    seen.add(key);
    const start = programTime(row.start_time);
    const end = programTime(row.end_time);
    if (!start || !end || start >= end) {
      throw new Error(`Kamp ${row.group_index + 1} skal have gyldige tider, og sluttid skal være efter starttid.`);
    }
    const [a1, a2, b1, b2] = thursdaySetNames(row).map(name => typeof name === "string" ? name.trim() || null : null);
    const score = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 7 ? n : 0;
    return {
      event_id: eventId, group_index: row.group_index as number, set_index: row.set_index as number,
      court_label: typeof row.court_label === "string" ? row.court_label.trim() || null : null,
      start_time: `${start}:00`, end_time: `${end}:00`,
      holdA1: a1, holdA2: a2, holdB1: b1, holdB2: b2,
      scoreA: score(row.scoreA), scoreB: score(row.scoreB), tiebreak: false,
    };
  });
}
