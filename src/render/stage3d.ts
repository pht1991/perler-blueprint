import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AppState } from '../state/store';
import type { BeadColor, Palette } from '../core/types';
import { depthLayers } from '../core/depth';

/**
 * 3D 拼豆豆板：圆珠（圆柱+环形顶面假孔）立在钉板底座上，InstancedMesh 渲染。
 * 平面模式=2D 网格铺在钉板上；分层模式=深度启发式堆叠立体。
 */
export class StageRenderer {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private root: THREE.Group | null = null;
  private colorMap = new Map<string, BeadColor>();
  private raf = 0;

  // 共享几何/材质（重建场景时复用，不重复创建）
  private beadGeo: THREE.CylinderGeometry;
  private pegGeo: THREE.CylinderGeometry;
  private beadMats: THREE.Material[];
  private beadMat: THREE.MeshStandardMaterial;
  private capMat: THREE.MeshStandardMaterial;
  private pegMat: THREE.MeshStandardMaterial;
  private boardMat: THREE.MeshStandardMaterial;

  /** 钉板外扩边距（格数） */
  private static readonly BOARD_MARGIN = 6;

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

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(120, -160, 300);
    this.scene.add(dir);
    // 补一盏弱冷背光，圆珠侧壁不至于死黑
    const fill = new THREE.DirectionalLight(0xbfd8ff, 0.25);
    fill.position.set(-200, 120, -80);
    this.scene.add(fill);

