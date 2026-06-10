import { imageFileToPattern } from "../lib/imageToPattern";
import type { ImageWorkerRequest, ImageWorkerResponse } from "../lib/imageWorkerMessages";

type WorkerScope = {
  addEventListener: (type: "message", listener: (event: MessageEvent<ImageWorkerRequest>) => void) => void;
  postMessage: (message: ImageWorkerResponse) => void;
};

const workerScope = globalThis as unknown as WorkerScope;

workerScope.addEventListener("message", (event) => {
  void handleRequest(event.data);
});

async function handleRequest(request: ImageWorkerRequest) {
  try {
    const pattern = await imageFileToPattern(request.file, request.settings);
    workerScope.postMessage({
      id: request.id,
      ok: true,
      pattern,
    });
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "图片处理失败",
    });
  }
}
