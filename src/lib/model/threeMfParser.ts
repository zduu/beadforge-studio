import * as THREE from "three";
import type { ThreeMfBuildItem, ThreeMfComponent, ThreeMfObject, ThreeMfPackage, ThreeMfTriangle } from "./types";
import {
  decodeArchiveText,
  findXmlElements,
  findXmlStartTags,
  getXmlElementBody,
  parseFloatAttribute,
  parseIntAttribute,
} from "./xml";

export function parseThreeMfModel(archive: ThreeMfPackage, path: string) {
  const modelText = decodeArchiveText(archive, path);
  if (!modelText) return null;

  const objects = new Map<string, ThreeMfObject>();
  const build: ThreeMfBuildItem[] = [];

  for (const objectNode of findXmlElements(getXmlElementBody(modelText, "resources") ?? modelText, "object")) {
    const id = objectNode.attributes.get("id");
    if (!id) continue;

    const vertices: THREE.Vector3[] = [];
    const triangles: ThreeMfTriangle[] = [];
    const components: ThreeMfComponent[] = [];

    for (const vertexNode of findXmlStartTags(getXmlElementBody(objectNode.body, "vertices") ?? "", "vertex")) {
      vertices.push(
        new THREE.Vector3(
          parseFloatAttribute(vertexNode.attributes, "x"),
          parseFloatAttribute(vertexNode.attributes, "y"),
          parseFloatAttribute(vertexNode.attributes, "z"),
        ),
      );
    }

    for (const triangleNode of findXmlStartTags(getXmlElementBody(objectNode.body, "triangles") ?? "", "triangle")) {
      triangles.push({
        vertices: [
          parseIntAttribute(triangleNode.attributes, "v1"),
          parseIntAttribute(triangleNode.attributes, "v2"),
          parseIntAttribute(triangleNode.attributes, "v3"),
        ],
        paintColor: triangleNode.attributes.get("paint_color") ?? null,
      });
    }

    for (const componentNode of findXmlStartTags(getXmlElementBody(objectNode.body, "components") ?? "", "component")) {
      const componentObjectId = componentNode.attributes.get("objectid");
      if (!componentObjectId) continue;

      components.push({
        objectId: componentObjectId,
        path: componentNode.attributes.get("p:path") ?? null,
        transform: parseThreeMfTransform(componentNode.attributes.get("transform") ?? null),
      });
    }

    objects.set(id, { id, vertices, triangles, components });
  }

  for (const itemNode of findXmlStartTags(getXmlElementBody(modelText, "build") ?? "", "item")) {
    const objectId = itemNode.attributes.get("objectid");
    if (!objectId) continue;
    build.push({ objectId, transform: parseThreeMfTransform(itemNode.attributes.get("transform") ?? null) });
  }

  return { objects, build };
}

export function parseThreeMfTransform(transform: string | null): THREE.Matrix4 {
  if (!transform) return new THREE.Matrix4();

  const values = transform
    .trim()
    .split(/\s+/)
    .map((value) => Number.parseFloat(value));
  if (values.length === 12 && values.every(Number.isFinite)) {
    const matrix = new THREE.Matrix4();
    matrix.set(
      values[0],
      values[3],
      values[6],
      values[9],
      values[1],
      values[4],
      values[7],
      values[10],
      values[2],
      values[5],
      values[8],
      values[11],
      0,
      0,
      0,
      1,
    );
    return matrix;
  }

  if (values.length === 16 && values.every(Number.isFinite)) {
    return new THREE.Matrix4().fromArray(values).transpose();
  }

  return new THREE.Matrix4();
}

export function normalizeThreeMfPath(path: string): string {
  return path.replace(/^\//, "");
}
