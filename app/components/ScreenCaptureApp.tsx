"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RecordingDto } from "@/lib/types";

type CaptureStatus = "idle" | "starting" | "recording" | "preview" | "uploading" | "error";

interface ScreenCaptureAppProps {
  onSaved: (recording: RecordingDto) => void;
}

const RECORDER_MIME_TYPE = "video/webm";
const RECORDER_TIMESLICE_MS = 1000;

export default function ScreenCaptureApp({ onSaved }: ScreenCaptureAppProps) {
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [description, setDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isSupported, setIsSupported] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    const supported =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getDisplayMedia &&
      typeof MediaRecorder !== "undefined";
    // One-time browser feature detection, not derived from props/state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsSupported(supported);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStreamTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      stopTimer();
      stopStreamTracks();
      revokeObjectUrl();
    },
    [stopTimer, stopStreamTracks, revokeObjectUrl],
  );

  const handleStart = useCallback(async () => {
    setErrorMessage(null);
    setStatus("starting");

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      chunksRef.current = [];
      blobRef.current = null;
      revokeObjectUrl();

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.src = "";
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => undefined);
      }

      const recorder = new MediaRecorder(stream, { mimeType: RECORDER_MIME_TYPE });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: RECORDER_MIME_TYPE });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.muted = false;
          videoRef.current.src = url;
        }
        setStatus("preview");
      };
      recorderRef.current = recorder;

      // The browser's own "Stop sharing" control ends the video track
      // directly — mirror that into our own stop flow.
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
        stopTimer();
      });

      recorder.start(RECORDER_TIMESLICE_MS);
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      stopTimer();
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 250);

      setStatus("recording");
    } catch (error) {
      stopStreamTracks();
      setStatus("error");
      setErrorMessage(describeCaptureError(error));
    }
  }, [revokeObjectUrl, stopStreamTracks, stopTimer]);

  const handleStop = useCallback(() => {
    stopTimer();
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    stopStreamTracks();
  }, [stopStreamTracks, stopTimer]);

  const resetToIdle = useCallback(() => {
    revokeObjectUrl();
    blobRef.current = null;
    chunksRef.current = [];
    setDescription("");
    setElapsedMs(0);
    setErrorMessage(null);
    setStatus("idle");
  }, [revokeObjectUrl]);

  const handleSave = useCallback(async () => {
    const blob = blobRef.current;
    if (!blob) return;

    setStatus("uploading");
    setErrorMessage(null);

    try {
      const uploadUrlResponse = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: RECORDER_MIME_TYPE }),
      });
      if (!uploadUrlResponse.ok) {
        throw new Error("No se ha podido preparar la subida al almacenamiento.");
      }
      const { uploadUrl, key, publicUrl } = (await uploadUrlResponse.json()) as {
        uploadUrl: string;
        key: string;
        publicUrl: string;
      };

      const putResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": RECORDER_MIME_TYPE },
        body: blob,
      });
      if (!putResponse.ok) {
        throw new Error("La subida del vídeo al almacenamiento ha fallado.");
      }

      const saveResponse = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, s3Key: key, s3Url: publicUrl }),
      });
      if (!saveResponse.ok) {
        throw new Error("El vídeo se subió, pero no se pudieron guardar sus datos.");
      }
      const { recording } = (await saveResponse.json()) as { recording: RecordingDto };

      onSaved(recording);
      resetToIdle();
    } catch (error) {
      setStatus("preview");
      setErrorMessage(error instanceof Error ? error.message : "Error inesperado al guardar.");
    }
  }, [description, onSaved, resetToIdle]);

  if (!isSupported) {
    return (
      <div
        data-testid="unsupported-banner"
        className="rounded-lg border border-line bg-panel p-6 text-paper-dim"
      >
        <p className="font-display text-xl tracking-wide text-paper">Navegador no compatible</p>
        <p className="mt-2 text-sm leading-relaxed">
          Este navegador no implementa <code className="font-mono text-amber">getDisplayMedia</code>{" "}
          ni <code className="font-mono text-amber">MediaRecorder</code>. Prueba con una versión
          reciente de Chrome, Edge o Firefox.
        </p>
      </div>
    );
  }

  const isRecording = status === "recording";
  const isBusy = status === "starting" || status === "uploading";

  return (
    <div className="flex flex-col gap-4">
      <Viewfinder
        videoRef={videoRef}
        status={status}
        elapsedMs={elapsedMs}
        onStart={handleStart}
      />

      <div className="flex flex-col gap-4 rounded-lg border border-line bg-panel p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor="description" className="font-mono text-xs uppercase tracking-widest text-paper-dim">
            Slate — descripción
          </label>
          <input
            id="description"
            data-testid="description-input"
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={status === "uploading"}
            placeholder="¿Qué estás grabando?"
            className="rounded border border-line-strong bg-stage px-3 py-2 text-sm text-paper placeholder:text-paper-dim/60 focus:border-signal focus:outline-none focus:ring-1 focus:ring-signal disabled:opacity-50"
            maxLength={500}
          />
        </div>

        <div className="flex shrink-0 gap-2">
          {status === "idle" || status === "starting" || status === "error" ? (
            <TransportButton
              data-testid="start-button"
              tone="rec"
              onClick={handleStart}
              disabled={isBusy}
            >
              ● Iniciar
            </TransportButton>
          ) : null}

          {isRecording ? (
            <TransportButton data-testid="stop-button" tone="neutral" onClick={handleStop}>
              ■ Detener
            </TransportButton>
          ) : null}

          {status === "preview" ? (
            <>
              <TransportButton data-testid="discard-button" tone="ghost" onClick={resetToIdle}>
                Descartar
              </TransportButton>
              <TransportButton data-testid="save-button" tone="signal" onClick={handleSave}>
                Guardar
              </TransportButton>
            </>
          ) : null}

          {status === "uploading" ? (
            <TransportButton data-testid="save-button" tone="signal" disabled>
              Subiendo…
            </TransportButton>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <p
          data-testid="error-message"
          role="alert"
          className="rounded-lg border border-rec-dim bg-rec/10 px-4 py-3 text-sm text-paper"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function Viewfinder({
  videoRef,
  status,
  elapsedMs,
  onStart,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: CaptureStatus;
  elapsedMs: number;
  onStart: () => void;
}) {
  const hasFrame = status === "recording" || status === "preview" || status === "uploading";
  const isRecording = status === "recording";

  return (
    <div
      data-testid="viewfinder"
      data-status={status}
      className="relative aspect-video w-full overflow-hidden rounded-lg bg-black"
    >
      {/* corner brackets */}
      <div className="pointer-events-none absolute inset-3 z-10">
        <Corner className="left-0 top-0 border-l-2 border-t-2" />
        <Corner className="right-0 top-0 border-r-2 border-t-2" />
        <Corner className="bottom-0 left-0 border-b-2 border-l-2" />
        <Corner className="bottom-0 right-0 border-b-2 border-r-2" />
      </div>

      <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex items-center justify-between font-mono text-xs">
        <div
          data-testid="rec-indicator"
          className={`flex items-center gap-2 ${isRecording ? "text-rec" : "text-paper-dim"}`}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${isRecording ? "bg-rec animate-pulse-rec" : "bg-paper-dim/40"}`}
          />
          {isRecording ? "REC" : status === "preview" ? "PREVIEW" : status === "uploading" ? "UPLOAD" : "STANDBY"}
        </div>
        <span data-testid="timecode" className="tabular-nums text-paper-dim">
          {formatTimecode(elapsedMs)}
        </span>
      </div>

      <video
        ref={videoRef}
        data-testid="capture-video"
        autoPlay
        playsInline
        controls={status === "preview"}
        className={`h-full w-full object-contain ${hasFrame ? "" : "hidden"}`}
      />

      {!hasFrame ? (
        <button
          type="button"
          onClick={onStart}
          disabled={status === "starting"}
          className="flex h-full w-full flex-col items-center justify-center gap-3 text-paper-dim transition hover:text-paper disabled:opacity-60"
        >
          <span className="font-display text-3xl tracking-wide text-paper sm:text-4xl">
            SCREEN/CAPTURE
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.3em]">
            {status === "starting" ? "Abriendo selector…" : "Pulsa para elegir pantalla o ventana"}
          </span>
        </button>
      ) : null}
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return <div className={`absolute h-6 w-6 border-signal/70 ${className}`} />;
}

function TransportButton({
  children,
  tone,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone: "rec" | "signal" | "neutral" | "ghost";
}) {
  const toneClasses: Record<typeof tone, string> = {
    rec: "bg-rec text-stage hover:bg-rec/90 border-rec",
    signal: "bg-signal text-stage hover:bg-signal/90 border-signal",
    neutral: "bg-panel-raised text-paper hover:bg-line-strong border-line-strong",
    ghost: "bg-transparent text-paper-dim hover:text-paper border-line-strong",
  };

  return (
    <button
      type="button"
      className={`rounded border px-4 py-2 font-mono text-xs font-semibold uppercase tracking-widest transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function formatTimecode(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((unit) => String(unit).padStart(2, "0")).join(":");
}

function describeCaptureError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Has cancelado el selector de pantalla o has denegado el permiso de captura.";
    }
    if (error.name === "NotFoundError") {
      return "No se ha encontrado ninguna fuente de pantalla disponible para grabar.";
    }
  }
  return "No se ha podido iniciar la grabación de pantalla.";
}