    // 圆珠几何：圆柱轴向默认 Y，转到 Z（立在钉板上、孔朝上）
    this.beadGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.34, 14, 1);
    this.beadGeo.rotateX(Math.PI / 2);
    // 顶/底面贴环形孔贴图（白圈+深孔），实例色染出彩色圆珠
    const ringTex = StageRenderer.makeRingTexture();
    this.beadMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 });
    this.capMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05, map: ringTex });
    // CylinderGeometry 材质组：0=侧壁, 1=顶盖, 2=底盖
    this.beadMats = [this.beadMat, this.capMat, this.capMat];
    // 钉板凸点
    this.pegGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.16, 8);
    this.pegGeo.rotateX(Math.PI / 2);
    this.pegMat = new THREE.MeshStandardMaterial({ color: 0x2c4066, roughness: 0.8 });
    this.boardMat = new THREE.MeshStandardMaterial({ color: 0x16233a, roughness: 0.9 });

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.loop();
  }

  /** 顶面环形贴图：白圈（被实例色染成珠色）+ 深色孔 + 微弱径向明暗 */
  private static makeRingTexture(): THREE.CanvasTexture {
    const S = 128;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const x = cv.getContext('2d')!;
    x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); x.fill();
    const g = x.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.92)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = g;
    x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); x.fill();
    // 中孔（深色，实例色染色后依旧深）
    x.fillStyle = '#20242c';
    x.beginPath(); x.arc(S / 2, S / 2, S * 0.17, 0, Math.PI * 2); x.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
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
    if (this.root) { this.scene.remove(this.root); this.disposeGroup(this.root); }
    this.root = s.depth3d ? this.buildLayered(s) : this.buildFlat(s);
    this.scene.add(this.root);
    this.frame(s);
  }

  /** 切到 3D 视图时调用：画布刚从 display:none 变可见，重算尺寸并把镜头对准豆板 */
  refit(s: AppState) {
    this.resize();
    if (s.blueprint) this.frame(s);
  }

  /** 镜头移到豆板正上方（俯视） */
  topView() {
    const span = this.lastSpan; if (!span) return;
    this.camera.position.set(0, -span * 0.02, span * 1.8);
    this.camera.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }
  private lastSpan = 0;

  /** 机位：拉到能看全整个豆板 */
  private frame(s: AppState) {
    const bp = s.blueprint; if (!bp) return;
    const span = Math.max(bp.w, bp.h);
    this.lastSpan = span;
    this.camera.position.set(0, -span * 1.1, span * (s.depth3d ? 1.6 : 1.35));
    this.camera.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  /** 钉板底座：深蓝底板 + 空位凸点（含外扩边距） */
  private buildBoard(w: number, h: number, beadAt: Uint8Array): THREE.Group {
    const g = new THREE.Group();
    const M = StageRenderer.BOARD_MARGIN;
    const bw = w + M * 2, bh = h + M * 2;
    const board = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.3), this.boardMat);
    board.position.set(0, 0, -0.17);
    g.add(board);

    // 凸点：钉板范围内无珠的格子
    const pegs: { x: number; y: number }[] = [];
    for (let y = -M; y < h + M; y++) {
      for (let x = -M; x < w + M; x++) {
        const inGrid = x >= 0 && x < w && y >= 0 && y < h;
        if (inGrid && beadAt[y * w + x]) continue;
        pegs.push({ x, y });
      }
    }
    const pegMesh = new THREE.InstancedMesh(this.pegGeo, this.pegMat, pegs.length);
    const m = new THREE.Matrix4();
    pegs.forEach((p, i) => {
      // 行方向与 2D 图纸一致：第 0 行在屏幕上方（+Y 远离镜头）
      m.makeTranslation(p.x - w / 2 + 0.5, h / 2 - 0.5 - p.y, 0.08);
      pegMesh.setMatrixAt(i, m);
    });
    pegMesh.instanceMatrix.needsUpdate = true;
    g.add(pegMesh);
    return g;
  }

  /** 平面模式：圆珠按网格铺在钉板上 */
  private buildFlat(s: AppState): THREE.Group {
    const bp = s.blueprint!;
    const { w, h, codes } = bp;
    const beadAt = new Uint8Array(w * h);
    const beads: { x: number; y: number; z: number; rgb: [number, number, number] }[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const code = codes[y * w + x];
        if (code === null || code === undefined) continue;
        const bc = this.colorMap.get(code); if (!bc) continue;
        beadAt[y * w + x] = 1;
        beads.push({ x, y, z: 0.17, rgb: bc.rgb });
      }
    }
    const g = this.buildBoard(w, h, beadAt);
    g.add(this.makeBeadMesh(beads, w, h, s.mirror));
    return g;
  }

  /** 分层模式：深度启发式 → 每格堆叠 1..L 层圆珠，只渲染可见珠（顶珠 + 侧露珠） */
  private buildLayered(s: AppState): THREE.Group {
    const bp = s.blueprint!;
    const { w, h, codes } = bp;
    const LAYERS = 7;
    const rgbMap = new Map<string, [number, number, number]>();
    for (const [code, bc] of this.colorMap) rgbMap.set(code, bc.rgb);
    const heights = depthLayers(bp, LAYERS, rgbMap);

    const beads: { x: number; y: number; z: number; rgb: [number, number, number] }[] = [];
    const at = (x: number, y: number) =>
      x < 0 || x >= w || y < 0 || y >= h ? 0 : heights[y * w + x];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const hz = heights[y * w + x];
        if (hz <= 0) continue;
        const bc = this.colorMap.get(codes[y * w + x]!);
        if (!bc) continue;
        const exposedSide =
          at(x - 1, y) < hz || at(x + 1, y) < hz || at(x, y - 1) < hz || at(x, y + 1) < hz;
        for (let z = 1; z <= hz; z++) {
          if (z === hz || exposedSide) {
            // 第 1 层中心 z=0.17（坐在凸点上），层间距 0.36
            beads.push({ x, y, z: 0.17 + (z - 1) * 0.36, rgb: bc.rgb });
          }
        }
      }
    }
    const beadAt = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (heights[i] > 0) beadAt[i] = 1;
    const g = this.buildBoard(w, h, beadAt);
    g.add(this.makeBeadMesh(beads, w, h, s.mirror));
    return g;
  }

  /** 生成圆珠 InstancedMesh（b.z 已是世界坐标层位） */
  private makeBeadMesh(
    beads: { x: number; y: number; z: number; rgb: [number, number, number] }[],
    w: number, h: number, mirror: boolean
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.beadGeo, this.beadMats, beads.length);
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < beads.length; i++) {
      const b = beads[i];
      const px = (mirror ? (w - 1 - b.x) : b.x) - w / 2 + 0.5;
      // 行方向与 2D 图纸一致：图纸第 0 行（顶部）映射到世界 +Y（镜头远端 = 屏幕上方）
      const py = h / 2 - 0.5 - b.y;
      m.makeTranslation(px, py, b.z);
      mesh.setMatrixAt(i, m);
      color.setRGB(b.rgb[0] / 255, b.rgb[1] / 255, b.rgb[2] / 255);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  private disposeGroup(g: THREE.Group) {
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        // 共享的 bead/peg 几何不释放；底板等每次新建的几何要释放
        if (o.geometry !== this.beadGeo && o.geometry !== this.pegGeo) o.geometry.dispose();
        if (o instanceof THREE.InstancedMesh) o.dispose(); // 释放实例矩阵/颜色缓冲
      }
    });
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.beadGeo.dispose(); this.pegGeo.dispose();
    this.beadMat.dispose(); this.capMat.dispose();
    this.pegMat.dispose(); this.boardMat.dispose();
    this.renderer.dispose();
  }
}
