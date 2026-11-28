import * as THREE from 'three';

export type BodyPartName = 'head' | 'torso' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';
export type PoseName = 'stand' | 'walk' | 'run' | 'hero' | 'tpose' | 'dance';
export type ModelType = 'classic' | 'slim'; // Steve (4px) vs Alex (3px)

export interface RaycastHitResult {
  pixel: { x: number; y: number };
  part: BodyPartName;
  isOverlay: boolean;
}

export class MinecraftSkinModel {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private skinTexture!: THREE.CanvasTexture;
  private baseMaterial!: THREE.MeshLambertMaterial;
  private overlayMaterial!: THREE.MeshLambertMaterial;

  // Character Groups & Meshes
  private characterGroup!: THREE.Group;
  private headGroup!: THREE.Group;
  private torsoGroup!: THREE.Group;
  private rightArmGroup!: THREE.Group;
  private leftArmGroup!: THREE.Group;
  private rightLegGroup!: THREE.Group;
  private leftLegGroup!: THREE.Group;

  private headMesh!: THREE.Mesh;
  private headOverlayMesh!: THREE.Mesh;
  private torsoMesh!: THREE.Mesh;
  private torsoOverlayMesh!: THREE.Mesh;
  private rightArmMesh!: THREE.Mesh;
  private rightArmOverlayMesh!: THREE.Mesh;
  private leftArmMesh!: THREE.Mesh;
  private leftArmOverlayMesh!: THREE.Mesh;
  private rightLegMesh!: THREE.Mesh;
  private rightLegOverlayMesh!: THREE.Mesh;
  private leftLegMesh!: THREE.Mesh;
  private leftLegOverlayMesh!: THREE.Mesh;

  // Maps for raycasting
  private baseMeshes: { mesh: THREE.Mesh; part: BodyPartName }[] = [];
  private overlayMeshes: { mesh: THREE.Mesh; part: BodyPartName }[] = [];
  private isOverlayVisible = true;

  // Raycaster
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // Interaction State
  private interactionMode: 'paint' | 'orbit' = 'paint';
  private isInteracting = false;
  private isPainting = false;
  private lastPaintedPixel: { x: number; y: number } | null = null;
  private prevMouseX = 0;
  private prevMouseY = 0;
  private prevTouchDist = 0;

  private rotX = 0.2;
  private rotY = -0.4;
  private targetRotX = 0.2;
  private targetRotY = -0.4;
  private distance = 42;
  private targetDistance = 42;

  // Camera Target Center (for focusing on specific limbs)
  private currentCenter = new THREE.Vector3(0, 0, 0);
  private targetCenter = new THREE.Vector3(0, 0, 0);
  private focusedPart: BodyPartName | 'all' = 'all';

  // Animation & Poses
  private currentPose: PoseName = 'stand';
  private currentModelType: ModelType = 'classic';
  private animTime = 0;
  private isAnimating = true;
  private rafId = 0;
  private disposed = false;
  /** Removes the window listeners when the editor is destroyed. */
  private readonly listeners = new AbortController();
  private resizeObserver?: ResizeObserver;

  // External Callbacks for 3D Painting & Live Sync
  public on3DPaintStart?: (pixel: { x: number; y: number }, event: MouseEvent | Touch) => void;
  public on3DPaintMove?: (pixel: { x: number; y: number }, event: MouseEvent | Touch) => void;
  public on3DPaintEnd?: () => void;
  public on3DHover?: (hit: RaycastHitResult | null) => void;
  public getActiveLayer?: () => 'all' | 'base' | 'overlay';

