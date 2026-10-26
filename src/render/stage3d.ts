import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AppState } from '../state/store';
import type { BeadColor, Palette } from '../core/types';
import { depthLayers } from '../core/depth';

/** 3D 拼豆豆板：InstancedMesh 渲染珠子。平面模式=2D 网格挤出；分层模式=深度启发式堆叠立体。 */
export class StageRenderer {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private mesh: THREE.InstancedMesh | null = null;
  private colorMap = new Map<string, BeadColor>();
  private raf = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    this.camera.position.set(0, -180, 220);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(120, -160, 300);
    this.scene.add(dir);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.loop();
  }

  setPalette(p: Palette) {
    this.colorMap.clear();
    for (const c of p.colors) this.colorMap.set(c.code, c);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setBlueprint(s: AppState) {
    const bp = s.blueprint; if (!bp) return;
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.dispose(); }
    this.mesh = s.depth3d ? this.buildLayered(s) : this.buildFlat(s);
    this.scene.add(this.mesh);
    // 镜头拉到能看全
    const span = Math.max(bp.w, bp.h);
    this.camera.position.set(0, -span * 1.1, span * (s.depth3d ? 1.5 : 1.2));
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  /** 平面模式：2D 网格挤出成单层豆板（原行为） */
  private buildFlat(s: AppState): THREE.InstancedMesh {
    const bp = s.blueprint!;
    const { w, h, codes } = bp;
    const filled = codes.filter((c) => c !== null).length;
    const geo = new THREE.BoxGeometry(0.92, 0.92, 0.6);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0.0 });
    const mesh = new THREE.InstancedMesh(geo, mat, filled);
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    const cell = 1;
    let i = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const code = codes[y * w + x];
        if (code === null || code === undefined) continue;
        const bc = this.colorMap.get(code); if (!bc) continue;
        const px = (s.mirror ? (w - 1 - x) : x) - w / 2;
        const py = (y - h / 2);
        const z = s.meltOn ? 0.3 + s.melt * 0.5 : 0.3;
        m.makeTranslation(px * cell, py * cell, z + (s.meltOn ? 0.3 : 0));
        mesh.setMatrixAt(i, m);
        color.setRGB(bc.rgb[0] / 255, bc.rgb[1] / 255, bc.rgb[2] / 255);
        mesh.setColorAt(i, color);
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  /** 分层模式：深度启发式 → 每格堆叠 1..L 层珠子，只渲染可见珠（顶珠 + 侧露珠） */
  private buildLayered(s: AppState): THREE.InstancedMesh {
    const bp = s.blueprint!;
    const { w, h, codes } = bp;
    const LAYERS = 7;
    const rgbMap = new Map<string, [number, number, number]>();
    for (const [code, bc] of this.colorMap) rgbMap.set(code, bc.rgb);
    const heights = depthLayers(bp, LAYERS, rgbMap);

    // 先收集要渲染的珠子：level = 顶珠，或任一邻居更矮时侧露
    const beads: { x: number; y: number; z: number; rgb: [number, number, number] }[] = [];
    const at = (x: number, y: number) =>
      x < 0 || x >= w || y < 0 || y >= h ? 0 : heights[y * w + x];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const hz = heights[y * w + x];
        if (hz <= 0) continue;
        const code = codes[y * w + x]!;
        const bc = this.colorMap.get(code);
        if (!bc) continue;
        const exposedSide =
          at(x - 1, y) < hz || at(x + 1, y) < hz || at(x, y - 1) < hz || at(x, y + 1) < hz;
        for (let z = 1; z <= hz; z++) {
          if (z === hz || exposedSide) beads.push({ x, y, z, rgb: bc.rgb });
        }
      }
    }

    const geo = new THREE.BoxGeometry(0.92, 0.92, 0.6);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0.0 });
    const mesh = new THREE.InstancedMesh(geo, mat, beads.length);
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < beads.length; i++) {
      const b = beads[i];
      const px = (s.mirror ? (w - 1 - b.x) : b.x) - w / 2;
      const py = b.y - h / 2;
      // 每层厚 0.62，堆叠从底层起
      m.makeTranslation(px, py, 0.3 + (b.z - 1) * 0.62);
      mesh.setMatrixAt(i, m);
      color.setRGB(b.rgb[0] / 255, b.rgb[1] / 255, b.rgb[2] / 255);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() { cancelAnimationFrame(this.raf); this.renderer.dispose(); }
}
