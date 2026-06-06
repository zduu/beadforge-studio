# 拼豆图纸生成器项目计划

## 1. 项目目标

构建一个可部署到 Cloudflare Pages 或 Cloudflare Workers 的 Web 应用，支持用户上传任意图片，将图片转换为一层拼豆图纸，并允许用户修改图纸颜色、实时预览效果。后续扩展支持上传 3D 打印模型文件，例如 STL、3MF，将模型切片成多层拼豆图纸，并导出每层图纸与颜色文件。

## 2. 当前范围

### 第一阶段：单层拼豆图纸 MVP

- 上传图片。
- 裁剪或适配图片到指定拼豆画布尺寸。
- 将图片像素化为拼豆格子。
- 将每个格子的颜色映射到 Bambu Studio 同款 3D 打印耗材色卡中的最近颜色。
- 显示实时拼豆预览。
- 显示颜色统计：颜色名称、色号、数量。
- 支持用户替换某一种颜色，预览实时更新。
- 支持导出图纸图片和颜色清单。

### 第二阶段：图纸编辑增强

- 支持画布尺寸设置，例如 16x16、32x32、48x48、64x64、自定义宽高。
- 支持不同取样方式：中心点取样、平均色取样、主色取样。
- 支持颜色数量限制，例如最多 8、16、24、32 色。
- 支持手动点选单个格子并修改颜色。
- 支持撤销/重做。
- 支持网格编号、坐标轴、分页打印样式。
- 支持导出 PNG、PDF、CSV 或 JSON。

### 第三阶段：3D 模型转多层拼豆图纸

- 上传 STL、3MF 等 3D 打印模型文件。
- 将模型按拼豆厚度或用户指定层高切片。
- 将每个切片栅格化为一层拼豆图纸。
- 对有颜色信息的 3MF 文件读取模型中的材质/颜色信息。
- 对没有颜色信息的 STL 文件提供手动颜色分配。
- 每层生成独立拼豆图纸。
- 导出多层结构文件，包含：
  - 每层编号。
  - 每层格子颜色。
  - 每种颜色用量。
  - 总颜色用量。
  - 可选拼装顺序。
- 支持 3D 预览，可旋转查看层叠效果。
- 支持导出项目文件，便于下次继续编辑。

## 3. 推荐技术栈

### 前端

- Vite + React + TypeScript。
- Canvas 2D 用于图片处理、像素化和预览渲染。
- Zustand 或 React Context 管理编辑状态。
- CSS Modules 或普通 CSS，保持部署简单。
- 后续 3D 模型预览、STL/3MF 加载和多层预览使用 Three.js。

### 部署

优先使用 Cloudflare Pages：

- 适合静态前端应用。
- 图片处理可以先完全在浏览器本地完成，不需要后端上传和存储。
- 部署简单，构建命令为 `npm run build`，输出目录为 `dist`。

后续如果需要账号、云端保存、分享链接或服务端导出 PDF，再增加 Cloudflare Workers / Pages Functions：

- Workers 负责 API。
- R2 负责保存用户项目文件或导出文件。
- D1 可用于项目元数据。

## 4. 核心功能设计

### 4.1 图片导入

输入：用户上传的 JPG、PNG、WebP 等图片。

处理流程：

1. 使用浏览器 `FileReader` 或 `createImageBitmap` 读取图片。
2. 绘制到隐藏 canvas。
3. 根据用户设置的拼豆宽高进行缩放和留白适配。
4. 对每个格子区域提取代表颜色。

需要支持的适配模式：

- `contain`：完整保留图片，可能留白。MVP 默认使用该模式。
- `cover`：填满画布，可能裁剪图片。
- `stretch`：拉伸到目标尺寸。

### 4.2 像素化与颜色匹配

每个拼豆格子对应一个采样区域。得到 RGB 后，将其匹配到拼豆色卡。

初始算法：

- 使用 RGB 欧氏距离匹配最近颜色。

后续优化：

- 使用 CIE Lab 色彩空间和 Delta E 计算更接近人眼感知的颜色距离。
- 增加抖动选项，改善渐变图片效果。
- 支持用户限制可用颜色范围。

### 4.3 色卡数据

初始内置 Bambu Studio 同款 3D 打印耗材颜色。第一版只支持 Bambu Lab PLA Basic，后续再扩展 PLA Matte、PETG Basic 等耗材颜色。字段建议为：

```ts
type BeadColor = {
  id: string;
  brand: "Bambu Lab";
  filamentType: string;
  code: string;
  name: string;
  hex: string;
  materialId?: string;
};
```

示例：

```ts
{
  id: "bambu-pla-basic-black",
  brand: "Bambu Lab",
  filamentType: "PLA Basic",
  code: "10101",
  name: "Black",
  hex: "#000000",
  materialId: "GFA00"
}
```

说明：

- `hex` 用于图片颜色匹配和预览。
- `code` / `materialId` 用于导出耗材清单和后续对接 Bambu Studio 相关文件。
- 如果官方颜色数据不完整，MVP 可以先用公开可查的近似 HEX 值，并在界面中允许用户修正颜色。

