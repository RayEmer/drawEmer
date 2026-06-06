export class ZoomController {
  private area: HTMLElement;    // #canvas-area  — captura eventos en fase capture
  private scroll: HTMLElement;  // #canvas-scroll — ajusta scroll tras zoom
  private canvas: HTMLCanvasElement;
  private onPinchStart: () => void;

  zoom = 1;
  private readonly MIN = 0.05;
  private readonly MAX = 32;

  private pointers = new Map<number, PointerEvent>();
  private isPinching = false;
  private pinchStartDist = 1;
  private pinchStartZoom = 1;

  onZoomChange?: (zoom: number) => void;

  constructor(
    area: HTMLElement,
    scroll: HTMLElement,
    canvas: HTMLCanvasElement,
    onPinchStart: () => void,
  ) {
    this.area   = area;
    this.scroll = scroll;
    this.canvas = canvas;
    this.onPinchStart = onPinchStart;
    this.bindEvents();
  }

  private bindEvents(): void {
    // Capture phase: se dispara ANTES de que CanvasEngine vea los eventos
    const cap = { capture: true, passive: false } as const;
    this.area.addEventListener('pointerdown',   e => this.onDown(e), cap);
    this.area.addEventListener('pointermove',   e => this.onMove(e), cap);
    this.area.addEventListener('pointerup',     e => this.onUp(e),   cap);
    this.area.addEventListener('pointercancel', e => this.onUp(e),   cap);

    // Rueda del ratón (desktop)
    this.scroll.addEventListener('wheel', e => this.onWheel(e), { passive: false });
  }

  private onDown(e: PointerEvent): void {
    this.pointers.set(e.pointerId, e);

    if (this.pointers.size === 2 && !this.isPinching) {
      e.stopPropagation(); // CanvasEngine no verá este evento
      this.isPinching = true;
      this.onPinchStart(); // cancela el trazo en curso
      const [p1, p2] = [...this.pointers.values()];
      this.pinchStartDist = pinchDist(p1, p2);
      this.pinchStartZoom = this.zoom;
    }
  }

  private onMove(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, e);

    if (this.isPinching && this.pointers.size >= 2) {
      e.stopPropagation();
      e.preventDefault(); // evita scroll nativo durante el gesto
      const pts = [...this.pointers.values()];
      const newDist = pinchDist(pts[0], pts[1]);
      this.setZoom(this.pinchStartZoom * (newDist / this.pinchStartDist));
    }
  }

  private onUp(e: PointerEvent): void {
    if (this.isPinching) e.stopPropagation();
    this.pointers.delete(e.pointerId);

    if (this.pointers.size < 2) {
      this.isPinching = false;
    }
    // Si queda 1 dedo, actualiza la referencia de zoom para el próximo pellizco
    if (this.pointers.size === 1) {
      this.pinchStartZoom = this.zoom;
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.setZoom(this.zoom * factor);
  }

  setZoom(newZoom: number): void {
    const clamped = Math.max(this.MIN, Math.min(this.MAX, newZoom));
    if (Math.abs(clamped - this.zoom) < 0.0005) return;

    // Guarda posición relativa de scroll para mantener "lo que se está viendo"
    const maxX = Math.max(0, this.scroll.scrollWidth  - this.scroll.clientWidth);
    const maxY = Math.max(0, this.scroll.scrollHeight - this.scroll.clientHeight);
    const relX = maxX > 0 ? this.scroll.scrollLeft / maxX : 0.5;
    const relY = maxY > 0 ? this.scroll.scrollTop  / maxY : 0.5;

    this.zoom = clamped;
    this.applySize();

    // Restaura scroll en el siguiente frame (tras el reflow)
    requestAnimationFrame(() => {
      const newMaxX = Math.max(0, this.scroll.scrollWidth  - this.scroll.clientWidth);
      const newMaxY = Math.max(0, this.scroll.scrollHeight - this.scroll.clientHeight);
      this.scroll.scrollLeft = relX * newMaxX;
      this.scroll.scrollTop  = relY * newMaxY;
      this.onZoomChange?.(this.zoom);
    });
  }

  private applySize(): void {
    this.canvas.style.width  = this.canvas.width  * this.zoom + 'px';
    this.canvas.style.height = this.canvas.height * this.zoom + 'px';
  }

  // Ajusta el zoom al crear un nuevo lienzo para que quepa en el viewport
  fitToViewport(): void {
    if (!this.canvas.width || !this.canvas.height) return;
    const rect = this.scroll.getBoundingClientRect();
    const zx = (rect.width  - 64) / this.canvas.width;
    const zy = (rect.height - 64) / this.canvas.height;
    this.zoom = Math.min(1, zx, zy);
    this.applySize();

    requestAnimationFrame(() => {
      // Centra el lienzo en el área de scroll
      this.scroll.scrollLeft = Math.max(0, (this.scroll.scrollWidth  - this.scroll.clientWidth)  / 2);
      this.scroll.scrollTop  = Math.max(0, (this.scroll.scrollHeight - this.scroll.clientHeight) / 2);
      this.onZoomChange?.(this.zoom);
    });
  }

  reset(): void {
    this.setZoom(1);
  }
}

function pinchDist(a: PointerEvent, b: PointerEvent): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
