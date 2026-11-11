import { supabaseServiceRole } from "@/lib/supabaseServiceRole";
import { parseWeekProgram, type WeekSession } from "@/lib/tvWeekProgram";

const BUCKET = "tv-config";
const PROGRAM_FILE = "ugeprogram.json";

export async function readWeekProgram() {
  const { data, error } = await supabaseServiceRole.storage.from(BUCKET).download(PROGRAM_FILE);
  if (error) throw error;
  return parseWeekProgram(JSON.parse(await data.text()));
}

export async function saveWeekProgram(program: WeekSession[]) {
  const { error } = await supabaseServiceRole.storage.from(BUCKET).upload(
    PROGRAM_FILE,
    JSON.stringify(program),
    { upsert: true, contentType: "application/json", cacheControl: "0" }
  );
  if (error) throw error;
}
