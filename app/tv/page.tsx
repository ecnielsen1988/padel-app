"use client";

import { useEffect, useMemo, useState } from "react";
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
  created_at?: string;
};

export default function TvPage() {
  const [slides, setSlides] = useState<TvSlide[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  async function fetchSlides() {
    const { data, error } = await supabase
      .from("tv_slides")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fejl ved hentning af slides:", error);
      return;
    }

    setSlides((data || []) as TvSlide[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchSlides();

    const refreshInterval = setInterval(() => {
      fetchSlides();
    }, 30000);

    return () => clearInterval(refreshInterval);
  }, []);

  const activeSlides = useMemo(() => {
    const now = new Date().getTime();

    return slides.filter((slide) => {
      const startOk =
        !slide.start_date || new Date(slide.start_date).getTime() <= now;
      const endOk =
        !slide.end_date || new Date(slide.end_date).getTime() >= now;

      return slide.is_active && startOk && endOk;
    });
  }, [slides]);

  useEffect(() => {
    if (activeSlides.length === 0) return;

    if (currentIndex >= activeSlides.length) {
      setCurrentIndex(0);
      return;
    }

    const currentSlide = activeSlides[currentIndex];
    const duration = Math.max(currentSlide?.duration_seconds || 12, 5) * 1000;

    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % activeSlides.length);
    }, duration);

    return () => clearTimeout(timer);
  }, [activeSlides, currentIndex]);

  const currentSlide = activeSlides[currentIndex];

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      {/* Fast baggrund */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/tv-background-pink-clean.png')",
        }}
      />

      {/* Let mørk overlay så A4 paper står skarpt */}
      <div className="absolute inset-0 bg-black/10" />

      {/* Main content */}
      <div className="relative z-10 flex h-full w-full items-center justify-center p-8">
        <div className="flex h-full w-full items-center justify-center">
          {/* A4-visning */}
          <div className="relative h-[88vh] max-h-[980px] aspect-[1/1.414]">
            {/* Paper shadow */}
            <div className="absolute inset-0 rounded-[10px] bg-black/20 blur-2xl scale-[1.03]" />

            {/* Paper */}
            <div className="relative h-full w-full overflow-hidden rounded-[8px] border border-white/60 bg-white shadow-2xl">
              {loading && (
                <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-gray-500">
                  Henter slides...
                </div>
              )}

              {!loading && !currentSlide && (
                <div className="flex h-full w-full flex-col items-center justify-center bg-white px-10 text-center">
                  <p className="text-3xl font-bold text-gray-700">
                    Ingen aktive slides
                  </p>
                  <p className="mt-4 text-lg text-gray-500">
                    Upload en PDF eller et billede på /admin/tv
                  </p>
                </div>
              )}

              {!loading && currentSlide?.file_type === "image" && (
                <img
                  src={currentSlide.file_url}
                  alt={currentSlide.title}
                  className="h-full w-full object-contain bg-white"
                />
              )}

              {!loading && currentSlide?.file_type === "pdf" && (
                <iframe
                  src={`${currentSlide.file_url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                  title={currentSlide.title}
                  className="h-full w-full bg-white"
                  style={{ border: "none" }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lille slide-indikator nederst */}
      {activeSlides.length > 1 && (
        <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-2 rounded-full bg-black/25 px-4 py-2 backdrop-blur-sm">
          {activeSlides.map((slide, index) => (
            <div
              key={slide.id}
              className={`h-2.5 w-2.5 rounded-full transition-all ${
                index === currentIndex ? "bg-white" : "bg-white/35"
              }`}
            />
          ))}
        </div>
      )}
    </main>
  );
}