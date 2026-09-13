"use client";

import type { RecordingDto } from "@/lib/types";

interface RecordingsListProps {
  recordings: RecordingDto[];
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
}

export default function RecordingsList({
  recordings,
  isLoading,
  errorMessage,
  onRetry,
}: RecordingsListProps) {
  return (
    <section className="flex flex-col gap-4" aria-label="Grabaciones guardadas">
      <div className="flex items-baseline justify-between border-b border-line pb-2">
        <h2 className="font-display text-2xl tracking-wide text-paper">REEL</h2>
        <span className="font-mono text-xs uppercase tracking-widest text-paper-dim">
          {recordings.length} {recordings.length === 1 ? "grabación" : "grabaciones"}
        </span>
      </div>

      {errorMessage ? (
        <div
          data-testid="recordings-error"
          role="alert"
          className="flex items-center justify-between rounded-lg border border-rec-dim bg-rec/10 px-4 py-3 text-sm text-paper"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={onRetry}
            className="font-mono text-xs uppercase tracking-widest text-amber underline decoration-dotted underline-offset-4 hover:text-amber/80"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div data-testid="recordings-loading" className="font-mono text-xs uppercase tracking-widest text-paper-dim">
          Cargando reel…
        </div>
      ) : null}

      {!isLoading && !errorMessage && recordings.length === 0 ? (
        <p data-testid="recordings-empty" className="text-sm text-paper-dim">
          Todavía no hay grabaciones. Graba tu pantalla y pulsa <em>Guardar</em> para verla aquí.
        </p>
      ) : null}

      {recordings.length > 0 ? (
        <ul data-testid="recordings-grid" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recordings.map((recording) => (
            <RecordingCard key={recording._id} recording={recording} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function RecordingCard({ recording }: { recording: RecordingDto }) {
  return (
    <li
      data-testid="recording-card"
      className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-3"
    >
      <video
        data-testid="recording-player"
        src={recording.s3Url}
        controls
        preload="metadata"
        className="aspect-video w-full rounded bg-black object-contain"
      />
      <p className="line-clamp-2 text-sm text-paper" title={recording.description || undefined}>
        {recording.description || <span className="text-paper-dim">Sin descripción</span>}
      </p>
      <time
        dateTime={recording.createdAt}
        className="font-mono text-xs tabular-nums text-paper-dim"
      >
        {formatTimestamp(recording.createdAt)}
      </time>
    </li>
  );
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
