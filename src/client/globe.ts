import { countryName, setTranslatedAria, setTranslatedText } from './i18n.js';
import {
  AmbientLight, Color, DirectionalLight, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, MeshLambertMaterial, PerspectiveCamera, Raycaster, Scene,
  Sphere, SphereGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { Atlas, Country } from '../shared/countries.js';
import { GlobeFlight } from './globe-flight.js';
import { prefersReducedMotion } from './motion.js';
import { atlasBorders, GlobeSurface } from './globe-surface.js';
import { regionView, wrapMapX } from './region-view.js';

let mapNumber = 0;

const tinyCountries = new Set([
  'VAT', 'MCO', 'SMR', 'LIE', 'AND', 'MLT', 'SGP', 'BHR',
  'ATG', 'BRB', 'DMA', 'GRD', 'KNA', 'LCA', 'VCT', 'BHS',
  'CPV', 'COM', 'MUS', 'SYC', 'STP', 'MDV', 'NRU', 'TUV',
  'KIR', 'MHL', 'FSM', 'PLW', 'WSM', 'TON',
]);

function position([longitude, latitude]: [number, number]): Vector3 {
  const lon = longitude * Math.PI / 180;
  const lat = latitude * Math.PI / 180;
  return new Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
}

export class Globe {
  private atlas: Atlas;
  private map = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private mapShapes = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  private mapCountries = new Map<string, SVGPathElement>();
  private mapMarkers = new Map<string, SVGCircleElement>();
  private context: CanvasRenderingContext2D;
  private colors = new Map<string, string>();
  private paths = new Map<string, Path2D>();
  private renderer: WebGLRenderer | null = null;
  private scene = new Scene();
  private camera = new PerspectiveCamera(38, 1, 0.1, 20);
  private controls: OrbitControls | null = null;
  private land: GlobeSurface | null = null;
  private markers = new Map<string, { position: Vector3; index: number }>();
  private markerLayer: InstancedMesh<SphereGeometry, MeshBasicMaterial> | null = null;
  private resizeObserver: ResizeObserver;
  private frame = 0;
  private dirty = true;
  private flight: GlobeFlight | null = null;
  private host: HTMLElement;
  private label = document.createElement('div');
  private labeledCountry: Country | null = null;
  private labelPosition = new Vector3();
  private labelExpiresAt = 0;
  private labelWidth = 0;
  private labelHeight = 0;
  private flat = false;
  private viewListeners = new Set<() => void>();
  private hoveredCountry: Country | null = null;
  private pointer = new Vector2();
  private pointerInside = false;
  private hoverDirty = false;
  private hoverAfter = 0;
  private collectionMode = false;
  private raycaster = new Raycaster();
  private surface = new Sphere(new Vector3(), 1);
  private flatViewport = document.createElement('div');
  private flatZoom = 1;
  private flatPan = new Vector2();
  private flatPointers = new Map<number, Vector2>();
  private collectedIds = new Set<string>();
  private minimumDistance = 1.25;
  private fittedDistance = 3.2;
  private defaultView = position([-55, 15]).multiplyScalar(3.35);

  constructor(host: HTMLElement, atlas: Atlas) {
    this.host = host;
    this.atlas = atlas;
    this.map.setAttribute('viewBox', `0 0 ${atlas.width} ${atlas.height}`);
    this.map.setAttribute('role', 'img');
    this.map.setAttribute('class', 'flat-map');
    this.map.setAttribute('tabindex', '0');
    this.map.setAttribute('stroke-width', '.5');
    this.map.style.background = '#174f7b';
    this.mapShapes.id = `mundi-map-${++mapNumber}`;
    this.map.append(this.mapShapes);
    // Adjacent copies keep Pacific islands together when the view crosses the date line.
    for (const offset of [-atlas.width, atlas.width]) {
      const copy = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      copy.setAttribute('href', `#${this.mapShapes.id}`);
      copy.setAttribute('transform', `translate(${offset} 0)`);
      this.map.append(copy);
    }
    for (const item of [...atlas.context, ...atlas.countries]) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', item.path);
      path.setAttribute('fill', 'id' in item ? '#667273' : '#515b65');
      path.setAttribute('stroke', '#b2bac2');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      this.mapShapes.append(path);
      if ('id' in item && typeof item.id === 'string') this.mapCountries.set(item.id, path);
    }
    const context = document.createElement('canvas').getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    this.context = context;
    for (const country of atlas.countries) this.paths.set(country.id, new Path2D(country.path));
    this.drawMap();
    try {
      this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      this.flat = true;
      setTranslatedAria(this.map, 'map');
      this.flatViewport.append(this.map);
      this.host.replaceChildren(this.flatViewport);
      const help = document.querySelector('#globe-help');
      if (help) setTranslatedText(help, 'fallback');
    }

    if (this.renderer) {
      const renderer = this.renderer;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.className = 'globe-canvas';
      setTranslatedAria(renderer.domElement, 'globeControls');
      renderer.domElement.tabIndex = 0;
      renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
      renderer.domElement.addEventListener('pointerdown', this.markPointerFocus);
      renderer.domElement.addEventListener('blur', this.clearPointerFocus);
      renderer.domElement.addEventListener('pointerdown', this.centerRotation);
      renderer.domElement.addEventListener('pointermove', this.onPointerMove);
      renderer.domElement.addEventListener('pointerleave', this.onPointerLeave);
      renderer.domElement.addEventListener('keydown', this.onKeyDown);
      this.host.replaceChildren(renderer.domElement);
      this.camera.position.copy(this.defaultView);
      this.controls = new OrbitControls(this.camera, renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.enablePan = false;
      this.controls.zoomToCursor = true;
      this.controls.minDistance = this.minimumDistance;
      this.controls.maxDistance = 5;
      this.controls.rotateSpeed = .65;
      this.controls.addEventListener('start', this.stopFocus);
      this.controls.addEventListener('change', this.onCameraChange);
      this.scene.add(new Mesh(
        new SphereGeometry(1, 128, 96),
        new MeshLambertMaterial({ color: '#174f7b' }),
      ));
      this.land = new GlobeSurface(atlas);
      this.scene.add(new Mesh(this.land.geometry, new MeshLambertMaterial({ vertexColors: true })));
      const borders = new LineSegmentsGeometry();
      borders.setPositions(atlasBorders(atlas));
      this.scene.add(new LineSegments2(borders, new LineMaterial({
        color: '#b2bac2', linewidth: .65 * renderer.getPixelRatio(), alphaToCoverage: true,
      })));
      this.scene.add(new AmbientLight(0xffffff, 2.4));
      const sunlight = new DirectionalLight(0xfffae9, 2.2);
      sunlight.position.set(-2, 4, 4);
      this.scene.add(sunlight);
      const smallCountries = atlas.countries.filter(country => tinyCountries.has(country.id));
      this.markerLayer = new InstancedMesh(new SphereGeometry(.004, 10, 8), new MeshBasicMaterial(), smallCountries.length);
      for (const [index, country] of smallCountries.entries()) {
        const anchor = position(country.focus).multiplyScalar(1.004);
        this.markers.set(country.id, { position: anchor, index });
        this.markerLayer.setMatrixAt(index, new Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z));
        this.markerLayer.setColorAt(index, new Color('#667273'));
      }
      this.scene.add(this.markerLayer);
      this.drawMap();
    }

    for (const country of atlas.countries) {
      if (!tinyCountries.has(country.id)) continue;
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      marker.setAttribute('cx', String((country.focus[0] + 180) / 360 * atlas.width));
      marker.setAttribute('cy', String((90 - country.focus[1]) / 180 * atlas.height));
      marker.setAttribute('r', '2');
      marker.setAttribute('fill', '#667273');
      marker.setAttribute('stroke', 'none');
      this.mapShapes.append(marker);
      // Markers share their country's color without enlarging its geographic shape.
      this.mapMarkers.set(country.id, marker);
    }

    this.label.className = 'country-label';
    this.label.hidden = true;
    this.host.append(this.label);
    this.flatViewport.className = 'flat-map-viewport';
    this.flatViewport.addEventListener('wheel', this.onFlatWheel, { passive: false });
    this.flatViewport.addEventListener('pointerdown', this.onFlatPointerDown);
    this.flatViewport.addEventListener('pointermove', this.onFlatPointerMove);
    this.flatViewport.addEventListener('pointerup', this.onFlatPointerUp);
    this.flatViewport.addEventListener('pointercancel', this.onFlatPointerUp);
    this.map.addEventListener('pointermove', this.onPointerMove);
    this.map.addEventListener('pointerleave', this.onPointerLeave);
    this.map.addEventListener('pointerdown', this.markPointerFocus);
    this.map.addEventListener('blur', this.clearPointerFocus);
    this.map.addEventListener('keydown', this.onKeyDown);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.animate();
  }

  private stopFocus = (): void => { this.flight = null; };
  private markPointerFocus = (event: PointerEvent): void => {
    (event.currentTarget as Element).setAttribute('data-pointer-focus', '');
  };
  private clearPointerFocus = (event: Event): void => {
    (event.currentTarget as Element).removeAttribute('data-pointer-focus');
  };
  private onKeyDown = (event: KeyboardEvent): void => {
    this.clearPointerFocus(event);
    if (!['+', '=', '-', '_'].includes(event.key)) return;
    event.preventDefault();
    this.stopFocus();
    const factor = event.key === '+' || event.key === '=' ? .9 : 1 / .9;
    if (this.flat) {
      const rect = this.host.getBoundingClientRect();
      this.zoomFlatMap(1 / factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
      return;
    }
    if (!this.controls) return;
    this.camera.position.setLength(Math.max(this.minimumDistance,
      Math.min(this.controls.maxDistance, this.camera.position.length() * factor)));
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.onCameraChange();
  };
  private onCameraChange = (): void => {
    if (this.controls) {
      // Match rotation to altitude: a close view needs much smaller turns.
      const altitudeRatio = (this.camera.position.length() - 1) / (this.defaultView.length() - 1);
      this.controls.rotateSpeed = .65 * Math.max(.12, Math.min(1, altitudeRatio));
    }
    this.dirty = true;
    this.hoverDirty = this.pointerInside;
    this.hoverAfter = performance.now() + 120;
  };

  private centerRotation = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.controls) return;
    this.controls.target.set(0, 0, 0);
    this.camera.lookAt(0, 0, 0);
    this.dirty = true;
  };

  private onPointerMove = (event: MouseEvent): void => {
    const canvas = this.flat ? this.map : this.renderer?.domElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (this.flat && (event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom)) {
      this.onPointerLeave();
      return;
    }
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2);
    this.pointerInside = true;
    this.hoverDirty = true;
  };

  private onPointerLeave = (): void => {
    this.pointerInside = false;
    this.hoveredCountry = null;
  };

  private onFlatWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.host.clientHeight : 1);
    this.zoomFlatMap(Math.exp(-delta * .0015), event.clientX, event.clientY);
    this.onPointerMove(event);
  };

  private zoomFlatMap(factor: number, clientX: number, clientY: number): void {
    const previous = this.flatZoom;
    this.flatZoom = Math.max(1, Math.min(8, previous * factor));
    const rect = this.host.getBoundingClientRect();
    const x = clientX - rect.left - rect.width / 2;
    const y = clientY - rect.top - rect.height / 2;
    this.flatPan.x = x - (x - this.flatPan.x) * this.flatZoom / previous;
    this.flatPan.y = y - (y - this.flatPan.y) * this.flatZoom / previous;
    this.layoutFlatMap();
  }

  private onFlatPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.flatViewport.setPointerCapture(event.pointerId);
    this.flatPointers.set(event.pointerId, new Vector2(event.clientX, event.clientY));
    this.hoveredCountry = null;
  };

  private onFlatPointerMove = (event: PointerEvent): void => {
    const previous = this.flatPointers.get(event.pointerId);
    if (!previous) { this.onPointerMove(event); return; }
    const points = [...this.flatPointers.values()];
    const oldDistance = points.length === 2 ? points[0]!.distanceTo(points[1]!) : 0;
    const oldCenter = points.length === 2 ? points[0]!.clone().add(points[1]!).multiplyScalar(.5) : null;
    if (this.flatPointers.size === 1) {
      this.flatPan.x += event.clientX - previous.x;
      this.flatPan.y += event.clientY - previous.y;
    }
    previous.set(event.clientX, event.clientY);
    if (this.flatPointers.size === 2) {
      const distance = points[0]!.distanceTo(points[1]!);
      const center = points[0]!.clone().add(points[1]!).multiplyScalar(.5);
      this.flatPan.add(center.clone().sub(oldCenter!));
      if (oldDistance > 0) this.zoomFlatMap(distance / oldDistance, center.x, center.y);
    }
    this.layoutFlatMap();
  };

  private onFlatPointerUp = (event: PointerEvent): void => {
    this.flatPointers.delete(event.pointerId);
    this.onPointerMove(event);
  };

  private layoutFlatMap(): void {
    // The host already excludes the toolbar; use its full space on small screens.
    const width = Math.max(1, Math.min(this.host.clientWidth, Math.max(1, this.host.clientHeight) * this.atlas.width / this.atlas.height));
    const height = width * this.atlas.height / this.atlas.width;
    this.flatPan.x = this.flatZoom === 1 ? 0 : wrapMapX(this.flatPan.x, width * this.flatZoom, 0);
    this.flatPan.y = Math.max(-height * (this.flatZoom - 1) / 2, Math.min(height * (this.flatZoom - 1) / 2, this.flatPan.y));
    this.map.style.width = `${width}px`;
    this.map.style.height = `${height}px`;
    this.map.style.transform = 'translate(-50%, -50%)';
    // Zoom the visible geography inside a fixed SVG frame, including its ocean.
    const viewWidth = this.atlas.width / this.flatZoom;
    const viewHeight = this.atlas.height / this.flatZoom;
    const left = (this.atlas.width - viewWidth) / 2 - this.flatPan.x / width * viewWidth;
    const top = (this.atlas.height - viewHeight) / 2 - this.flatPan.y / height * viewHeight;
    this.map.setAttribute('viewBox', `${left} ${top} ${viewWidth} ${viewHeight}`);
    this.hoverDirty = this.pointerInside;
    this.labelWidth = 0;
  }

  private countryAt(longitude: number, latitude: number): Country | null {
    const x = wrapMapX((longitude + 180) / 360 * this.atlas.width, this.atlas.width);
    const y = (90 - latitude) / 180 * this.atlas.height;
    return this.atlas.countries.find(country => (this.collectionMode ? this.collectedIds.has(country.id) : this.colors.has(country.id))
      && this.context.isPointInPath(this.paths.get(country.id)!, x, y)) ?? null;
  }

  private updateHover(): void {
    this.hoverDirty = false;
    this.hoveredCountry = null;
    if (!this.pointerInside) return;
    if (this.flatPointers.size) return;
    if (this.flat) {
      const view = this.map.viewBox.baseVal;
      const mapX = view.x + (this.pointer.x + 1) / 2 * view.width;
      const mapY = view.y + (1 - this.pointer.y) / 2 * view.height;
      const countryUnderPointer = this.countryAt(mapX / this.atlas.width * 360 - 180,
        90 - mapY / this.atlas.height * 180);
      if (countryUnderPointer) this.hoveredCountry = countryUnderPointer;
      if (this.hoveredCountry) return;
      const rect = this.map.getBoundingClientRect();
      for (const country of this.atlas.countries) {
        if (!(this.collectionMode ? this.collectedIds.has(country.id) : this.colors.has(country.id)) || !this.mapMarkers.has(country.id)) continue;
        const mapX = wrapMapX((country.focus[0] + 180) / 360 * this.atlas.width, this.atlas.width, view.x + view.width / 2);
        const x = (mapX - view.x) / view.width * 2 - 1;
        const y = 1 - ((90 - country.focus[1]) / 180 * this.atlas.height - view.y) / view.height * 2;
        if (Math.hypot((x - this.pointer.x) * rect.width / 2,
          (y - this.pointer.y) * rect.height / 2) <= 8) {
          this.hoveredCountry = country;
          break;
        }
      }
    } else {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const point = this.raycaster.ray.intersectSphere(this.surface, new Vector3());
      if (point) {
        const country = this.countryAt(Math.atan2(-point.z, point.x) * 180 / Math.PI,
          Math.asin(point.y) * 180 / Math.PI);
        if (country && (this.collectionMode ? this.collectedIds.has(country.id) : this.colors.has(country.id))) this.hoveredCountry = country;
      }
      if (this.hoveredCountry) return;
      for (const country of this.atlas.countries) {
        const marker = this.markers.get(country.id);
        if (!marker || !(this.collectionMode ? this.collectedIds.has(country.id) : this.colors.has(country.id))
          || marker.position.dot(this.camera.position) <= marker.position.lengthSq()) continue;
        const projected = marker.position.clone().project(this.camera);
        if (Math.hypot((projected.x - this.pointer.x) * this.host.clientWidth / 2,
          (projected.y - this.pointer.y) * this.host.clientHeight / 2) <= 8) {
          this.hoveredCountry = country;
          break;
        }
      }
    }
  }

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.disposeRenderer();
    this.flat = true;
    this.onPointerLeave();
    setTranslatedAria(this.map, 'map');
    this.flatViewport.append(this.map);
    this.host.replaceChildren(this.flatViewport, this.label);
    this.layoutFlatMap();
    const help = document.querySelector('#globe-help');
    if (help) setTranslatedText(help, 'lost');
    for (const listener of this.viewListeners) listener();
  };

  private drawMap(): void {
    for (const country of this.atlas.countries) {
      const color = this.colors.get(country.id) ?? '#667273';
      this.mapCountries.get(country.id)?.setAttribute('fill', color);
      this.mapMarkers.get(country.id)?.setAttribute('fill', color);
    }
  }

  private resize(): void {
    if (!this.renderer) {
      if (this.flat) this.layoutFlatMap();
      return;
    }
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.labelWidth = 0;
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
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.flat) this.layoutFlatMap();
    this.onCameraChange();
  }

  private animate = (now = performance.now()): void => {
    if (this.renderer && !this.flat) {
      if (this.flight && this.controls) {
        const finished = this.flight.update(this.camera.position, this.controls.target, now);
        this.camera.lookAt(this.controls.target);
        this.onCameraChange();
        if (finished) this.flight = null;
      }
      if ((!this.flight && this.controls?.update()) || this.dirty) {
        this.renderer.render(this.scene, this.camera);
        this.hoverDirty = this.pointerInside;
        this.dirty = false;
      }
    }
    if (this.hoverDirty && performance.now() >= this.hoverAfter) this.updateHover();
    this.updateLabel();
    if (this.renderer || this.flat) this.frame = requestAnimationFrame(this.animate);
  };

  paint(country: Country, color: string): void {
    this.colors.set(country.id, color);
    this.land?.paint(country.id, color);
    const marker = this.markers.get(country.id);
    if (marker && this.markerLayer) {
      this.markerLayer.setColorAt(marker.index, new Color(color));
      this.markerLayer.instanceColor!.needsUpdate = true;
    }
    this.drawMap();
    this.focusCountry(country);
    this.dirty = true;
  }

  private flyTo(coordinates: [number, number], radius = this.camera.position.length()): void {
    if (this.controls && !this.flat) {
      const from = this.camera.position.clone();
      const target = this.controls.target.clone();
      const orientation = this.camera.quaternion.clone();
      // Consume residual drag damping without moving the start of the flight.
      const damping = this.controls.enableDamping;
      this.controls.enableDamping = false;
      this.controls.update();
      this.controls.enableDamping = damping;
      this.camera.position.copy(from);
      this.camera.quaternion.copy(orientation);
      this.controls.target.copy(target);
      this.flight = new GlobeFlight(from, position(coordinates), target, performance.now(),
        prefersReducedMotion(), radius);
    }
  }

  focusRegion(region: string): void {
    const view = regionView(region);
    if (!view) { this.resetView(); return; }
    this.hoveredCountry = null; this.labeledCountry = null; this.label.hidden = true;
    if (this.flat) {
      this.flatZoom = Math.max(1, Math.min(8, 360 / (view.span[0] * 1.08), 180 / (view.span[1] * 1.08)));
      this.layoutFlatMap();
      this.flatPan.set(-view.center[0] / 360 * this.map.clientWidth * this.flatZoom,
        view.center[1] / 180 * this.map.clientHeight * this.flatZoom);
      this.layoutFlatMap();
    } else {
      const vertical = this.camera.fov * Math.PI / 360;
      const halfAngle = Math.min(vertical, Math.atan(Math.tan(vertical) * this.camera.aspect));
      const angle = view.radius * Math.PI / 180;
      const distance = Math.max(this.minimumDistance, (Math.cos(angle) + Math.sin(angle) / Math.tan(halfAngle)) * 1.06);
      this.flyTo(view.center, distance);
    }
    this.dirty = true;
  }

  focusCountry(country: Country): void {
    this.flyTo(country.focus);
    this.labeledCountry = country;
    this.labelPosition.copy(position(country.focus).multiplyScalar(1.016));
    this.labelExpiresAt = performance.now() + 6000;
    if (this.collectionMode) this.labeledCountry = null;
    if (this.flat) {
      this.flatPan.set(-country.focus[0] / 360 * this.map.clientWidth * this.flatZoom,
        country.focus[1] / 180 * this.map.clientHeight * this.flatZoom);
      this.layoutFlatMap();
    }
    this.dirty = true;
  }

  get isFlatMap(): boolean { return this.flat; }
  get hasGlobe(): boolean { return this.renderer !== null; }
  onMapViewChange(listener: () => void): void { this.viewListeners.add(listener); }

  setFlatMap(flat: boolean): void {
    flat = flat || !this.renderer;
    const country = this.labeledCountry;
    this.stopFocus();
    this.flat = flat;
    this.onPointerLeave();
    if (flat) this.labeledCountry = null;
    if (this.renderer) this.renderer.domElement.hidden = flat;
    if (flat) {
      this.map.setAttribute('class', 'flat-map');
      setTranslatedAria(this.map, 'map');
      this.host.append(this.flatViewport);
      this.flatViewport.append(this.map);
      this.layoutFlatMap();
    } else if (this.renderer) {
      this.map.remove();
      this.flatViewport.remove();
    }
    setTranslatedText(document.querySelector('#globe-help')!, flat ? 'mapHelp' : 'help');
    if (country) this.focusCountry(country);
    this.dirty = true;
    this.updateLabel();
    for (const listener of this.viewListeners) listener();
  }

  showCollection(ids: ReadonlySet<string>): void {
    this.collectionMode = true;
    this.collectedIds = new Set(ids);
    this.labeledCountry = null;
    if (this.flat) this.layoutFlatMap();
    this.colors.clear();
    for (const country of this.atlas.countries) {
      const color = ids.has(country.id) ? '#419b72' : '#667273';
      this.colors.set(country.id, color);
      this.land?.paint(country.id, color);
      const marker = this.markers.get(country.id);
      if (marker && this.markerLayer) this.markerLayer.setColorAt(marker.index, new Color(color));
    }
    if (this.markerLayer?.instanceColor) this.markerLayer.instanceColor.needsUpdate = true;
    this.drawMap(); this.dirty = true;
  }

  clear(): void {
    this.colors.clear();
    for (const country of this.atlas.countries) this.land?.paint(country.id, '#667273');
    for (const marker of this.markers.values()) this.markerLayer?.setColorAt(marker.index, new Color('#667273'));
    if (this.markerLayer?.instanceColor) this.markerLayer.instanceColor.needsUpdate = true;
    this.drawMap();
    this.resetView();
  }

  resetView(): void {
    this.stopFocus();
    this.labeledCountry = null;
    this.hoveredCountry = null;
    this.label.hidden = true;
    this.flatZoom = 1;
    this.flatPan.set(0, 0);
    if (this.flat) this.layoutFlatMap();
    this.camera.position.copy(this.defaultView);
    this.controls?.target.set(0, 0, 0);
    this.controls?.update();
    this.onCameraChange();
  }

  private updateLabel(): void {
    if (!this.labeledCountry && !this.hoveredCountry) {
      this.label.hidden = true;
      return;
    }
    if (performance.now() >= this.labelExpiresAt) {
      this.labeledCountry = null;
      if (!this.hoveredCountry) {
        this.label.hidden = true;
        return;
      }
    }
    const country = this.hoveredCountry ?? this.labeledCountry!;
    const anchor = this.hoveredCountry ? position(country.focus).multiplyScalar(1.016) : this.labelPosition;
    const projected = anchor.clone().project(this.camera);
    const visible = !!this.hoveredCountry || this.flat || anchor.dot(this.camera.position) > anchor.lengthSq()
      && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1;
    this.label.hidden = !visible;
    if (!visible) return;
    const name = countryName(country);
    if (this.label.textContent !== name || !this.labelWidth) {
      this.label.textContent = name;
      this.labelWidth = this.label.offsetWidth;
      this.labelHeight = this.label.offsetHeight;
    }
    const halfWidth = this.labelWidth / 2 + 8;
    const mapRect = this.flat ? this.map.getBoundingClientRect() : this.host.getBoundingClientRect();
    const view = this.map.viewBox.baseVal;
    const hostRect = this.host.getBoundingClientRect();
    const x = this.hoveredCountry
      ? mapRect.left - hostRect.left + (this.pointer.x + 1) / 2 * mapRect.width
      : this.flat
      ? mapRect.left - hostRect.left + (wrapMapX((country.focus[0] + 180) / 360 * this.atlas.width,
        this.atlas.width, view.x + view.width / 2) - view.x) / view.width * mapRect.width
      : (projected.x + 1) * this.host.clientWidth / 2;
    const y = this.hoveredCountry
      ? mapRect.top - hostRect.top + (1 - this.pointer.y) / 2 * mapRect.height
      : this.flat
      ? mapRect.top - hostRect.top + ((90 - country.focus[1]) / 180 * this.atlas.height - view.y) / view.height * mapRect.height
      : (1 - projected.y) * this.host.clientHeight / 2;
    const left = Math.max(halfWidth, Math.min(this.host.clientWidth - halfWidth, x));
    const top = Math.max(this.labelHeight + 8, y - 12);
    this.label.style.transform = `translate3d(${left}px, ${top}px, 0) translate(-50%, -100%)`;
  }

  private disposeRenderer(): void {
    this.stopFocus();
    this.controls?.removeEventListener('start', this.stopFocus);
    this.controls?.removeEventListener('change', this.onCameraChange);
    this.controls?.dispose();
    this.renderer?.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer?.domElement.removeEventListener('pointerdown', this.markPointerFocus);
    this.renderer?.domElement.removeEventListener('blur', this.clearPointerFocus);
    this.renderer?.domElement.removeEventListener('pointerdown', this.centerRotation);
    this.renderer?.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer?.domElement.removeEventListener('pointerleave', this.onPointerLeave);
    this.renderer?.domElement.removeEventListener('keydown', this.onKeyDown);
    this.renderer?.dispose();
    this.renderer = null;
  }

  dispose(): void {
    this.viewListeners.clear();
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.disposeRenderer();
    this.markerLayer?.dispose();
    this.scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      }
    });
  }
}
