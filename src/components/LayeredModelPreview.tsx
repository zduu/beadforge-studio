import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LayeredPattern } from "../types";

type LayeredModelPreviewProps = {
  layeredPattern: LayeredPattern | null;
  activeLayerIndex: number;
  showSupports: boolean;
};

type PreviewViewState = {
  key: string;
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
};

const MAX_PREVIEW_BLOCKS = 70000;

export function LayeredModelPreview({ layeredPattern, activeLayerIndex, showSupports }: LayeredModelPreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const viewStateRef = useRef<PreviewViewState | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !layeredPattern) return undefined;

    const viewKey = getPreviewViewKey(layeredPattern);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0xf8fafc, 1);
    mount.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 4000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, layeredPattern.layers.length * 0.18, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd7dde5, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(18, 28, 16);
    scene.add(keyLight);

    const group = buildLayerGroup(layeredPattern, activeLayerIndex, showSupports);
    scene.add(group);

    const bounds = new THREE.Box3().setFromObject(group);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 8);
    camera.position.set(center.x + radius * 0.9, center.y + radius * 0.7, center.z + radius * 1.1);
    camera.near = Math.max(0.1, radius / 200);
    camera.far = radius * 8;
    controls.target.copy(center);

    const previousViewState = viewStateRef.current;
    if (previousViewState?.key === viewKey) {
      camera.position.fromArray(previousViewState.position);
      camera.zoom = previousViewState.zoom;
      controls.target.fromArray(previousViewState.target);
    }

    camera.updateProjectionMatrix();
    camera.lookAt(controls.target);

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(320, rect.width);
      const height = Math.max(320, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let animationFrame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      viewStateRef.current = {
        key: viewKey,
        position: vectorToTuple(camera.position),
        target: vectorToTuple(controls.target),
        zoom: camera.zoom,
      };
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
      renderer.dispose();
      mount.replaceChildren();
    };
  }, [activeLayerIndex, layeredPattern, showSupports]);

  return <div aria-label="整体模型预览" className="model-preview-canvas" ref={mountRef} />;
}

function getPreviewViewKey(layeredPattern: LayeredPattern): string {
  return [
    layeredPattern.sourceModel?.fileName ?? "layered-pattern",
    layeredPattern.width,
    layeredPattern.height,
    layeredPattern.layers.length,
    layeredPattern.sourceModel?.scale ?? 1,
  ].join(":");
}

function vectorToTuple(vector: THREE.Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function buildLayerGroup(layeredPattern: LayeredPattern, activeLayerIndex: number, showSupports: boolean) {
  const group = new THREE.Group();
  const widthOffset = (layeredPattern.width - 1) / 2;
  const heightOffset = (layeredPattern.height - 1) / 2;
  const beadPitchMm = layeredPattern.sourceModel?.beadPitchMm ?? 2.6;
  const beadHeightMm = layeredPattern.sourceModel?.beadHeightMm ?? 3;
  const layerStep = Math.max(0.08, beadHeightMm / beadPitchMm);
  const blockHeight = Math.max(0.08, layerStep * 0.86);
  const colorById = new Map(layeredPattern.palette.map((color) => [color.id, color]));
  const blocksByColor = new Map<string, Array<{ x: number; y: number; z: number; layer: number }>>();
  let totalBlocks = 0;

  for (const layer of layeredPattern.layers) {
    for (let index = 0; index < layer.cells.length; index += 1) {
      const colorId = layer.cells[index];
      if (!colorId) continue;
      if (!showSupports && layer.supportCells?.[index]) continue;
      totalBlocks += 1;
    }
  }

  const stride = Math.max(1, Math.ceil(totalBlocks / MAX_PREVIEW_BLOCKS));
  let seen = 0;

  for (let visibleLayerIndex = 0; visibleLayerIndex < layeredPattern.layers.length; visibleLayerIndex += 1) {
    const layer = layeredPattern.layers[visibleLayerIndex];
    if (!layer) continue;

    for (let index = 0; index < layer.cells.length; index += 1) {
      const colorId = layer.cells[index];
      if (!colorId) continue;
      if (!showSupports && layer.supportCells?.[index]) continue;
      seen += 1;
      if (seen % stride !== 0) continue;

      const x = index % layeredPattern.width;
      const y = Math.floor(index / layeredPattern.width);
      const items = blocksByColor.get(colorId) ?? [];
      items.push({
        x: x - widthOffset,
        y: visibleLayerIndex * layerStep,
        z: y - heightOffset,
        layer: visibleLayerIndex,
      });
      blocksByColor.set(colorId, items);
    }
  }

  const geometry = new THREE.BoxGeometry(0.86, blockHeight, 0.86);
  const matrix = new THREE.Matrix4();

  for (const [colorId, blocks] of blocksByColor) {
    const color = colorById.get(colorId);
    const material = new THREE.MeshStandardMaterial({
      color: color?.hex ?? "#94a3b8",
      roughness: 0.76,
      metalness: 0.04,
      transparent: true,
      opacity: 0.92,
    });
    const mesh = new THREE.InstancedMesh(geometry.clone(), material, blocks.length);

    blocks.forEach((block, index) => {
      const scale = block.layer === activeLayerIndex ? 1.04 : 0.94;
      matrix.compose(
        new THREE.Vector3(block.x, block.y, block.z),
        new THREE.Quaternion(),
        new THREE.Vector3(scale, block.layer === activeLayerIndex ? 1.22 : 1, scale),
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  const grid = new THREE.GridHelper(
    Math.max(layeredPattern.width, layeredPattern.height),
    Math.max(layeredPattern.width, layeredPattern.height),
    0x94a3b8,
    0xd0d5dd,
  );
  grid.position.y = -blockHeight / 2 - 0.04;
  group.add(grid);

  return group;
}
