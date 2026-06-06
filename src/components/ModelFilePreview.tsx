import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ModelOrientation, ModelPreviewData } from "../types";

type ModelFilePreviewProps = {
  orientation: ModelOrientation;
  previewData: ModelPreviewData;
};

export function ModelFilePreview({ orientation, previewData }: ModelFilePreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0xf8fafc, 1);
    mount.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 4000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd7dde5, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(18, 28, 16);
    scene.add(keyLight);

    const group = buildModelGroup(previewData, orientation);
    scene.add(group);

    const bounds = new THREE.Box3().setFromObject(group);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 8);

    const grid = new THREE.GridHelper(Math.max(size.x, size.z, 8), 20, 0x94a3b8, 0xd0d5dd);
    grid.position.set(center.x, bounds.min.y - 0.04, center.z);
    scene.add(grid);

    camera.position.set(center.x + radius * 0.9, center.y + radius * 0.7, center.z + radius * 1.1);
    camera.near = Math.max(0.1, radius / 200);
    camera.far = radius * 8;
    camera.updateProjectionMatrix();
    controls.target.copy(center);

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
  }, [orientation.rotateXDeg, orientation.rotateYDeg, orientation.rotateZDeg, previewData]);

  return <div aria-label="原始模型预览" className="model-preview-canvas" ref={mountRef} />;
}

function buildModelGroup(previewData: ModelPreviewData, orientation: ModelOrientation) {
  const group = new THREE.Group();
  const center = new THREE.Vector3(
    (previewData.bounds.min[0] + previewData.bounds.max[0]) / 2,
    (previewData.bounds.min[1] + previewData.bounds.max[1]) / 2,
    (previewData.bounds.min[2] + previewData.bounds.max[2]) / 2,
  );
  const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(orientation.rotateXDeg),
    THREE.MathUtils.degToRad(orientation.rotateYDeg),
    THREE.MathUtils.degToRad(orientation.rotateZDeg),
    "XYZ",
  ));
  const positionsByColor = new Map<string, number[]>();
  const colorById = new Map(previewData.palette.map((color) => [color.id, color]));

  for (const triangle of previewData.triangles) {
    const positions = positionsByColor.get(triangle.colorId) ?? [];
    appendPreviewPoint(positions, triangle.a, center, matrix);
    appendPreviewPoint(positions, triangle.b, center, matrix);
    appendPreviewPoint(positions, triangle.c, center, matrix);
    positionsByColor.set(triangle.colorId, positions);
  }

  for (const [colorId, positions] of positionsByColor) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.computeVertexNormals();

    const color = colorById.get(colorId);
    const material = new THREE.MeshStandardMaterial({
      color: color?.hex ?? "#94a3b8",
      metalness: 0.04,
      roughness: 0.72,
      side: THREE.DoubleSide,
    });

    group.add(new THREE.Mesh(geometry, material));
  }

  return group;
}

function appendPreviewPoint(
  positions: number[],
  point: [number, number, number],
  center: THREE.Vector3,
  matrix: THREE.Matrix4,
) {
  const transformed = new THREE.Vector3(point[0], point[1], point[2]).sub(center).applyMatrix4(matrix);
  positions.push(transformed.x, transformed.z, transformed.y);
}
