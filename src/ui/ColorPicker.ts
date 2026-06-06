import {
  type ColorF32,
  colorF32ToHex,
  colorF32ToHSV,
  hsvToColorF32,
  hexToColorF32,
} from '../utils/color.ts';

const MAX_HISTORY = 16;
const STORAGE_KEY = 'drawemer_color_history';
const RING_WIDTH = 22;

export class ColorPicker {
  private hsvCanvas: HTMLCanvasElement;
  private hsvCtx: CanvasRenderingContext2D;
  private hexInput: HTMLInputElement;
  private rInput: HTMLInputElement;
  private gInput: HTMLInputElement;
  private bInput: HTMLInputElement;
  private alphaTrack: HTMLElement;
  private alphaThumb: HTMLElement;
  private alphaDisplay: HTMLElement;
  private previewNew: HTMLElement;
  private previewOld: HTMLElement;
  private historyEl: HTMLElement;

  private hue = 0;    // 0-1
  private sat = 1;    // 0-1
  private val = 1;    // 0-1  (brightness)
  private alpha = 1;  // 0-1

  private dragging: 'ring' | 'sq' | 'alpha' | null = null;
  private history: ColorF32[] = [];
  private onChange?: (color: ColorF32) => void;

  constructor(onChangeCallback: (color: ColorF32) => void) {
    this.onChange = onChangeCallback;

    this.hsvCanvas   = document.getElementById('hsv-canvas') as HTMLCanvasElement;
    this.hexInput    = document.getElementById('hex-input') as HTMLInputElement;
    this.rInput      = document.getElementById('r-input') as HTMLInputElement;
    this.gInput      = document.getElementById('g-input') as HTMLInputElement;
    this.bInput      = document.getElementById('b-input') as HTMLInputElement;
    this.alphaTrack  = document.getElementById('alpha-track') as HTMLElement;
    this.alphaThumb  = document.getElementById('alpha-thumb') as HTMLElement;
    this.alphaDisplay = document.getElementById('alpha-display') as HTMLElement;
    this.previewNew  = document.getElementById('color-preview-new') as HTMLElement;
    this.previewOld  = document.getElementById('color-preview-old') as HTMLElement;
    this.historyEl   = document.getElementById('color-history') as HTMLElement;

    const ctx = this.hsvCanvas.getContext('2d');
    if (!ctx) throw new Error('HSV canvas ctx unavailable');
    this.hsvCtx = ctx;

    this.initCanvasSize();
    this.loadHistory();
    this.drawHSV();
    this.bindEvents();
    this.setColor({ r: 0, g: 0, b: 0, a: 1 });
  }

  private initCanvasSize(): void {
    // Set pixel buffer to match CSS display size
    const s = this.hsvCanvas.clientWidth > 0 ? this.hsvCanvas.clientWidth : 180;
    this.hsvCanvas.width  = s;
    this.hsvCanvas.height = s;
    // Redraw when CSS size changes (media query switches portrait ↔ landscape)
    const observer = new ResizeObserver(() => {
      const newSize = Math.floor(this.hsvCanvas.clientWidth);
      if (newSize > 0 && newSize !== this.hsvCanvas.width) {
        this.hsvCanvas.width  = newSize;
        this.hsvCanvas.height = newSize;
        this.drawHSV();
      }
    });
    observer.observe(this.hsvCanvas);
  }

  private get size(): number { return this.hsvCanvas.width; }
  private get cx(): number { return this.size / 2; }
  private get cy(): number { return this.size / 2; }
  private get outerR(): number { return this.size / 2 - 2; }
  private get innerR(): number { return this.outerR - RING_WIDTH; }
  private get sqSize(): number { return this.innerR * Math.SQRT2 - 4; }
  private get sqX(): number { return this.cx - this.sqSize / 2; }
  private get sqY(): number { return this.cy - this.sqSize / 2; }

  private drawHSV(): void {
    const { hsvCtx: ctx, cx, cy, outerR, innerR, size } = this;
    ctx.clearRect(0, 0, size, size);
    this.drawHueRing(ctx, cx, cy, outerR, innerR);
    this.drawSVSquare(ctx);
    this.drawRingCursor(ctx, cx, cy, outerR, innerR);
    this.drawSVCursor(ctx);
  }

