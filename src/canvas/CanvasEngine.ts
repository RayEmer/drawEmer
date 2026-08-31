import type { BaseTool, PointerData } from './tools/BaseTool.ts';
import type { ColorF32 } from '../utils/color.ts';
import { PencilTool } from './tools/PencilTool.ts';
import { BrushTool } from './tools/BrushTool.ts';
import { EraserTool } from './tools/EraserTool.ts';
import { LayerManager } from './LayerManager.ts';

export type { CanvasConfig } from './LayerManager.ts';

export class CanvasEngine {
  readonly canvas: HTMLCanvasElement;
  readonly layerManager: LayerManager;

  private _ctx: CanvasRenderingContext2D;
  private activeTool: BaseTool;
  private _color: ColorF32 = { r: 0, g: 0, b: 0, a: 1 };
  private _size = 10;
  private _opacity = 1;
  private _isDrawing = false;
  private _capturedPointerId: number | null = null;

  onHistoryChange?: () => void;
  readonly tools: BaseTool[];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D not available');
    this._ctx = ctx;

    this.layerManager = new LayerManager();
    this.layerManager.onHistoryChange = () => this.onHistoryChange?.();

    this.tools = [new PencilTool(), new BrushTool(), new EraserTool()];
    this.activeTool = this.tools[0];
    this.bindEvents();

    // If the tab is hidden/backgrounded mid-stroke, the pointerup/pointercancel
    // that would normally end it can be missed - cancel proactively instead of
    // leaving _isDrawing stuck true.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.cancelStroke();
    });
  }

  get hasCanvas(): boolean { return this.layerManager.width > 0; }
  get color(): ColorF32 { return this._color; }
  set color(c: ColorF32) { this._color = c; }
  get size(): number { return this._size; }
  set size(s: number) { this._size = Math.max(1, s); }
  get opacity(): number { return this._opacity; }
  set opacity(o: number) { this._opacity = Math.max(0, Math.min(1, o)); }
  get activeToolId(): string { return this.activeTool.id; }
  get canUndo(): boolean { return this.layerManager.canUndo; }
  get canRedo(): boolean { return this.layerManager.canRedo; }

  createCanvas(config: import('./LayerManager.ts').CanvasConfig): void {
    this.canvas.width  = config.width;
    this.canvas.height = config.height;
    this.layerManager.init(config, this._ctx);
    this.onHistoryChange?.();
  }

  setTool(id: string): void {
    const tool = this.tools.find(t => t.id === id);
    if (tool) { this.activeTool = tool; this.canvas.style.cursor = tool.cursor; }
  }

  undo(): void { this.layerManager.undo(); }
  redo(): void { this.layerManager.redo(); }

  clear(): void { this.layerManager.clearActiveLayer(); }

  exportPNG(filename = 'drawemer.png'): void {
    const link = document.createElement('a');
    link.download = filename;
    link.href = this.layerManager.exportCanvas();
    link.click();
  }

  cancelStroke(): void {
    if (!this._isDrawing) return;
    this._isDrawing = false;
    if (this._capturedPointerId !== null) {
      try { this.canvas.releasePointerCapture(this._capturedPointerId); } catch { /* */ }
      this._capturedPointerId = null;
    }
    this.layerManager.cancelSnapshot();
  }

  private getPointerData(e: PointerEvent): PointerData {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const pressure = e.pressure > 0 ? e.pressure : (e.buttons > 0 ? 0.5 : 0);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
      pressure,
      pointerType: e.pointerType,
    };
  }

  private toolCtx() {
    const layer = this.layerManager.activeLayer;
    return {
      ctx: layer?.ctx ?? this._ctx,
      color: this._color,
      size:  this._size,
      opacity: this._opacity,
    };
  }

  private bindEvents(): void {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.hasCanvas) return;
      const layer = this.layerManager.activeLayer;
      if (!layer || layer.locked) return;
      e.preventDefault();
      this.canvas.setPointerCapture(e.pointerId);
      this._capturedPointerId = e.pointerId;
      this.layerManager.saveSnapshot();
      this._isDrawing = true;
      this.activeTool.onStart(this.getPointerData(e), this.toolCtx());
      this.layerManager.composite();
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this._isDrawing) return;
      e.preventDefault();
      const events = (e.getCoalescedEvents?.() ?? [e]) as PointerEvent[];
      for (const ev of events) this.activeTool.onMove(this.getPointerData(ev), this.toolCtx());
      this.layerManager.composite();
    });

    const end = (e: PointerEvent) => {
      if (!this._isDrawing) return;
      this._isDrawing = false;
      this._capturedPointerId = null;
      this.activeTool.onEnd(this.getPointerData(e), this.toolCtx());
      this.layerManager.composite();
    };

    this.canvas.addEventListener('pointerup',     end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('contextmenu',   e => e.preventDefault());
  }
}
