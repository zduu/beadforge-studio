import { modelFileToLayeredPattern, modelFileToPreviewData } from "../lib/modelToLayered";
import type { ModelProcessingProgress } from "../lib/modelToLayered";
import type { ModelWorkerRequest, ModelWorkerResponse } from "../lib/modelWorkerMessages";

type WorkerScope = {
  addEventListener: (type: "message", listener: (event: MessageEvent<ModelWorkerRequest>) => void) => void;
  postMessage: (message: ModelWorkerResponse) => void;
};

const workerScope = globalThis as unknown as WorkerScope;

workerScope.addEventListener("message", (event) => {
  void handleRequest(event.data);
});

async function handleRequest(request: ModelWorkerRequest) {
  const reportProgress = (progress: ModelProcessingProgress) => {
    workerScope.postMessage({
      id: request.id,
      ok: true,
      type: "progress",
      progress,
    });
  };

  try {
    if (request.type === "preview") {
      const previewData = await modelFileToPreviewData(
        request.file,
        { colorId: request.colorId },
        { onProgress: reportProgress },
      );
      workerScope.postMessage({
        id: request.id,
        ok: true,
        type: "preview",
        previewData,
      });
      return;
    }

    const layeredPattern = await modelFileToLayeredPattern(request.file, request.settings, {
      onProgress: reportProgress,
    });
    workerScope.postMessage({
      id: request.id,
      ok: true,
      type: "slice",
      layeredPattern,
    });
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "本机模型处理失败",
    });
  }
}