  private drawHueRing(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    outerR: number, innerR: number,
  ): void {
    const steps = 360;
    for (let i = 0; i < steps; i++) {
      const startAngle = ((i - 0.5) / steps) * Math.PI * 2 - Math.PI / 2;
      const endAngle   = ((i + 0.5) / steps) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, endAngle);
      ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = `hsl(${i}, 100%, 50%)`;
      ctx.fill();
    }
  }

  private drawSVSquare(ctx: CanvasRenderingContext2D): void {
    const { sqX, sqY, sqSize, hue } = this;
    const hueColor = `hsl(${hue * 360}, 100%, 50%)`;

    // White → hue color (left → right)
    const gradH = ctx.createLinearGradient(sqX, sqY, sqX + sqSize, sqY);
    gradH.addColorStop(0, 'rgba(255,255,255,1)');
    gradH.addColorStop(1, hueColor);
    ctx.fillStyle = gradH;
    ctx.fillRect(sqX, sqY, sqSize, sqSize);

    // Transparent → black (top → bottom)
    const gradV = ctx.createLinearGradient(sqX, sqY, sqX, sqY + sqSize);
    gradV.addColorStop(0, 'rgba(0,0,0,0)');
    gradV.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gradV;
    ctx.fillRect(sqX, sqY, sqSize, sqSize);
  }

  private drawRingCursor(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    outerR: number, innerR: number,
  ): void {
    const angle = this.hue * Math.PI * 2 - Math.PI / 2;
    const r = (outerR + innerR) / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawSVCursor(ctx: CanvasRenderingContext2D): void {
    const { sqX, sqY, sqSize, sat, val } = this;
    const x = sqX + sat * sqSize;
    const y = sqY + (1 - val) * sqSize;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.strokeStyle = val > 0.5 ? '#000' : '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.strokeStyle = val > 0.5 ? '#fff' : '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }


  private bindEvents(): void {
    // HSV canvas
    this.hsvCanvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.hsvCanvas.setPointerCapture(e.pointerId);
      this.dragging = this.hitZone(e);
      this.handleHSVDrag(e);
    });
    this.hsvCanvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      e.preventDefault();
      this.handleHSVDrag(e);
    });
    this.hsvCanvas.addEventListener('pointerup', () => { this.dragging = null; });

    // Alpha track
    this.alphaTrack.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.alphaTrack.setPointerCapture(e.pointerId);
      this.dragging = 'alpha';
      this.handleAlphaDrag(e);
    });
    this.alphaTrack.addEventListener('pointermove', (e) => {
      if (this.dragging !== 'alpha') return;
      this.handleAlphaDrag(e);
    });
    this.alphaTrack.addEventListener('pointerup', () => { this.dragging = null; });

    // Hex input
    this.hexInput.addEventListener('input', () => {
      const raw = this.hexInput.value.replace(/[^0-9a-fA-F]/g, '');
      this.hexInput.value = raw;
      if (raw.length === 6) {
        const c = hexToColorF32('#' + raw);
        const [h, s, v] = colorF32ToHSV(c);
        this.hue = h; this.sat = s; this.val = v;
        this.refresh(false);
      }
    });
    this.hexInput.addEventListener('blur', () => this.pushHistory());

    // RGB inputs
    [this.rInput, this.gInput, this.bInput].forEach(inp => {
      inp.addEventListener('input', () => this.onRGBInput());
      inp.addEventListener('blur', () => this.pushHistory());
    });
  }

  // Convierte coordenadas CSS del evento a coordenadas del buffer del canvas.
  // Necesario porque canvas.width puede diferir de clientWidth hasta que el
  // ResizeObserver sincroniza ambos valores.
  private getCanvasCoords(e: PointerEvent): { x: number; y: number } {
    const rect = this.hsvCanvas.getBoundingClientRect();
    const scaleX = this.hsvCanvas.width  / (rect.width  || 1);
    const scaleY = this.hsvCanvas.height / (rect.height || 1);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  }

  private hitZone(e: PointerEvent): 'ring' | 'sq' | null {
    const { x, y } = this.getCanvasCoords(e);
    const dx = x - this.cx;
    const dy = y - this.cy;
    const dist = Math.hypot(dx, dy);
    // Fuera del círculo completo → no interactúa
    if (dist > this.outerR) return null;
    // En el anillo de matiz
    if (dist >= this.innerR) return 'ring';
    // Dentro del círculo interior → cuadrado SV
    // (incluye el pequeño hueco entre el círculo y las esquinas del cuadrado)
    return 'sq';
  }

  private handleHSVDrag(e: PointerEvent): void {
    const { x, y } = this.getCanvasCoords(e);
    if (this.dragging === 'ring') {
      const angle = Math.atan2(y - this.cy, x - this.cx) + Math.PI / 2;
      this.hue = ((angle / (Math.PI * 2)) + 1) % 1;
    } else if (this.dragging === 'sq') {
      const { sqX, sqY, sqSize } = this;
      this.sat = Math.max(0, Math.min(1, (x - sqX) / sqSize));
      this.val = Math.max(0, Math.min(1, 1 - (y - sqY) / sqSize));
    } else {
      return;
    }
    this.refresh(true);
  }

  private handleAlphaDrag(e: PointerEvent): void {
    const rect = this.alphaTrack.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.alpha = t;
    this.updateAlphaUI();
    this.emit();
  }

  private onRGBInput(): void {
    const r = Math.max(0, Math.min(255, parseInt(this.rInput.value) || 0));
    const g = Math.max(0, Math.min(255, parseInt(this.gInput.value) || 0));
    const b = Math.max(0, Math.min(255, parseInt(this.bInput.value) || 0));
    const c: ColorF32 = { r: r / 255, g: g / 255, b: b / 255, a: this.alpha };
    const [h, s, v] = colorF32ToHSV(c);
    this.hue = h; this.sat = s; this.val = v;
    this.refresh(false);
  }


  private refresh(redrawCanvas: boolean): void {
    if (redrawCanvas) this.drawHSV();
    const c = this.currentColor();
    const hex = colorF32ToHex(c).slice(1);
    this.hexInput.value = hex.toUpperCase();
    this.rInput.value = String(Math.round(c.r * 255));
    this.gInput.value = String(Math.round(c.g * 255));
    this.bInput.value = String(Math.round(c.b * 255));
    this.updateAlphaUI();
    this.updatePreviews(c);
    this.emit();
  }

  private updateAlphaUI(): void {
    const pct = this.alpha * 100;
    this.alphaThumb.style.left = `${pct}%`;
    this.alphaDisplay.textContent = String(Math.round(pct));
    const c = this.currentColor();
    // Alpha track gradient: transparent → current color
    this.alphaTrack.style.background = [
      `linear-gradient(to right, transparent, ${colorF32ToCssRGB(c)})`,
      `repeating-conic-gradient(#888 0% 25%, #ccc 0% 50%) 0 0 / 12px 12px`,
    ].join(', ');
  }

  private updatePreviews(c: ColorF32): void {
    const css = `rgba(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)},${c.a})`;
    this.previewNew.style.background = css;
  }

  private emit(): void {
    this.onChange?.(this.currentColor());
    // Also update toolbar swatch
    const swatch = document.getElementById('toolbar-color-swatch');
    if (swatch) {
      const c = this.currentColor();
      swatch.style.background = `rgba(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)},${c.a})`;
    }
  }


  currentColor(): ColorF32 {
    return hsvToColorF32(this.hue, this.sat, this.val, this.alpha);
  }

  setColor(c: ColorF32): void {
    const [h, s, v] = colorF32ToHSV(c);
    this.hue = h;
    this.sat = s;
    this.val = v;
    this.alpha = c.a;
    this.drawHSV();
    this.refresh(false);
    this.previewOld.style.background =
      `rgba(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)},${c.a})`;
  }

  pushHistory(): void {
    const c = this.currentColor();
    // Don't push duplicates
    const last = this.history[0];
    if (last && Math.abs(last.r - c.r) < 0.002 && Math.abs(last.g - c.g) < 0.002 &&
        Math.abs(last.b - c.b) < 0.002) return;
    this.history.unshift(c);
    if (this.history.length > MAX_HISTORY) this.history.pop();
    this.saveHistory();
    this.renderHistory();
  }

  private renderHistory(): void {
    this.historyEl.innerHTML = '';
    for (const c of this.history) {
      const btn = document.createElement('button');
      btn.className = 'history-swatch';
      btn.style.background =
        `rgba(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)},${c.a})`;
      btn.title = colorF32ToHex(c).toUpperCase();
      btn.addEventListener('click', () => this.setColor(c));
      this.historyEl.appendChild(btn);
    }
  }

  private saveHistory(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.history));
    } catch { /* storage unavailable */ }
  }

  private loadHistory(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.history = JSON.parse(raw);
    } catch { this.history = []; }
    this.renderHistory();
  }
}

function colorF32ToCssRGB(c: ColorF32): string {
  return `rgb(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)})`;
}