  constructor(
    private container: HTMLElement,
    private skinCanvas: HTMLCanvasElement
  ) {
    this.initThree();
    this.initCharacter();
    this.setupListeners();
    this.applyPose('stand');
    this.animate();
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  private initThree(): void {
    const width = this.container.clientWidth || 300;
    const height = this.container.clientHeight || 400;

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    this.updateCameraPosition();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.cursor = 'crosshair';

    // Lights (Authentic Minecraft soft directional lighting)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xfff6e5, 0.75);
    dirLight1.position.set(20, 40, 30);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xbdd5ea, 0.35);
    dirLight2.position.set(-20, -10, -20);
    this.scene.add(dirLight2);

    // Texture & Materials
    this.skinTexture = new THREE.CanvasTexture(this.skinCanvas);
    this.skinTexture.magFilter = THREE.NearestFilter;
    this.skinTexture.minFilter = THREE.NearestFilter;
    this.skinTexture.colorSpace = THREE.SRGBColorSpace;
    this.skinTexture.generateMipmaps = false;

    this.baseMaterial = new THREE.MeshLambertMaterial({
      map: this.skinTexture,
      transparent: false,
      side: THREE.FrontSide
    });

    this.overlayMaterial = new THREE.MeshLambertMaterial({
      map: this.skinTexture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide
    });
  }

  // =========================================================================
  // CHARACTER RIG GENERATION
  // =========================================================================

  private initCharacter(): void {
    this.characterGroup = new THREE.Group();
    this.characterGroup.position.set(0, -6, 0);
    this.scene.add(this.characterGroup);

    this.baseMeshes = [];
    this.overlayMeshes = [];

    // 1. Head (8x8x8)
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 12, 0); // Pivot at neck

    const headGeo = new THREE.BoxGeometry(8, 8, 8);
    this.setBoxUV(headGeo, 0, 0, 8, 8, 8);
    this.headMesh = new THREE.Mesh(headGeo, this.baseMaterial);
    this.headMesh.position.set(0, 4, 0);
    this.headGroup.add(this.headMesh);
    this.baseMeshes.push({ mesh: this.headMesh, part: 'head' });

    const headOverlayGeo = new THREE.BoxGeometry(8.8, 8.8, 8.8);
    this.setBoxUV(headOverlayGeo, 32, 0, 8, 8, 8);
    this.headOverlayMesh = new THREE.Mesh(headOverlayGeo, this.overlayMaterial);
    this.headOverlayMesh.position.set(0, 4, 0);
    this.headGroup.add(this.headOverlayMesh);
    this.overlayMeshes.push({ mesh: this.headOverlayMesh, part: 'head' });

    this.characterGroup.add(this.headGroup);

