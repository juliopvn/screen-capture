import type { Page } from "@playwright/test";

/**
 * `getDisplayMedia()` opens a native OS picker that cannot be driven
 * headlessly or reliably in CI. We replace it, before any app script runs,
 * with a synthetic `MediaStream` from an animated `<canvas>` — real enough
 * for `MediaRecorder` to encode actual webm chunks, so the rest of the
 * pipeline (upload, persistence, playback) is exercised for real.
 */
export async function mockGetDisplayMedia(
  page: Page,
  options: { rejectWith?: "NotAllowedError" | "NotFoundError" } = {},
) {
  await page.addInitScript((opts) => {
    const mediaDevices = navigator.mediaDevices as MediaDevices & {
      getDisplayMedia: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
    };

    mediaDevices.getDisplayMedia = async () => {
      if (opts.rejectWith) {
        throw new DOMException(`mock ${opts.rejectWith}`, opts.rejectWith);
      }

      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext("2d");

      let hue = 0;
      const draw = () => {
        if (!ctx) return;
        hue = (hue + 3) % 360;
        ctx.fillStyle = `hsl(${hue} 80% 50%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        requestAnimationFrame(draw);
      };
      draw();

      const captureCanvas = canvas as HTMLCanvasElement & {
        captureStream: (frameRate?: number) => MediaStream;
      };
      return captureCanvas.captureStream(15);
    };
  }, options);
}
