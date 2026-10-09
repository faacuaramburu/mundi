import { setTranslatedAria, setTranslatedText } from './i18n.js';
import {
  AmbientLight, BackSide, CanvasTexture, Color, DirectionalLight, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Quaternion, Scene,
  SphereGeometry, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Atlas, Country } from '../shared/countries.js';

function position([longitude, latitude]: [number, number]): Vector3 {
  const lon = longitude * Math.PI / 180;
  const lat = latitude * Math.PI / 180;
  return new Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
}

export class Globe {
  private atlas: Atlas;
  private map = document.createElement('canvas');
  private context: CanvasRenderingContext2D;
  private colors = new Map<string, string>();
  private paths = new Map<string, Path2D>();
  private backgroundPaths: Path2D[];
  private renderer: WebGLRenderer | null = null;
  private scene = new Scene();
  private camera = new PerspectiveCamera(38, 1, 0.1, 20);
  private controls: OrbitControls | null = null;
  private texture: CanvasTexture;
  private markers = new Map<string, Mesh<SphereGeometry, MeshBasicMaterial>>();
  private resizeObserver: ResizeObserver;
  private frame = 0;
  private restoreQualityAt = 0;
  private dirty = true;
  private destination: Vector3 | null = null;
  private host: HTMLElement;
  private minimumDistance = 1.25;
  private fittedDistance = 3.2;
  private defaultView = position([-55, 15]).multiplyScalar(3.35);

  constructor(host: HTMLElement, atlas: Atlas) {
    this.host = host;
    this.atlas = atlas;
    this.map.width = atlas.width;
    this.map.height = atlas.height;
    const context = this.map.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    this.context = context;
    for (const country of atlas.countries) this.paths.set(country.id, new Path2D(country.path));
    this.backgroundPaths = atlas.context.map((item) => new Path2D(item.path));
    this.drawMap();
    this.texture = new CanvasTexture(this.map);
    this.texture.colorSpace = SRGBColorSpace;

    try {
      this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setTranslatedAria(this.map, 'map');
      this.host.replaceChildren(this.map);
      const help = document.querySelector('#globe-help');
      if (help) setTranslatedText(help, 'fallback');
    }

    if (this.renderer) {
      const renderer = this.renderer;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.className = 'globe-canvas';
      setTranslatedAria(renderer.domElement, 'globeControls');
      renderer.domElement.tabIndex = 0;
      renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
      this.host.replaceChildren(renderer.domElement);
      this.camera.position.copy(this.defaultView);
      this.controls = new OrbitControls(this.camera, renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.enablePan = false;
      this.controls.minDistance = this.minimumDistance;
      this.controls.maxDistance = 5;
      this.controls.rotateSpeed = .65;
      this.controls.addEventListener('start', this.stopFocus);
      this.controls.addEventListener('end', this.finishInteraction);
      this.scene.add(new Mesh(
        new SphereGeometry(1, 80, 64),
        new MeshStandardMaterial({ map: this.texture, roughness: 1, metalness: 0 }),
      ));
      this.scene.add(new AmbientLight(0xffffff, 2.4));
      const sunlight = new DirectionalLight(0xfffae9, 2.2);
      sunlight.position.set(-2, 4, 4);
      this.scene.add(sunlight);
      this.scene.add(new Mesh(new SphereGeometry(1.012, 64, 48), new MeshBasicMaterial({
        color: '#7daba8', transparent: true, opacity: .13, side: BackSide,
      })));
      const tiny = new Set(['VAT', 'MCO', 'SMR', 'LIE', 'AND', 'MLT', 'SGP', 'BHR', 'NRU', 'TUV', 'MDV']);
      for (const country of atlas.countries) {
        if (!tiny.has(country.id)) continue;
        const marker = new Mesh(new SphereGeometry(.0055, 10, 8), new MeshBasicMaterial({ color: '#a8b898' }));
        marker.position.copy(position(country.focus).multiplyScalar(1.004));
        this.markers.set(country.id, marker);
        this.scene.add(marker);
      }
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.animate();
  }

  private stopFocus = (): void => {
    this.destination = null;
    this.restoreQualityAt = 0;
    this.setPixelRatio(1);
  };

  private finishInteraction = (): void => {
    this.restoreQualityAt = performance.now() + 250;
  };

  private setPixelRatio(ratio: number): void {
    if (!this.renderer || this.renderer.getPixelRatio() === ratio) return;
    this.renderer.setPixelRatio(ratio);
    this.dirty = true;
  }

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.disposeRenderer();
    this.host.replaceChildren(this.map);
    const help = document.querySelector('#globe-help');
    if (help) setTranslatedText(help, 'lost');
  };

  private drawMap(): void {
    const ctx = this.context;
    ctx.fillStyle = '#174f7b';
    ctx.fillRect(0, 0, this.map.width, this.map.height);
    ctx.lineWidth = .5;
    ctx.strokeStyle = '#d1d8c5';
    for (const path of this.backgroundPaths) {
      ctx.fillStyle = '#82947a';
      ctx.fill(path);
      ctx.stroke(path);
    }
    for (const country of this.atlas.countries) {
      const path = this.paths.get(country.id)!;
      ctx.fillStyle = this.colors.get(country.id) ?? '#9eae8b';
      ctx.fill(path);
      ctx.stroke(path);
    }
  }

  private resize(): void {
    if (!this.renderer) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    // Fit the globe's width on tall, narrow columns as well as its height.
    this.camera.fov = 2 * Math.atan(Math.tan(19 * Math.PI / 180) / Math.min(1, this.camera.aspect)) * 180 / Math.PI;
    const verticalHalfAngle = this.camera.fov * Math.PI / 360;
    const horizontalHalfAngle = Math.atan(Math.tan(verticalHalfAngle) * this.camera.aspect);
    // Include the atmosphere and a margin within both edges of the canvas.
    this.fittedDistance = 1.012 * 1.03 / Math.sin(Math.min(verticalHalfAngle, horizontalHalfAngle));
    if (this.controls) {
      this.controls.minDistance = this.minimumDistance;
      this.controls.maxDistance = Math.max(5, this.fittedDistance * 1.5);
    }
    this.defaultView.setLength(Math.max(3.35, this.fittedDistance));
    if (this.camera.position.length() < this.minimumDistance) this.camera.position.setLength(this.minimumDistance);
    if (this.destination && this.destination.length() < this.minimumDistance) this.destination.setLength(this.minimumDistance);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.dirty = true;
  }

  private animate = (): void => {
    if (this.renderer) {
      if (this.restoreQualityAt && performance.now() >= this.restoreQualityAt) {
        this.restoreQualityAt = 0;
        this.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      }
      if (this.destination) {
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reducedMotion || this.camera.position.distanceTo(this.destination) < .015) {
          this.camera.position.copy(this.destination);
          this.destination = null;
        } else {
          const rotation = new Quaternion().setFromUnitVectors(
            this.camera.position.clone().normalize(), this.destination.clone().normalize(),
          );
          this.camera.position.applyQuaternion(new Quaternion().slerp(rotation, .1));
          this.camera.position.setLength(this.camera.position.length() + (this.destination.length() - this.camera.position.length()) * .1);
        }
        this.dirty = true;
      }
      if (this.controls?.update() || this.dirty) {
        this.renderer.render(this.scene, this.camera);
        this.dirty = false;
      }
    }
    if (this.renderer) this.frame = requestAnimationFrame(this.animate);
  };

