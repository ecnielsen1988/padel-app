"use client"

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const AdminPage = () => {
  // State til at holde events
  const [events, setEvents] = useState<any[]>([]);

  // Hent events fra Supabase
  useEffect(() => {
    const fetchEvents = async () => {
      const { data, error } = await supabase.from("events").select("*");

      if (error) {
        alert("Fejl ved hentning af events: " + error.message);
        return;
      }

      setEvents(data); // Gem events i state
    };

    fetchEvents(); // Kald funktionen når komponenten loades
  }, []);

  // Funktion til at håndtere redigering af event
  const hentEvent = async (eventId: string) => {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (error) {
      alert("Fejl ved hentning af event: " + error.message);
      return;
    }

    // Du kan nu bruge data til at vise eventet og redigere det.
    console.log("Event til redigering: ", data);
    // F.eks. setValgteSpillere(data.spillere); for at vise spillerne i din formular
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold mb-4">Admin-side: Events</h1>

      <div className="space-y-4">
        {events.length === 0 ? (
          <p>Der er ingen events at vise.</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="p-4 border rounded-lg shadow-lg">
              <h2 className="font-semibold">{event.navn}</h2>
              <p>Dato: {event.dato}</p>
              <p>Oprettet af: {event.oprettet_af}</p>
              <button
                onClick={() => hentEvent(event.id)}
                className="mt-2 bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
              >
                Rediger Event
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminPage;
