import * as THREE from "three";
import { strToU8, zipSync } from "three/examples/jsm/libs/fflate.module.js";
import { describe, expect, it } from "vitest";
import { bambuPlaBasicColors } from "../data/bambuPlaBasic";
import {
  applyModelSupports,
  getLayerCount,
  getScaleDetails,
  modelFileToLayeredPattern,
  modelFileToPreviewData,
  normalizeTriangles,
  sliceLayer,
  type ModelSliceSettings,
  type Triangle,
} from "./model";

const [white, black, red] = bambuPlaBasicColors;

const baseSettings: ModelSliceSettings = {
  width: 10,
  height: 10,
  beadPitchMm: 1,
  beadHeightMm: 1,
  targetLayers: 0,
  colorId: red.id,
  orientation: { rotateXDeg: 0, rotateYDeg: 0, rotateZDeg: 0 },
  support: { enabled: false, colorId: black.id },
};

describe("model slicing core", () => {
  it("computes natural and target-layer scaling for a cube", () => {
    const triangles = createCubeTriangles(10, 10, 6, red.id);
    const natural = getScaleDetails(triangles, baseSettings);
    const targeted = getScaleDetails(triangles, { ...baseSettings, targetLayers: 3 });

    expect(natural.scale).toBeCloseTo(1);
    expect(natural.naturalLayerCount).toBe(6);
    expect(natural.scaledSize.z).toBeCloseTo(6);
    expect(targeted.scale).toBeCloseTo(0.5);
    expect(targeted.scaledSize.z).toBeCloseTo(3);
  });

  it("slices a normalized cube into a filled grid", () => {
    const triangles = normalizeTriangles(createCubeTriangles(10, 10, 6, red.id), baseSettings);

    expect(getLayerCount(triangles, baseSettings)).toBe(6);
    expect(sliceLayer(triangles, 0, baseSettings).filter(Boolean).length).toBe(100);
  });

  it("keeps STL slicing diagnostics stable through the public entry", async () => {
    const file = new File([createBinaryStlCube(10, 10, 6)], "cube.stl");
    const layeredPattern = await modelFileToLayeredPattern(file, baseSettings);

    expect(layeredPattern.diagnostics?.scale).toBeCloseTo(1);
    expect(layeredPattern.diagnostics?.generatedLayerCount).toBe(6);
    expect(layeredPattern.diagnostics?.occupiedCellsByLayer[0]?.occupiedCells).toBe(100);
    expect(layeredPattern.layers).toHaveLength(6);
  });

  it("preserves Bambu 3MF filament colors, paint_color, and extruder mappings", async () => {
    const file = new File([toArrayBuffer(createBambuThreeMfFixture())], "bambu-colors.3mf");
    const previewData = await modelFileToPreviewData(file, { colorId: white.id });
    const colorIds = new Set(previewData.triangles.map((triangle) => triangle.colorId));

    expect(previewData.palette.filter((color) => color.filamentType === "3MF Filament")).toHaveLength(4);
    expect(colorIds).toContain("3mf-filament-2-445566");
    expect(colorIds).toContain("3mf-filament-3-778899");
    expect(colorIds).toContain("3mf-filament-4-aabbcc");
    expect(colorIds.size).toBeGreaterThan(1);
  });

  it("fills unsupported cells below overhanging layers", () => {
    const layerCells = [
      [null, null, null, null],
      [null, black.id, null, null],
      [null, black.id, null, null],
    ];
    const result = applyModelSupports(layerCells, {
      ...baseSettings,
      width: 2,
      height: 2,
      support: { enabled: true, colorId: white.id },
    });

    expect(layerCells[0]?.[1]).toBe(white.id);
    expect(result.supportCells[0]?.[1]).toBe(true);
    expect(result.summary?.generatedCells).toBe(1);
    expect(result.summary?.cellsByLayer).toEqual([{ index: 0, occupiedCells: 1 }]);
  });
});

function createCubeTriangles(width: number, depth: number, height: number, colorId: string): Triangle[] {
  const v = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(width, 0, 0),
    new THREE.Vector3(width, depth, 0),
    new THREE.Vector3(0, depth, 0),
    new THREE.Vector3(0, 0, height),
    new THREE.Vector3(width, 0, height),
    new THREE.Vector3(width, depth, height),
    new THREE.Vector3(0, depth, height),
  ];
  const faces: Array<[number, number, number]> = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7],
  ];

  return faces.map(([a, b, c]) => ({
    a: v[a].clone(),
    b: v[b].clone(),
    c: v[c].clone(),
    colorId,
  }));
}

function createBinaryStlCube(width: number, depth: number, height: number): ArrayBuffer {
  const triangles = createCubeTriangles(width, depth, height, red.id);
  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangles.length, true);

  triangles.forEach((triangle, triangleIndex) => {
    let offset = 84 + triangleIndex * 50;
    for (let index = 0; index < 3; index += 1) {
      view.setFloat32(offset, 0, true);
      offset += 4;
    }
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      view.setFloat32(offset, point.x, true);
      view.setFloat32(offset + 4, point.y, true);
      view.setFloat32(offset + 8, point.z, true);
      offset += 12;
    }
    view.setUint16(offset, 0, true);
  });

  return buffer;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function createBambuThreeMfFixture(): Uint8Array {
  const projectSettings = JSON.stringify({
    filament_colour: ["#112233", "#445566", "#778899", "#AABBCC"],
    filament_ids: ["mat-1", "mat-2", "mat-3", "mat-4"],
  });
  const modelSettings = `
    <config>
      <object id="2"><metadata key="extruder" value="2" /></object>
      <part id="3"><metadata key="extruder" value="3" /></part>
    </config>
  `;
  const model = `
    <model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
      <resources>
        ${createThreeMfObject("2", "")}
        ${createThreeMfObject("3", "")}
        ${createThreeMfObject("4", 'paint_color="1C"')}
      </resources>
      <build>
        <item objectid="2" />
        <item objectid="3" transform="1 0 0 0 1 0 0 0 1 2 0 0" />
        <item objectid="4" transform="1 0 0 0 1 0 0 0 1 4 0 0" />
      </build>
    </model>
  `;

  return zipSync({
    "Metadata/project_settings.config": strToU8(projectSettings),
    "Metadata/model_settings.config": strToU8(modelSettings),
    "3D/3dmodel.model": strToU8(model),
  });
}

function createThreeMfObject(id: string, triangleAttributes: string): string {
  return `
    <object id="${id}" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0" />
          <vertex x="1" y="0" z="0" />
          <vertex x="0" y="1" z="0" />
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2" ${triangleAttributes} />
        </triangles>
      </mesh>
    </object>
  `;
}
