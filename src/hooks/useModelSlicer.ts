import { useEffect, useRef, useState } from "react";
import type { ModelProcessingProgress } from "../lib/model";
import type { ModelWorkerJobRequest, ModelWorkerRequest, ModelWorkerResponse } from "../lib/modelWorkerMessages";

export const MODEL_JOB_CANCELLED = "MODEL_JOB_CANCELLED";

type UseModelSlicerOptions = {
  onCancel: () => void;
  onProgress: (progress: ModelProcessingProgress) => void;
};

export function useModelSlicer({ onCancel, onProgress }: UseModelSlicerOptions) {
  const [isModelProcessing, setIsModelProcessing] = useState(false);
  const modelWorkerRef = useRef<Worker | null>(null);
  const modelJobIdRef = useRef(0);
  const modelJobRejectRef = useRef<((error: Error) => void) | null>(null);

  useEffect(() => {
    return () => {
      modelWorkerRef.current?.terminate();
      modelWorkerRef.current = null;
      modelJobRejectRef.current = null;
    };
  }, []);

  const runModelWorkerJob = <T>(
    request: ModelWorkerJobRequest,
    readResponse: (response: Extract<ModelWorkerResponse, { ok: true; type: "preview" | "slice" }>) => T,
  ) =>
    new Promise<T>((resolve, reject) => {
      if (modelWorkerRef.current) {
        modelWorkerRef.current.terminate();
        modelWorkerRef.current = null;
        modelJobRejectRef.current?.(new Error(MODEL_JOB_CANCELLED));
        modelJobRejectRef.current = null;
      }

      const jobId = modelJobIdRef.current + 1;
      modelJobIdRef.current = jobId;
      const worker = new Worker(new URL("../workers/modelWorker.ts", import.meta.url), { type: "module" });
      modelWorkerRef.current = worker;
      modelJobRejectRef.current = reject;

      const cleanup = () => {
        worker.terminate();
        if (modelWorkerRef.current === worker) modelWorkerRef.current = null;
        if (modelJobRejectRef.current === reject) modelJobRejectRef.current = null;
      };

      worker.onmessage = (event: MessageEvent<ModelWorkerResponse>) => {
        const response = event.data;
        if (response.id !== jobId) return;

        if (response.ok && response.type === "progress") {
          onProgress(response.progress);
          return;
        }

        cleanup();
        if (!response.ok) {
          reject(new Error(response.error));
          return;
        }

        try {
          resolve(readResponse(response));
        } catch (error) {
          reject(error instanceof Error ? error : new Error("本机模型处理响应无效"));
        }
      };

      worker.onerror = () => {
        cleanup();
        reject(new Error("本机模型处理线程异常"));
      };

      worker.postMessage({ ...request, id: jobId } as ModelWorkerRequest);
    });

  const cancelModelJob = () => {
    const reject = modelJobRejectRef.current;
    modelWorkerRef.current?.terminate();
    modelWorkerRef.current = null;
    modelJobRejectRef.current = null;
    modelJobIdRef.current += 1;
    reject?.(new Error(MODEL_JOB_CANCELLED));
    setIsModelProcessing(false);
    onCancel();
  };

  return {
    cancelModelJob,
    isModelProcessing,
    runModelWorkerJob,
    setIsModelProcessing,
  };
}
