import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { bambuPlaBasicColors } from "../../data/bambuPlaBasic";
import { getMaterialColorId, getTriangleColorId } from "./bambuColors";
import type { ParsedModel, Triangle } from "./types";

export function trianglesFromStl(buffer: ArrayBuffer, fallbackColorId: string): ParsedModel {
  const geometry = new STLLoader().parse(buffer);
  return {
    triangles: trianglesFromGeometry(geometry, new THREE.Matrix4(), fallbackColorId),
    palette: bambuPlaBasicColors,
  };
}

export function appendTriangles(target: Triangle[], source: Triangle[]) {
  for (const triangle of source) {
    target.push(triangle);
  }
}

export function trianglesFromGeometry(
  geometry: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  fallbackColorId: string,
  material?: THREE.Material | THREE.Material[],
): Triangle[] {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const color = geometry.getAttribute("color");
  const triangles: Triangle[] = [];

  if (!position) return triangles;

  const materialColorId = getMaterialColorId(material, fallbackColorId);

  const getVertex = (vertexIndex: number) =>
    new THREE.Vector3(position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex)).applyMatrix4(
      matrix,
    );

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const aIndex = index.getX(i);
      const bIndex = index.getX(i + 1);
      const cIndex = index.getX(i + 2);
      triangles.push({
        a: getVertex(aIndex),
        b: getVertex(bIndex),
        c: getVertex(cIndex),
        colorId: getTriangleColorId(color, aIndex, bIndex, cIndex, materialColorId),
      });
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      triangles.push({
        a: getVertex(i),
        b: getVertex(i + 1),
        c: getVertex(i + 2),
        colorId: getTriangleColorId(color, i, i + 1, i + 2, materialColorId),
      });
    }
  }

  return triangles;
}
