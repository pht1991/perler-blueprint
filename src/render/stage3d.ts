import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AppState } from '../state/store';
import type { BeadColor, Palette } from '../core/types';

/** 3D 拼豆豆板：用 InstancedMesh 把每颗珠子渲染成带颜色的立方体，可旋转/缩放查看。 */
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
    this.mesh = mesh;
    this.scene.add(mesh);
    // 镜头拉到能看全
    const span = Math.max(w, h);
    this.camera.position.set(0, -span * 1.1, span * 1.2);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() { cancelAnimationFrame(this.raf); this.renderer.dispose(); }
}
