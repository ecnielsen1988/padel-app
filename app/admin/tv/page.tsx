"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type TvSlide = {
  id: string;
  title: string;
  file_url: string;
  file_type: "pdf" | "image";
  is_active: boolean;
  sort_order: number;
  start_date: string | null;
  end_date: string | null;
  duration_seconds: number;
  created_at: string;
};

export default function TvAdminPage() {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sortOrder, setSortOrder] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(12);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [slides, setSlides] = useState<TvSlide[]>([]);
  const [message, setMessage] = useState("");

  async function fetchSlides() {
    const { data, error } = await supabase
      .from("tv_slides")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("Fejl ved hentning af slides");
      return;
    }

    setSlides((data || []) as TvSlide[]);
  }

  useEffect(() => {
    fetchSlides();
  }, []);

  function detectFileType(file: File): "pdf" | "image" | null {
    if (file.type === "application/pdf") return "pdf";
    if (file.type.startsWith("image/")) return "image";
    return null;
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    if (!title.trim()) {
      setMessage("Skriv en titel");
      return;
    }

    if (!file) {
      setMessage("Vælg en fil");
      return;
    }

    const fileType = detectFileType(file);
    if (!fileType) {
      setMessage("Kun PDF, JPG, JPEG og PNG er tilladt");
      return;
    }

    try {
      setUploading(true);

      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const filePath = `slides/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("tv-assets")
        .upload(filePath, file, {
          upsert: false,
        });

      if (uploadError) {
        setMessage("Fejl ved upload til bucket");
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("tv-assets")
        .getPublicUrl(filePath);

      const fileUrl = publicUrlData.publicUrl;

      const { error: insertError } = await supabase.from("tv_slides").insert({
        title,
        file_url: fileUrl,
        file_type: fileType,
        is_active: true,
        sort_order: sortOrder,
        start_date: startDate || null,
        end_date: endDate || null,
        duration_seconds: durationSeconds,
      });

      if (insertError) {
        setMessage("Fejl ved gemning i tv_slides");
        return;
      }

      setTitle("");
      setFile(null);
      setSortOrder(0);
      setDurationSeconds(12);
      setStartDate("");
      setEndDate("");
      setMessage("Slide uploadet");
      await fetchSlides();
    } catch {
      setMessage("Noget gik galt");
    } finally {
      setUploading(false);
    }
  }

  async function toggleActive(slide: TvSlide) {
    const { error } = await supabase
      .from("tv_slides")
      .update({ is_active: !slide.is_active })
      .eq("id", slide.id);

    if (!error) {
      fetchSlides();
    }
  }

  async function deleteSlide(slide: TvSlide) {
    const confirmed = window.confirm(`Slet slide "${slide.title}"?`);
    if (!confirmed) return;

    const { error } = await supabase
      .from("tv_slides")
      .delete()
      .eq("id", slide.id);

    if (!error) {
      fetchSlides();
    }
  }

  return (
    <div className="min-h-screen bg-pink-50 p-6">
      <div className="mx-auto max-w-5xl space-y-8">
        <h1 className="text-3xl font-bold">TV Admin</h1>

        <form
          onSubmit={handleUpload}
          className="rounded-2xl bg-white p-6 shadow space-y-4"
        >
          <h2 className="text-xl font-semibold">Upload ny slide</h2>

          <div>
            <label className="mb-1 block font-medium">Titel</label>
            <input
              className="w-full rounded-xl border p-3"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Fx Rangliste Marathon"
            />
          </div>

          <div>
            <label className="mb-1 block font-medium">Fil</label>
            <input
              type="file"
              accept=".pdf,image/png,image/jpeg,image/jpg"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium">Rækkefølge</label>
              <input
                type="number"
                className="w-full rounded-xl border p-3"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="mb-1 block font-medium">Varighed (sek.)</label>
              <input
                type="number"
                className="w-full rounded-xl border p-3"
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="mb-1 block font-medium">Vis fra</label>
              <input
                type="datetime-local"
                className="w-full rounded-xl border p-3"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block font-medium">Vis til</label>
              <input
                type="datetime-local"
                className="w-full rounded-xl border p-3"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="rounded-xl bg-pink-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            {uploading ? "Uploader..." : "Upload slide"}
          </button>

          {message && <p className="text-sm text-gray-700">{message}</p>}
        </form>

        <div className="rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">Eksisterende slides</h2>

          <div className="space-y-4">
            {slides.map((slide) => (
              <div
                key={slide.id}
                className="flex flex-col gap-4 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{slide.title}</p>
                  <p className="text-sm text-gray-600">{slide.file_type}</p>
                  <p className="text-sm text-gray-600">
                    Aktiv: {slide.is_active ? "Ja" : "Nej"} | Rækkefølge:{" "}
                    {slide.sort_order} | Varighed: {slide.duration_seconds}s
                  </p>
                  <a
                    href={slide.file_url}
                    target="_blank"
                    className="text-sm text-pink-700 underline"
                  >
                    Åbn fil
                  </a>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => toggleActive(slide)}
                    className="rounded-xl bg-gray-200 px-4 py-2"
                  >
                    {slide.is_active ? "Deaktivér" : "Aktivér"}
                  </button>

                  <button
                    onClick={() => deleteSlide(slide)}
                    className="rounded-xl bg-red-500 px-4 py-2 text-white"
                  >
                    Slet
                  </button>
                </div>
              </div>
            ))}

            {slides.length === 0 && (
              <p className="text-gray-500">Ingen slides endnu.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}