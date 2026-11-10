"use client";

import { useState } from "react";
import { programTime } from "@/lib/thursdayProgram";

export default function ProgramTimeInput({ label, value, disabled, onCommit }: {
  label: string;
  value: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  return (
    <input
      type="text"
      inputMode="text"
      autoComplete="off"
      maxLength={5}
      aria-label={label}
      title={invalid ? "Brug HH:MM, fx 18:30" : label}
      placeholder="HH:MM"
      aria-invalid={invalid}
      disabled={disabled}
      value={draft ?? value}
      onChange={(event) => { setDraft(event.target.value); setInvalid(false); }}
      onBlur={(event) => {
        if (draft === null) return;
        const time = programTime(event.currentTarget.value);
        setDraft(null);
        setInvalid(!time);
        if (time && time !== value) onCommit(time);
      }}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      className="w-20 rounded border border-green-800 bg-white px-2 py-1 text-sm tabnums aria-invalid:border-red-600 dark:bg-zinc-900"
    />
  );
}