后续可以支持用户自定义耗材色卡，例如导入自己 AMS 中实际装载的颜色。

### 4.4 图纸数据结构

单层图纸建议结构：

```ts
type Pattern = {
  version: 1;
  width: number;
  height: number;
  palette: BeadColor[];
  cells: string[];
};
```

说明：

- `cells` 使用一维数组保存，每个值为 `BeadColor.id`。
- 第 `x, y` 个格子的索引为 `y * width + x`。

多层图纸建议结构：

```ts
type LayeredPattern = {
  version: 1;
  width: number;
  height: number;
  sourceModel?: {
    fileName: string;
    fileType: "stl" | "3mf" | "obj";
    scale: number;
    layerHeightMm: number;
    beadPitchMm: number;
    beadHeightMm: number;
  };
  layers: Array<{
    index: number;
    name: string;
    cells: Array<string | null>;
  }>;
  palette: BeadColor[];
};
```

### 4.5 3D 模型导入与多层切片

3D 多层图纸不再从单张图片推断，而是从真实模型文件生成。建议路线如下：

1. 使用 Three.js 加载 STL 或 3MF。
2. 根据用户设置的拼豆格距、层高、模型缩放比例生成三维栅格。第一版默认单颗拼豆平面格距为 `2.6mm`，单层高度为 `3mm`。
3. 对每个 Z 层做平面切片，得到该层的占用格子。
4. 如果模型带颜色，则尝试把面片颜色映射到最近的 Bambu 耗材颜色。
5. 如果模型不带颜色，则先生成无色或单色图纸，再让用户按层、按区域、按高度或按手动画笔上色。
6. 生成每层拼豆图纸、总耗材数量和装配预览。

STL 和 3MF 的颜色策略不同：

- STL：通常只有几何，没有颜色。MVP 里把它当作单色模型处理，默认使用用户选择的 Bambu 耗材颜色。
- 3MF：可能包含材质、颜色、纹理或多部件信息。优先读取 3MF 内部 material/color definitions；如果没有颜色信息，也退回单色处理。
- 多文件模型：如果用户上传多个 STL，可以把每个 STL 当作一个部件，每个部件分配一种耗材颜色。

### 4.6 颜色文件设计

“颜色文件”建议先定义为本项目自己的 JSON 格式，不直接伪造 Bambu Studio 的内部工程格式。这样数据稳定、可解释，后续再做 3MF 或 Bambu Studio 兼容导出。

建议 MVP 导出 `colors.json`：

```ts
type ColorPlan = {
  version: 1;
  palette: BeadColor[];
  assignments: Array<{
    targetType: "global" | "layer" | "part" | "cell";
    targetId: string;
    colorId: string;
  }>;
  usage: Array<{
    colorId: string;
    beadCount: number;
    estimatedFilamentMm3?: number;
  }>;
};
```

实际导出文件可以分三类：

- `pattern.json`：完整项目文件，应用可以再次打开编辑。
- `colors.csv`：给人看的耗材/颜色清单，包含颜色名、耗材类型、色号、拼豆数量。
- `colors.json`：给程序看的颜色映射文件，保留每层、每部件、每格子的颜色分配。

后续如果确实需要对接 Bambu Studio，可以再研究导出 3MF package：

- 3MF 本质是 ZIP 包，内部有模型 XML、metadata、thumbnail 等文件。
- 彩色 3MF 需要写入 material/color resources，并让 mesh triangle 引用资源。
- Bambu Studio 对 3MF 有自己的扩展 metadata，建议等项目核心功能稳定后再做兼容导出。

### 4.7 颜色编辑与实时预览

用户可以在颜色统计面板中选择某个当前使用颜色，并替换为色卡中的另一个颜色。

实现方式：

1. 维护 `colorOverrides` 或直接批量替换 `cells`。
2. 替换后重新计算颜色统计。
3. Canvas 预览根据最新 `cells` 重绘。

建议 MVP 使用直接替换 `cells`，逻辑更直观。

### 4.8 导出

MVP 导出：

- PNG 图纸：包含彩色格子、网格线、坐标标记。
- JSON 项目文件：保存当前图纸数据。
- CSV 颜色清单：颜色名称、色号、数量。

后续导出：

- PDF 打印文件。
- 多层图纸 ZIP 包。
- 三维拼装说明。
- 颜色映射 JSON。
- 兼容 3MF 的彩色模型文件。

## 5. 页面结构

建议第一版只有一个主工作台页面，不做营销首页。

布局：

- 顶部工具栏：上传图片、画布尺寸、适配模式、生成按钮、导出按钮。
- 左侧或右侧设置区：色卡品牌、颜色数量限制、采样方式。
- 中央预览区：拼豆图纸 canvas。
- 颜色面板：当前颜色列表、数量、替换颜色控件。

移动端：

- 顶部保留核心操作。
- 预览区优先显示。
- 设置和颜色面板用 tabs 或抽屉展示。

## 6. 实现阶段

### Milestone 1：项目脚手架与部署

