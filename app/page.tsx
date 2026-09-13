"use client";

import { useCallback, useEffect, useState } from "react";
import ScreenCaptureApp from "@/app/components/ScreenCaptureApp";
import RecordingsList from "@/app/components/RecordingsList";
import type { RecordingDto } from "@/lib/types";

export default function Home() {
  const [recordings, setRecordings] = useState<RecordingDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchRecordings = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/recordings");
      if (!response.ok) throw new Error("No se pudo cargar el listado de grabaciones.");
      const { recordings: fetched } = (await response.json()) as { recordings: RecordingDto[] };
      setRecordings(fetched);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "No se pudo cargar el listado de grabaciones.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load on mount; fetchRecordings manages its own loading/error state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRecordings();
  }, [fetchRecordings]);

  const handleSaved = useCallback((recording: RecordingDto) => {
    setRecordings((current) => [recording, ...current]);
  }, []);

  return (
    <div className="flex flex-1 flex-col bg-stage">
      <header className="border-b border-line px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="font-display text-lg tracking-[0.15em] text-paper">SCREEN/CAPTURE</span>
          <span className="font-mono text-xs uppercase tracking-widest text-paper-dim">
            grabador de pantalla
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-10">
        <ScreenCaptureApp onSaved={handleSaved} />
        <RecordingsList
          recordings={recordings}
          isLoading={isLoading}
          errorMessage={errorMessage}
          onRetry={fetchRecordings}
        />
      </main>

      <footer className="border-t border-line px-6 py-4">
        <p className="mx-auto max-w-5xl font-mono text-xs text-paper-dim">
          La grabación se sube directo del navegador al almacenamiento — el servidor solo guarda la
          referencia.
        </p>
      </footer>
    </div>
  );
}