    // 2. Torso (8x12x4)
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 6, 0);

    const torsoGeo = new THREE.BoxGeometry(8, 12, 4);
    this.setBoxUV(torsoGeo, 16, 16, 8, 12, 4);
    this.torsoMesh = new THREE.Mesh(torsoGeo, this.baseMaterial);
    this.torsoGroup.add(this.torsoMesh);
    this.baseMeshes.push({ mesh: this.torsoMesh, part: 'torso' });

    const torsoOverlayGeo = new THREE.BoxGeometry(8.7, 12.7, 4.7);
    this.setBoxUV(torsoOverlayGeo, 16, 32, 8, 12, 4);
    this.torsoOverlayMesh = new THREE.Mesh(torsoOverlayGeo, this.overlayMaterial);
    this.torsoGroup.add(this.torsoOverlayMesh);
    this.overlayMeshes.push({ mesh: this.torsoOverlayMesh, part: 'torso' });

    this.characterGroup.add(this.torsoGroup);

    // 3. Right Arm
    this.rightArmGroup = new THREE.Group();
    this.rebuildRightArm(this.currentModelType);
    this.characterGroup.add(this.rightArmGroup);

    // 4. Left Arm
    this.leftArmGroup = new THREE.Group();
    this.rebuildLeftArm(this.currentModelType);
    this.characterGroup.add(this.leftArmGroup);

    // 5. Right Leg (4x12x4)
    this.rightLegGroup = new THREE.Group();
    this.rightLegGroup.position.set(-1.95, 0, 0);

    const rightLegGeo = new THREE.BoxGeometry(4, 12, 4);
    this.setBoxUV(rightLegGeo, 0, 16, 4, 12, 4);
    this.rightLegMesh = new THREE.Mesh(rightLegGeo, this.baseMaterial);
    this.rightLegMesh.position.set(0, -6, 0);
    this.rightLegGroup.add(this.rightLegMesh);
    this.baseMeshes.push({ mesh: this.rightLegMesh, part: 'rightLeg' });

    const rightLegOverlayGeo = new THREE.BoxGeometry(4.6, 12.6, 4.6);
    this.setBoxUV(rightLegOverlayGeo, 0, 32, 4, 12, 4);
    this.rightLegOverlayMesh = new THREE.Mesh(rightLegOverlayGeo, this.overlayMaterial);
    this.rightLegOverlayMesh.position.set(0, -6, 0);
    this.rightLegGroup.add(this.rightLegOverlayMesh);
    this.overlayMeshes.push({ mesh: this.rightLegOverlayMesh, part: 'rightLeg' });

    this.characterGroup.add(this.rightLegGroup);

    // 6. Left Leg (4x12x4)
    this.leftLegGroup = new THREE.Group();
    this.leftLegGroup.position.set(1.95, 0, 0);

    const leftLegGeo = new THREE.BoxGeometry(4, 12, 4);
    this.setBoxUV(leftLegGeo, 16, 48, 4, 12, 4);
    this.leftLegMesh = new THREE.Mesh(leftLegGeo, this.baseMaterial);
    this.leftLegMesh.position.set(0, -6, 0);
    this.leftLegGroup.add(this.leftLegMesh);
    this.baseMeshes.push({ mesh: this.leftLegMesh, part: 'leftLeg' });

    const leftLegOverlayGeo = new THREE.BoxGeometry(4.6, 12.6, 4.6);
    this.setBoxUV(leftLegOverlayGeo, 0, 48, 4, 12, 4);
    this.leftLegOverlayMesh = new THREE.Mesh(leftLegOverlayGeo, this.overlayMaterial);
    this.leftLegOverlayMesh.position.set(0, -6, 0);
    this.leftLegGroup.add(this.leftLegOverlayMesh);
    this.overlayMeshes.push({ mesh: this.leftLegOverlayMesh, part: 'leftLeg' });

    this.characterGroup.add(this.leftLegGroup);
  }

  private rebuildRightArm(model: ModelType): void {
    // Remove old arm meshes from raycast arrays
    this.baseMeshes = this.baseMeshes.filter(m => m.part !== 'rightArm');
    this.overlayMeshes = this.overlayMeshes.filter(m => m.part !== 'rightArm');

    while (this.rightArmGroup.children.length > 0) {
      this.rightArmGroup.remove(this.rightArmGroup.children[0]);
    }
    const armW = model === 'slim' ? 3 : 4;
    const posX = model === 'slim' ? -5.5 : -6;
    this.rightArmGroup.position.set(posX, 10, 0);

    const armGeo = new THREE.BoxGeometry(armW, 12, 4);
    this.setBoxUV(armGeo, 40, 16, armW, 12, 4);
    this.rightArmMesh = new THREE.Mesh(armGeo, this.baseMaterial);
    this.rightArmMesh.position.set(0, -4, 0);
    this.rightArmGroup.add(this.rightArmMesh);
    this.baseMeshes.push({ mesh: this.rightArmMesh, part: 'rightArm' });

    const armOverlayGeo = new THREE.BoxGeometry(armW + 0.6, 12.6, 4.6);
    this.setBoxUV(armOverlayGeo, 40, 32, armW, 12, 4);
    this.rightArmOverlayMesh = new THREE.Mesh(armOverlayGeo, this.overlayMaterial);
    this.rightArmOverlayMesh.position.set(0, -4, 0);
    this.rightArmGroup.add(this.rightArmOverlayMesh);
    this.overlayMeshes.push({ mesh: this.rightArmOverlayMesh, part: 'rightArm' });
  }

  private rebuildLeftArm(model: ModelType): void {
    // Remove old arm meshes from raycast arrays
    this.baseMeshes = this.baseMeshes.filter(m => m.part !== 'leftArm');
    this.overlayMeshes = this.overlayMeshes.filter(m => m.part !== 'leftArm');

    while (this.leftArmGroup.children.length > 0) {
      this.leftArmGroup.remove(this.leftArmGroup.children[0]);
    }
    const armW = model === 'slim' ? 3 : 4;
    const posX = model === 'slim' ? 5.5 : 6;
    this.leftArmGroup.position.set(posX, 10, 0);

    const armGeo = new THREE.BoxGeometry(armW, 12, 4);
    this.setBoxUV(armGeo, 32, 48, armW, 12, 4);
    this.leftArmMesh = new THREE.Mesh(armGeo, this.baseMaterial);
    this.leftArmMesh.position.set(0, -4, 0);
    this.leftArmGroup.add(this.leftArmMesh);
    this.baseMeshes.push({ mesh: this.leftArmMesh, part: 'leftArm' });

    const armOverlayGeo = new THREE.BoxGeometry(armW + 0.6, 12.6, 4.6);
    this.setBoxUV(armOverlayGeo, 48, 48, armW, 12, 4);
    this.leftArmOverlayMesh = new THREE.Mesh(armOverlayGeo, this.overlayMaterial);
    this.leftArmOverlayMesh.position.set(0, -4, 0);
    this.leftArmGroup.add(this.leftArmOverlayMesh);
    this.overlayMeshes.push({ mesh: this.leftArmOverlayMesh, part: 'leftArm' });
  }

  // =========================================================================
  // EXACT MINECRAFT UV MAPPING HELPER
  // =========================================================================

  private setBoxUV(
    geo: THREE.BoxGeometry,
    u0: number,
    v0: number,
    w: number,
    h: number,
    d: number,
    texW = 64,
    texH = 64
  ): void {
    const uv = geo.attributes['uv'] as THREE.BufferAttribute;

    const setFace = (
      faceIdx: number,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      flipH = false,
      flipV = false
    ) => {
      let uMin = x1 / texW;
      let uMax = x2 / texW;
      let vMin = (texH - y2) / texH;
      let vMax = (texH - y1) / texH;

      if (flipH) [uMin, uMax] = [uMax, uMin];
      if (flipV) [vMin, vMax] = [vMax, vMin];

      uv.setXY(faceIdx * 4 + 0, uMin, vMax);
      uv.setXY(faceIdx * 4 + 1, uMax, vMax);
      uv.setXY(faceIdx * 4 + 2, uMin, vMin);
      uv.setXY(faceIdx * 4 + 3, uMax, vMin);
    };

    // Face 0: Right (+X) -> width is d, height is h
    setFace(0, u0, v0 + d, u0 + d, v0 + d + h, true);

    // Face 1: Left (-X) -> width is d, height is h
    setFace(1, u0 + d + w, v0 + d, u0 + d + w + d, v0 + d + h, false);

    // Face 2: Top (+Y) -> width is w, height is d
    setFace(2, u0 + d, v0, u0 + d + w, v0 + d, false);

    // Face 3: Bottom (-Y) -> width is w, height is d
    setFace(3, u0 + d + w, v0, u0 + d + w + w, v0 + d, false);

    // Face 4: Front (+Z) -> width is w, height is h
    setFace(4, u0 + d, v0 + d, u0 + d + w, v0 + d + h, false);

    // Face 5: Back (-Z) -> width is w, height is h
    setFace(5, u0 + d + w + d, v0 + d, u0 + d + w + d + w, v0 + d + h, false);

    uv.needsUpdate = true;
  }

  // =========================================================================
  // 3D RAYCASTING & PIXEL MAPPING
  // =========================================================================

  public raycastAt(clientX: number, clientY: number): RaycastHitResult | null {
    if (!this.renderer || !this.camera) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.mouse.set(x, y);

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const activeLayer = this.getActiveLayer ? this.getActiveLayer() : 'all';

    // Gather candidate meshes that are currently visible
    const candidates: { mesh: THREE.Mesh; part: BodyPartName; isOverlay: boolean }[] = [];

    // Overlays first
    if (activeLayer !== 'base' && this.isOverlayVisible) {
      for (const item of this.overlayMeshes) {
        if (item.mesh.visible && item.mesh.parent?.visible) {
          candidates.push({ mesh: item.mesh, part: item.part, isOverlay: true });
        }
      }
    }

    // Base meshes
    if (activeLayer !== 'overlay') {
      for (const item of this.baseMeshes) {
        if (item.mesh.visible && item.mesh.parent?.visible) {
          candidates.push({ mesh: item.mesh, part: item.part, isOverlay: false });
        }
      }
    }

    if (candidates.length === 0) return null;

    const meshes = candidates.map(c => c.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, false);

    const ctx = this.skinCanvas.getContext('2d');

    for (const hit of intersects) {
      if (!hit.uv) continue;
      const candidate = candidates.find(c => c.mesh === hit.object);
      if (!candidate) continue;

      const px = Math.min(63, Math.max(0, Math.floor(hit.uv.x * 64)));
      const py = Math.min(63, Math.max(0, Math.floor((1 - hit.uv.y) * 64)));

      // If clicked an overlay mesh and activeLayer is 'all':
      // Check if pixel at (px, py) on skinCanvas has alpha === 0.
      // If transparent, allow ray to hit the base mesh underneath!
      if (candidate.isOverlay && activeLayer === 'all' && ctx) {
        try {
          const pixelData = ctx.getImageData(px, py, 1, 1).data;
          if (pixelData[3] < 10) {
            // Transparent overlay: continue to check base mesh behind
            continue;
          }
        } catch (_) {}
      }

      return {
        pixel: { x: px, y: py },
        part: candidate.part,
        isOverlay: candidate.isOverlay
      };
    }

    return null;
  }

  // =========================================================================
  // PUBLIC CONTROLS & LIMB FOCUS
  // =========================================================================

  public updateTexture(): void {
    this.skinTexture.needsUpdate = true;
  }

  public setInteractionMode(mode: 'paint' | 'orbit'): void {
    this.interactionMode = mode;
    this.renderer.domElement.style.cursor = mode === 'paint' ? 'crosshair' : 'grab';
  }

  public getInteractionMode(): 'paint' | 'orbit' {
    return this.interactionMode;
  }

  public setModelType(model: ModelType): void {
    if (this.currentModelType === model) return;
    this.currentModelType = model;
    this.rebuildRightArm(model);
    this.rebuildLeftArm(model);
    this.applyPose(this.currentPose);
  }

  public setPartVisibility(part: BodyPartName, visible: boolean): void {
    switch (part) {
      case 'head':
        this.headGroup.visible = visible;
        break;
      case 'torso':
        this.torsoGroup.visible = visible;
        break;
      case 'rightArm':
        this.rightArmGroup.visible = visible;
        break;
      case 'leftArm':
        this.leftArmGroup.visible = visible;
        break;
      case 'rightLeg':
        this.rightLegGroup.visible = visible;
        break;
      case 'leftLeg':
        this.leftLegGroup.visible = visible;
        break;
    }
  }

  /**
   * Focuses and isolates a specific limb or shows the full character.
   * Smoothly adjusts camera target center and zoom distance.
   */
  public focusPart(part: BodyPartName | 'all'): void {
    this.focusedPart = part;

    if (part === 'all') {
      // Show all body parts
      this.headGroup.visible = true;
      this.torsoGroup.visible = true;
      this.rightArmGroup.visible = true;
      this.leftArmGroup.visible = true;
      this.rightLegGroup.visible = true;
      this.leftLegGroup.visible = true;

      this.targetCenter.set(0, 0, 0);
      this.targetDistance = this.fullBodyDistance();
      return;
    }

    // Isolate ONLY the requested limb
    this.headGroup.visible = part === 'head';
    this.torsoGroup.visible = part === 'torso';
    this.rightArmGroup.visible = part === 'rightArm';
    this.leftArmGroup.visible = part === 'leftArm';
    this.rightLegGroup.visible = part === 'rightLeg';
    this.leftLegGroup.visible = part === 'leftLeg';

    // Center camera on the isolated limb and zoom in closely!
    switch (part) {
      case 'head':
        this.targetCenter.set(0, 10, 0);
        this.targetDistance = 20;
        break;
      case 'torso':
        this.targetCenter.set(0, 0, 0);
        this.targetDistance = 24;
        break;
      case 'rightArm':
        this.targetCenter.set(-6, 0, 0);
        this.targetDistance = 21;
        break;
      case 'leftArm':
        this.targetCenter.set(6, 0, 0);
        this.targetDistance = 21;
        break;
      case 'rightLeg':
        this.targetCenter.set(-2, -12, 0);
        this.targetDistance = 22;
        break;
      case 'leftLeg':
        this.targetCenter.set(2, -12, 0);
        this.targetDistance = 22;
        break;
    }
  }

  public getFocusedPart(): BodyPartName | 'all' {
    return this.focusedPart;
  }

  public setOverlayVisibility(visible: boolean): void {
    this.isOverlayVisible = visible;
    this.headOverlayMesh.visible = visible;
    this.torsoOverlayMesh.visible = visible;
    this.rightArmOverlayMesh.visible = visible;
    this.leftArmOverlayMesh.visible = visible;
    this.rightLegOverlayMesh.visible = visible;
    this.leftLegOverlayMesh.visible = visible;
  }

  public setPose(pose: PoseName): void {
    this.currentPose = pose;
    this.applyPose(pose);
  }

  public resetView(): void {
    this.targetRotX = 0.2;
    this.targetRotY = -0.4;
    this.targetDistance = this.focusedPart === 'all' ? this.fullBodyDistance() : 22;
  }

  public setAnimationEnabled(enabled: boolean): void {
    this.isAnimating = enabled;
  }

  public getSnapshotDataUrl(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  public resize(): void {
    if (!this.container) return;
    const width = this.container.clientWidth || 300;
    const height = this.container.clientHeight || 400;
    const fitted = this.focusedPart === 'all' && Math.abs(this.targetDistance - this.fullBodyDistance()) < 0.5;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    // Keep the whole body framed when the panel changes shape, unless the user zoomed.
    if (fitted || this.targetDistance === 42) this.targetDistance = this.fullBodyDistance();
  }

  /** Camera distance that frames the whole character (about 38 x 22 units) in the current viewport. */
  private fullBodyDistance(): number {
    const half = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const byHeight = 19 / Math.tan(half);
    const byWidth = 11 / (Math.tan(half) * Math.max(this.camera.aspect, 0.1));
    return Math.min(85, Math.max(byHeight, byWidth));
  }

  // =========================================================================
  // POSES IMPLEMENTATION
  // =========================================================================

  private applyPose(pose: PoseName): void {
    this.headGroup.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.set(0, 0, 0);
    this.rightArmGroup.rotation.set(0, 0, 0);
    this.leftArmGroup.rotation.set(0, 0, 0);
    this.rightLegGroup.rotation.set(0, 0, 0);
    this.leftLegGroup.rotation.set(0, 0, 0);
    this.characterGroup.rotation.set(0, 0, 0);

    switch (pose) {
      case 'stand':
        this.rightArmGroup.rotation.x = 0.05;
        this.leftArmGroup.rotation.x = -0.05;
        break;
      case 'walk':
        this.headGroup.rotation.y = 0.1;
        this.rightArmGroup.rotation.x = -0.55;
        this.leftArmGroup.rotation.x = 0.55;
        this.rightLegGroup.rotation.x = 0.55;
        this.leftLegGroup.rotation.x = -0.55;
        break;
      case 'run':
        this.characterGroup.rotation.x = 0.2;
        this.rightArmGroup.rotation.x = -1.1;
        this.leftArmGroup.rotation.x = 1.1;
        this.rightLegGroup.rotation.x = 1.1;
        this.leftLegGroup.rotation.x = -1.1;
        break;
      case 'hero':
        this.headGroup.rotation.x = -0.15;
        this.headGroup.rotation.y = -0.2;
        this.rightArmGroup.rotation.x = -1.8;
        this.rightArmGroup.rotation.z = -0.3;
        this.leftArmGroup.rotation.x = -0.4;
        this.leftArmGroup.rotation.z = 0.4;
        this.rightLegGroup.rotation.x = -0.25;
        this.leftLegGroup.rotation.x = 0.25;
        break;
      case 'tpose':
        // Perfect T-pose for painting inner arms & flanks cleanly!
        this.rightArmGroup.rotation.z = 1.57;
        this.leftArmGroup.rotation.z = -1.57;
        break;
      case 'dance':
        this.headGroup.rotation.z = 0.2;
        this.rightArmGroup.rotation.z = 2.4;
        this.leftArmGroup.rotation.z = -2.4;
        this.rightLegGroup.rotation.z = -0.3;
        this.leftLegGroup.rotation.z = 0.3;
        break;
    }
  }

  // =========================================================================
  // ANIMATION LOOP & CAMERA
  // =========================================================================

  private updateCameraPosition(): void {
    const phi = THREE.MathUtils.clamp(this.rotX, -Math.PI / 2.2, Math.PI / 2.2);
    const theta = this.rotY;

    this.camera.position.x = this.currentCenter.x + this.distance * Math.sin(theta) * Math.cos(phi);
    this.camera.position.y = this.currentCenter.y + this.distance * Math.sin(phi);
    this.camera.position.z = this.currentCenter.z + this.distance * Math.cos(theta) * Math.cos(phi);
    this.camera.lookAt(this.currentCenter);
  }

  private animate = () => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.animate);

    // Smooth camera inertia & center glide
    this.rotX += (this.targetRotX - this.rotX) * 0.12;
    this.rotY += (this.targetRotY - this.rotY) * 0.12;
    this.distance += (this.targetDistance - this.distance) * 0.12;
    this.currentCenter.lerp(this.targetCenter, 0.12);

    this.updateCameraPosition();

    // Subtle idle animation only in stand/walk and when not dragging
    if (this.isAnimating && !this.isInteracting && !this.isPainting && this.focusedPart === 'all') {
      this.animTime += 0.025;
      if (this.currentPose === 'stand') {
        const breath = Math.sin(this.animTime) * 0.03;
        this.headGroup.position.y = 12 + breath * 4;
        this.rightArmGroup.rotation.z = -breath * 0.8;
        this.leftArmGroup.rotation.z = breath * 0.8;
      } else if (this.currentPose === 'walk') {
        const swing = Math.sin(this.animTime * 2.5) * 0.6;
        this.rightArmGroup.rotation.x = -swing;
        this.leftArmGroup.rotation.x = swing;
        this.rightLegGroup.rotation.x = swing;
        this.leftLegGroup.rotation.x = -swing;
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  // =========================================================================
  // INTERACTION LISTENERS (ORBIT & 3D PAINTING)
  // =========================================================================

  private setupListeners(): void {
    const el = this.renderer.domElement;

    // Automatic resize tracking for responsive full-screen
    if (typeof ResizeObserver !== 'undefined' && this.container) {
      this.resizeObserver = new ResizeObserver(() => {
        this.resize();
      });
      this.resizeObserver.observe(this.container);
    }

    // Prevent context menu
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    // Mouse Down
    el.addEventListener('mousedown', (e: MouseEvent) => {
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;

      const isRightClick = e.button === 2;
      const isMiddleClick = e.button === 1;
      const hasModifier = e.shiftKey || e.altKey;

      if (isRightClick || isMiddleClick || hasModifier || this.interactionMode === 'orbit') {
        // Orbit camera
        this.isInteracting = true;
        this.renderer.domElement.style.cursor = 'grabbing';
        return;
      }

      // In Paint mode: check if click hit the 3D model
      const hit = this.raycastAt(e.clientX, e.clientY);
      if (hit) {
        this.isPainting = true;
        this.lastPaintedPixel = hit.pixel;
        this.renderer.domElement.style.cursor = 'crosshair';
        if (this.on3DPaintStart) {
          this.on3DPaintStart(hit.pixel, e);
        }
      } else {
        // Clicked outside model in empty space: orbit camera
        this.isInteracting = true;
        this.renderer.domElement.style.cursor = 'grabbing';
      }
    });

    // Window Mouse Move
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.isPainting) {
        const hit = this.raycastAt(e.clientX, e.clientY);
        if (hit) {
          if (!this.lastPaintedPixel || this.lastPaintedPixel.x !== hit.pixel.x || this.lastPaintedPixel.y !== hit.pixel.y) {
            this.lastPaintedPixel = hit.pixel;
            if (this.on3DPaintMove) {
              this.on3DPaintMove(hit.pixel, e);
            }
          }
          if (this.on3DHover) this.on3DHover(hit);
        }
        return;
      }

      if (this.isInteracting) {
        const dx = e.clientX - this.prevMouseX;
        const dy = e.clientY - this.prevMouseY;
        this.prevMouseX = e.clientX;
        this.prevMouseY = e.clientY;

        this.targetRotY -= dx * 0.012;
        this.targetRotX += dy * 0.012;
        return;
      }

      // Hover inspection
      const hit = this.raycastAt(e.clientX, e.clientY);
      if (this.on3DHover) {
        this.on3DHover(hit);
      }
    }, { signal: this.listeners.signal });

    // Window Mouse Up
    window.addEventListener('mouseup', () => {
      if (this.isPainting) {
        this.isPainting = false;
        this.lastPaintedPixel = null;
        if (this.on3DPaintEnd) {
          this.on3DPaintEnd();
        }
      }
      this.isInteracting = false;
      this.renderer.domElement.style.cursor = this.interactionMode === 'paint' ? 'crosshair' : 'grab';
    }, { signal: this.listeners.signal });

    // Mouse Wheel (Zoom)
    el.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const minDistance = this.focusedPart === 'all' ? 16 : 8;
      const maxDistance = this.focusedPart === 'all' ? 85 : 45;
      this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + e.deltaY * 0.04, minDistance, maxDistance);
    }, { passive: false });

    // Touch Listeners (Mobile 3D Painting & Orbit)
    el.addEventListener('touchstart', (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        this.prevMouseX = touch.clientX;
        this.prevMouseY = touch.clientY;

        if (this.interactionMode === 'paint') {
          const hit = this.raycastAt(touch.clientX, touch.clientY);
          if (hit) {
            this.isPainting = true;
            this.lastPaintedPixel = hit.pixel;
            if (this.on3DPaintStart) {
              this.on3DPaintStart(hit.pixel, touch);
            }
            return;
          }
        }
        this.isInteracting = true;
      } else if (e.touches.length === 2) {
        this.isPainting = false;
        this.isInteracting = true;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.prevTouchDist = Math.hypot(dx, dy);
      }
    }, { passive: true });

    el.addEventListener('touchmove', (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        if (this.isPainting) {
          const hit = this.raycastAt(touch.clientX, touch.clientY);
          if (hit) {
            if (!this.lastPaintedPixel || this.lastPaintedPixel.x !== hit.pixel.x || this.lastPaintedPixel.y !== hit.pixel.y) {
              this.lastPaintedPixel = hit.pixel;
              if (this.on3DPaintMove) {
                this.on3DPaintMove(hit.pixel, touch);
              }
            }
          }
          return;
        }

        if (this.isInteracting) {
          const dx = touch.clientX - this.prevMouseX;
          const dy = touch.clientY - this.prevMouseY;
          this.prevMouseX = touch.clientX;
          this.prevMouseY = touch.clientY;

          this.targetRotY -= dx * 0.015;
          this.targetRotX += dy * 0.015;
        }
      } else if (e.touches.length === 2 && this.isInteracting) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const delta = this.prevTouchDist - dist;
        this.prevTouchDist = dist;

        const minDistance = this.focusedPart === 'all' ? 16 : 8;
        const maxDistance = this.focusedPart === 'all' ? 85 : 45;
        this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + delta * 0.15, minDistance, maxDistance);
      }
    }, { passive: true });

    el.addEventListener('touchend', () => {
      if (this.isPainting) {
        this.isPainting = false;
        this.lastPaintedPixel = null;
        if (this.on3DPaintEnd) {
          this.on3DPaintEnd();
        }
      }
      this.isInteracting = false;
    }, { passive: true });
  }

  public dispose(): void {
    this.disposed = true;
    this.listeners.abort();
    cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    this.skinTexture.dispose();
    this.baseMaterial.dispose();
    this.overlayMaterial.dispose();
    this.renderer.dispose();
  }
}