  paint(country: Country, color: string): void {
    this.colors.set(country.id, color);
    const marker = this.markers.get(country.id);
    if (marker) marker.material.color = new Color(color);
    this.drawMap();
    this.texture.needsUpdate = true;
    this.focusCountry(country);
    this.dirty = true;
  }

  focusCountry(country: Country): void {
    this.destination = position(country.focus).multiplyScalar(this.fittedDistance);
    this.dirty = true;
  }

  showCollection(ids: ReadonlySet<string>): void {
    this.colors.clear();
    for (const country of this.atlas.countries) {
      const color = ids.has(country.id) ? '#419b72' : '#667273';
      this.colors.set(country.id, color);
      this.markers.get(country.id)?.material.color.set(color);
    }
    this.drawMap(); this.texture.needsUpdate = true; this.resetView();
  }

  clear(): void {
    this.colors.clear();
    for (const marker of this.markers.values()) marker.material.color.set('#a8b898');
    this.drawMap();
    this.texture.needsUpdate = true;
    this.resetView();
  }

  resetView(): void {
    this.destination = null;
    this.camera.position.copy(this.defaultView);
    this.controls?.update();
    this.dirty = true;
  }

  private disposeRenderer(): void {
    this.controls?.removeEventListener('start', this.stopFocus);
    this.controls?.removeEventListener('end', this.finishInteraction);
    this.controls?.dispose();
    this.renderer?.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer?.dispose();
    this.renderer = null;
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.disposeRenderer();
    this.texture.dispose();
    this.scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      }
    });
  }
}
