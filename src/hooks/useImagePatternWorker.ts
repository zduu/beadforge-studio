import { useEffect, useRef } from "react";
import type { ImageWorkerRequest, ImageWorkerResponse } from "../lib/imageWorkerMessages";
import type { Pattern, PatternSettings } from "../types";

export function useImagePatternWorker() {
  const imageWorkerRef = useRef<Worker | null>(null);
  const imageJobIdRef = useRef(0);

  useEffect(() => {
    return () => {
      imageWorkerRef.current?.terminate();
      imageWorkerRef.current = null;
    };
  }, []);

  return (file: File, nextSettings: PatternSettings) =>
    new Promise<Pattern>((resolve, reject) => {
      imageWorkerRef.current?.terminate();

      const jobId = imageJobIdRef.current + 1;
      imageJobIdRef.current = jobId;
      const worker = new Worker(new URL("../workers/imageWorker.ts", import.meta.url), { type: "module" });
      imageWorkerRef.current = worker;

      const cleanup = () => {
        worker.terminate();
        if (imageWorkerRef.current === worker) imageWorkerRef.current = null;
      };

      worker.onmessage = (event: MessageEvent<ImageWorkerResponse>) => {
        const response = event.data;
        if (response.id !== jobId) return;

        cleanup();
        if (!response.ok) {
          reject(new Error(response.error));
          return;
        }
        resolve(response.pattern);
      };

      worker.onerror = () => {
        cleanup();
        reject(new Error("本机图片处理线程异常"));
      };

      worker.postMessage({ id: jobId, file, settings: nextSettings } satisfies ImageWorkerRequest);
    });
}