- 创建 Vite + React + TypeScript 项目。
- 配置 Cloudflare Pages 构建。
- 建立基础页面布局。
- 添加本地开发命令和 README。

验收标准：

- 本地可以 `npm run dev` 启动。
- 可以 `npm run build` 成功构建。
- Cloudflare Pages 可以部署静态版本。

### Milestone 2：图片转单层图纸

- 实现图片上传。
- 实现 canvas 图片采样。
- 实现颜色匹配到 Bambu 耗材色卡。
- 实现拼豆网格预览。

验收标准：

- 上传一张图片后，可以生成指定尺寸的拼豆图纸。
- 预览中每个格子显示对应颜色。

### Milestone 3：颜色编辑与统计

- 实现颜色用量统计。
- 实现颜色替换。
- 实现替换后的实时预览。
- 实现颜色清单导出。

验收标准：

- 用户可以把图纸中的某一种颜色替换成另一种。
- 替换后预览和统计同步变化。

### Milestone 4：图纸导出

- 导出 PNG。
- 导出 JSON 项目文件。
- 支持导入 JSON 项目文件继续编辑。

验收标准：

- 导出的 PNG 可直接查看或打印。
- JSON 文件能恢复完整编辑状态。

### Milestone 5：3D 模型转多层图纸原型

- 定义多层图纸数据结构。
- 实现 STL 文件加载与预览。
- 实现 STL 单色模型的基础切片。
- 实现每层图纸预览。
- 添加 Three.js 3D 层叠预览。
- 导出多层图纸 JSON 和颜色文件 JSON。

验收标准：

- 可以上传 STL 并生成多层图纸数据。
- 可以查看每一层图纸和简单 3D 预览。
- 可以导出项目文件和颜色文件。

### Milestone 6：3MF 彩色模型支持

- 实现 3MF 文件解析。
- 读取 3MF 材质、部件和颜色信息。
- 将模型颜色映射到 Bambu 耗材色卡。
- 支持用户手动修正映射关系。
- 支持按部件、按层、按格子导出颜色分配。

验收标准：

- 上传带颜色的 3MF 文件后，可以生成带颜色的多层图纸。
- 颜色统计能按 Bambu 耗材输出。
- 无颜色 3MF 能退回单色或手动上色流程。

## 7. 主要风险与决策点

- 色卡准确性：Bambu 耗材官方渲染色、实际打印色、图片显示色会有偏差，需要允许用户修正。
- 图片效果：照片直接转拼豆可能会糊，需要提供尺寸、颜色数量、抖动等调节项。
- 打印可读性：大尺寸图纸需要分页和坐标标记，否则很难照着摆。
- 3D 切片复杂度：浏览器端直接切 STL/3MF 可能对大模型性能较差，MVP 需要限制模型面数、层数和网格尺寸。
- 3MF 兼容性：3MF 是容器格式，不同软件写入颜色和材质的方式不完全一致，Bambu Studio 还有自己的扩展数据。
- 颜色文件边界：MVP 先导出本项目自己的 JSON/CSV，等核心流程稳定后再做 Bambu Studio 兼容 3MF 导出。
- Cloudflare Workers 限制：如果所有处理都在浏览器完成，部署最简单；如果服务端处理大图片或生成 PDF，需要考虑 CPU 时间和内存限制。

## 8. 需要确认的问题

1. 第一版是否确认优先部署到 Cloudflare Pages？当前建议仍然是 Pages，因为图片和模型处理可以先在浏览器本地完成。
2. Bambu 色卡第一版只支持 PLA Basic。后续可扩展 PLA Matte、PETG、ABS、TPU。
3. 默认图纸尺寸使用 32x32。后续支持用户改为 16x16、29x29、48x48、64x64 和自定义尺寸。
4. 第一版导出格式是否按 PNG、CSV、JSON 开始？PDF 可以第二阶段加。
5. STL 多层图纸中，一个拼豆格子的实际尺寸默认按 `2.6mm` 计算。
6. 多层图纸的层高默认按 `3mm` 计算。
7. 3D 模型上传后，是否需要先自动缩放到指定最大宽高，例如最大 64x64 格？
8. 这个项目是否需要账号、保存历史项目、分享链接？如果不需要，第一版可以完全前端本地运行。

## 9. 建议的第一版默认决策

如果暂时不做额外确认，建议按以下默认值开始实现：

- 部署：Cloudflare Pages。
- 前端：Vite + React + TypeScript。
- 图片处理：浏览器 Canvas 本地处理。
- 色卡：Bambu Studio 同款 3D 打印耗材色卡，第一版只覆盖 PLA Basic。
- 默认尺寸：32x32，支持用户改为 16x16、29x29、48x48、64x64。
- 图片适配：默认 `contain`，完整保留图片并允许留白，提供 `cover` 和 `stretch`。
- MVP 导出：PNG、CSV、JSON。
- 三维功能：第二大版本从 STL 单色切片开始；3MF 彩色模型和 Bambu Studio 兼容颜色导出放在后续阶段。
- 3D 尺寸默认值：平面格距 `2.6mm`，单层高度 `3mm`。
