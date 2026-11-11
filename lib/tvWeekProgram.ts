export const WEEKDAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"] as const;
export const MAX_WEEK_SESSIONS = 8;

export type WeekSession = {
  day: typeof WEEKDAYS[number];
  title: string;
  starts: string;
  ends: string;
  place: string;
  level: string;
  minPoints: string;
  maxPoints: string;
};

export const WEEK_TEXT_LIMITS = { title: 40, place: 24, level: 34 } as const;

export const DEFAULT_WEEK_PROGRAM: WeekSession[] = [
  { day: "Tirsdag", title: "Formiddags Americano", starts: "08:00", ends: "10:00", place: "Gilleleje", level: "For alle", minPoints: "", maxPoints: "" },
  { day: "Torsdag", title: "Formiddags Americano", starts: "08:00", ends: "10:00", place: "Helsinge", level: "For alle", minPoints: "", maxPoints: "" },
  { day: "Torsdag", title: "Rangliste TorsdagsTøserne", starts: "17:00", ends: "18:30", place: "Gilleleje", level: "Begyndere", minPoints: "0", maxPoints: "700" },
  { day: "Torsdag", title: "Rangliste TorsdagsTøserne", starts: "18:30", ends: "20:00", place: "Gilleleje", level: "Let øvede", minPoints: "700", maxPoints: "1500" },
  { day: "Fredag", title: "Rangliste Fredags Fun", starts: "17:00", ends: "18:30", place: "Helsinge", level: "Begyndere og let øvede", minPoints: "0", maxPoints: "1000" },
  { day: "Fredag", title: "Rangliste Fredags Fun", starts: "18:30", ends: "20:00", place: "Helsinge", level: "Let øvede og øvede", minPoints: "1000", maxPoints: "1800" },
  { day: "Søndag", title: "Rangliste Sunday Social", starts: "11:00", ends: "13:00", place: "Gilleleje", level: "Begyndere og let øvede", minPoints: "0", maxPoints: "1300" },
  { day: "Søndag", title: "Rangliste Sunday Social", starts: "13:00", ends: "15:00", place: "Gilleleje", level: "Øvede", minPoints: "1300", maxPoints: "2500" },
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const POINTS = /^\d{1,5}$/;

export function parseWeekProgram(input: unknown): WeekSession[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_WEEK_SESSIONS) {
    throw new Error(`Ugeprogrammet skal have 1–${MAX_WEEK_SESSIONS} spilletilbud.`);
  }

  return input.map((entry, index): WeekSession => {
    const { day, title, starts, ends, place, level, minPoints, maxPoints } = entry ?? {};
    const prefix = `Tilbud ${index + 1}`;
    if (!WEEKDAYS.includes(day) || typeof starts !== "string" || typeof ends !== "string" ||
      !TIME.test(starts) || !TIME.test(ends) || starts >= ends) {
      throw new Error(`${prefix} skal have en ugedag og en sluttid efter starttiden.`);
    }
    if (typeof title !== "string" || typeof place !== "string" || typeof level !== "string" ||
      !title.trim() || title.trim().length > WEEK_TEXT_LIMITS.title ||
      !place.trim() || place.trim().length > WEEK_TEXT_LIMITS.place ||
      !level.trim() || level.trim().length > WEEK_TEXT_LIMITS.level) {
      throw new Error(`${prefix} skal have et navn, et sted og et niveau.`);
    }
    if (typeof minPoints !== "string" || typeof maxPoints !== "string" ||
      ((minPoints !== "" || maxPoints !== "") &&
        (!POINTS.test(minPoints) || !POINTS.test(maxPoints) || Number(minPoints) > Number(maxPoints)))) {
      throw new Error(`${prefix} skal have et gyldigt pointinterval eller to tomme pointfelter.`);
    }
    return { day, title: title.trim(), starts, ends, place: place.trim(), level: level.trim(), minPoints, maxPoints };
  }).sort((a, b) => WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day) || a.starts.localeCompare(b.starts));
}
