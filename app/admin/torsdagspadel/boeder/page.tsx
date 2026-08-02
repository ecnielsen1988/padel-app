import { redirect } from "next/navigation";

export default function LegacyBoederRedirect() {
  redirect("/admin/torsdagspadel/butik");
}
