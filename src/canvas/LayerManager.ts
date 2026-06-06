import {
  type AnyLayer, type Layer, type LayerGroup, type BlendMode, type LayerEffect,
  type DropShadowEffect, type OuterGlowEffect, type InnerGlowEffect, type GradientOverlayEffect,
  createLayer, createGroup, cloneLayer, nextName, hexToRgba,
} from './Layer.ts';

export interface CanvasConfig {
  width: number;
  height: number;
  background: 'transparent' | 'white';
}

const MAX_UNDO = 30;
interface UndoEntry { layerId: string; data: ImageData; }
type FindResult = { item: AnyLayer; parent: AnyLayer[]; index: number };

export class LayerManager {
  private _layers: AnyLayer[] = [];
  private _activeId: string | null = null;
  private _clipboard: Layer | null = null;
  private _undoStack: UndoEntry[] = [];
  private _redoStack: UndoEntry[] = [];

  width = 0;
  height = 0;
  private _displayCtx: CanvasRenderingContext2D | null = null;

  onLayersChange?: () => void;
  onHistoryChange?: () => void;

  get layers(): AnyLayer[] { return this._layers; }
  get activeId(): string | null { return this._activeId; }
  get canUndo(): boolean { return this._undoStack.length > 0; }
  get canRedo(): boolean { return this._redoStack.length > 0; }

  get activeLayer(): Layer | null {
    if (!this._activeId) return null;
    const r = this._find(this._activeId);
    return r?.item.type === 'layer' ? r.item as Layer : null;
  }

  init(config: CanvasConfig, displayCtx: CanvasRenderingContext2D): void {
    this.width = config.width;
    this.height = config.height;
    this._displayCtx = displayCtx;
    this._undoStack = [];
    this._redoStack = [];
    this._clipboard = null;

    const bg = createLayer('Fondo', config.width, config.height);
    if (config.background === 'white') {
      bg.ctx.fillStyle = '#ffffff';
      bg.ctx.fillRect(0, 0, config.width, config.height);
    }
    const layer1 = createLayer(nextName('Capa'), config.width, config.height);
    this._layers = [bg, layer1];
    this._activeId = layer1.id;

    this.composite();
    this.onLayersChange?.();
    this.onHistoryChange?.();
  }

  private _find(id: string, arr = this._layers): FindResult | null {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].id === id) return { item: arr[i], parent: arr, index: i };
      if (arr[i].type === 'group') {
        const r = this._find(id, (arr[i] as LayerGroup).children);
        if (r) return r;
      }
    }
    return null;
  }

  findLayer(id: string | null): AnyLayer | null {
    if (!id) return null;
    return this._find(id)?.item ?? null;
  }

  flatLayers(arr = this._layers): Layer[] {
    const out: Layer[] = [];
    for (const item of arr) {
      if (item.type === 'layer') out.push(item as Layer);
      else out.push(...this.flatLayers((item as LayerGroup).children));
    }
    return out;
  }

  addLayer(parentGroupId?: string): void {
    const layer = createLayer(nextName('Capa'), this.width, this.height);
    if (parentGroupId) {
      const r = this._find(parentGroupId);
      if (r?.item.type === 'group') (r.item as LayerGroup).children.push(layer);
    } else {
      const r = this._activeId ? this._find(this._activeId) : null;
      if (r && r.parent === this._layers) this._layers.splice(r.index + 1, 0, layer);
      else this._layers.push(layer);
    }
    this._activeId = layer.id;
    this.composite();
    this.onLayersChange?.();
  }

  addGroup(): void {
    const group = createGroup(nextName('Grupo'));
    const inner = createLayer(nextName('Capa'), this.width, this.height);
    group.children.push(inner);
    const r = this._activeId ? this._find(this._activeId) : null;
    if (r && r.parent === this._layers) this._layers.splice(r.index + 1, 0, group);
    else this._layers.push(group);
    this._activeId = inner.id;
    this.composite();
    this.onLayersChange?.();
  }

  deleteLayer(id: string): void {
    if (this.flatLayers().length <= 1) return;
    const r = this._find(id);
    if (!r) return;
    r.parent.splice(r.index, 1);
    if (this._activeId === id) {
      const flat = this.flatLayers();
      this._activeId = flat[flat.length - 1]?.id ?? null;
    }
    this.composite();
    this.onLayersChange?.();
  }

  duplicateLayer(id: string): void {
    const r = this._find(id);
    if (!r || r.item.type !== 'layer') return;
    const copy = cloneLayer(r.item as Layer);
    copy.name = r.item.name + ' copia';
    r.parent.splice(r.index + 1, 0, copy);
    this._activeId = copy.id;
    this.composite();
    this.onLayersChange?.();
  }

  copyLayer(id: string): void {
    const r = this._find(id);
    if (r?.item.type === 'layer') this._clipboard = cloneLayer(r.item as Layer);
  }

  hasClipboard(): boolean { return this._clipboard !== null; }

  pasteLayer(): void {
    if (!this._clipboard) return;
    const copy = cloneLayer(this._clipboard);
    copy.name = this._clipboard.name + ' (pegada)';
    const r = this._activeId ? this._find(this._activeId) : null;
    if (r && r.parent === this._layers) this._layers.splice(r.index + 1, 0, copy);
    else this._layers.push(copy);
    this._activeId = copy.id;
    this.composite();
    this.onLayersChange?.();
  }

  mergeDown(id: string): void {
    const r = this._find(id);
    if (!r || r.item.type !== 'layer' || r.index === 0) return;
    const below = r.parent[r.index - 1];
    if (below.type !== 'layer') return;
    const above = r.item as Layer;
    const belowL = below as Layer;
    belowL.ctx.save();
    belowL.ctx.globalAlpha = above.opacity;
    belowL.ctx.globalCompositeOperation = above.blendMode as GlobalCompositeOperation;
    belowL.ctx.drawImage(above.canvas, 0, 0);
    belowL.ctx.restore();
    r.parent.splice(r.index, 1);
    this._activeId = belowL.id;
    this.composite();
    this.onLayersChange?.();
  }

  flattenAll(): void {
    const tmp = document.createElement('canvas');
    tmp.width = this.width; tmp.height = this.height;
    const tmpCtx = tmp.getContext('2d')!;
    this._compositeToCtx(tmpCtx, this._layers);
    const flat = createLayer('Fondo', this.width, this.height);
    flat.ctx.putImageData(tmpCtx.getImageData(0, 0, this.width, this.height), 0, 0);
    this._layers = [flat];
    this._activeId = flat.id;
    this._undoStack = [];
    this._redoStack = [];
    this.composite();
    this.onLayersChange?.();
    this.onHistoryChange?.();
  }

  setActive(id: string): void { this._activeId = id; this.onLayersChange?.(); }

  setVisible(id: string, v: boolean): void {
    const r = this._find(id);
    if (r) { r.item.visible = v; this.composite(); this.onLayersChange?.(); }
  }

  setLocked(id: string, v: boolean): void {
    const r = this._find(id);
    if (r) { r.item.locked = v; this.onLayersChange?.(); }
  }

  setOpacity(id: string, v: number): void {
    const r = this._find(id);
    if (r) { r.item.opacity = Math.max(0, Math.min(1, v)); this.composite(); this.onLayersChange?.(); }
  }

  setBlendMode(id: string, mode: BlendMode): void {
    const r = this._find(id);
    if (r) { r.item.blendMode = mode; this.composite(); this.onLayersChange?.(); }
  }

  setEffects(id: string, effects: LayerEffect[]): void {
    const r = this._find(id);
    if (r?.item.type === 'layer') { (r.item as Layer).effects = effects; this.composite(); this.onLayersChange?.(); }
  }

  setName(id: string, name: string): void {
    const r = this._find(id);
    if (r) { r.item.name = name; this.onLayersChange?.(); }
  }

  moveUp(id: string): void {
    const r = this._find(id);
    if (!r || r.index >= r.parent.length - 1) return;
    [r.parent[r.index], r.parent[r.index + 1]] = [r.parent[r.index + 1], r.parent[r.index]];
    this.composite(); this.onLayersChange?.();
  }

  moveDown(id: string): void {
    const r = this._find(id);
    if (!r || r.index === 0) return;
    [r.parent[r.index - 1], r.parent[r.index]] = [r.parent[r.index], r.parent[r.index - 1]];
    this.composite(); this.onLayersChange?.();
  }

  moveLayerTo(id: string, targetId: string, before: boolean): void {
    if (id === targetId) return;
    const src = this._find(id);
    if (!src) return;
    const srcItem = src.item;
    src.parent.splice(src.index, 1);
    const tgt = this._find(targetId);
    if (!tgt) { src.parent.splice(src.index, 0, srcItem); return; }
    tgt.parent.splice(before ? tgt.index : tgt.index + 1, 0, srcItem);
    this.composite();
    this.onLayersChange?.();
  }

  toggleGroupCollapse(id: string): void {
    const r = this._find(id);
    if (r?.item.type === 'group') {
      (r.item as LayerGroup).collapsed = !(r.item as LayerGroup).collapsed;
      this.onLayersChange?.();
    }
  }

  saveSnapshot(): void {
    const layer = this.activeLayer;
    if (!layer) return;
    const data = layer.ctx.getImageData(0, 0, this.width, this.height);
    this._undoStack.push({ layerId: layer.id, data });
    if (this._undoStack.length > MAX_UNDO) this._undoStack.shift();
    this._redoStack = [];
    this.onHistoryChange?.();
  }

  cancelSnapshot(): void {
    const entry = this._undoStack.pop();
    if (!entry) return;
    const r = this._find(entry.layerId);
    if (r?.item.type === 'layer') (r.item as Layer).ctx.putImageData(entry.data, 0, 0);
    this.composite();
    this.onHistoryChange?.();
    this.onLayersChange?.();
  }

  undo(): void {
    const entry = this._undoStack.pop();
    if (!entry) return;
    const layer = this.activeLayer;
    if (layer) {
      this._redoStack.push({ layerId: layer.id, data: layer.ctx.getImageData(0, 0, this.width, this.height) });
    }
    const r = this._find(entry.layerId);
    if (r?.item.type === 'layer') {
      (r.item as Layer).ctx.putImageData(entry.data, 0, 0);
      this._activeId = entry.layerId;
    }
    this.composite();
    this.onHistoryChange?.();
    this.onLayersChange?.();
  }

  redo(): void {
    const entry = this._redoStack.pop();
    if (!entry) return;
    const layer = this.activeLayer;
    if (layer) {
      this._undoStack.push({ layerId: layer.id, data: layer.ctx.getImageData(0, 0, this.width, this.height) });
    }
    const r = this._find(entry.layerId);
    if (r?.item.type === 'layer') {
      (r.item as Layer).ctx.putImageData(entry.data, 0, 0);
      this._activeId = entry.layerId;
    }
    this.composite();
    this.onHistoryChange?.();
    this.onLayersChange?.();
  }

  clearActiveLayer(): void {
    const layer = this.activeLayer;
    if (!layer) return;
    this.saveSnapshot();
    layer.ctx.clearRect(0, 0, this.width, this.height);
    this.composite();
  }

  composite(): void {
    if (!this._displayCtx) return;
    this._displayCtx.clearRect(0, 0, this.width, this.height);
    this._compositeToCtx(this._displayCtx, this._layers);
  }

  private _compositeToCtx(ctx: CanvasRenderingContext2D, layers: AnyLayer[]): void {
    for (const item of layers) {
      if (!item.visible) continue;
      if (item.type === 'group') {
        const grp = item as LayerGroup;
        if (!grp.children.length) continue;
        const tmp = document.createElement('canvas');
        tmp.width = this.width; tmp.height = this.height;
        this._compositeToCtx(tmp.getContext('2d')!, grp.children);
        ctx.save();
        ctx.globalAlpha = grp.opacity;
        ctx.globalCompositeOperation = grp.blendMode as GlobalCompositeOperation;
        ctx.drawImage(tmp, 0, 0);
        ctx.restore();
      } else {
        this._compositeLayer(item as Layer, ctx);
      }
    }
  }

  private _compositeLayer(layer: Layer, ctx: CanvasRenderingContext2D): void {
    const { width: w, height: h } = layer.canvas;
    const active = layer.effects.filter(fx => fx.enabled);

    if (!active.length) {
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
      ctx.drawImage(layer.canvas, 0, 0);
      ctx.restore();
      return;
    }

    const mkc = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

    const tmp = mkc();
    const tc = tmp.getContext('2d')!;

    // Outer glow (under layer)
    for (const fx of active) {
      if (fx.type !== 'outer-glow') continue;
      const og = fx as OuterGlowEffect;
      const g = mkc(); const gc = g.getContext('2d')!;
      gc.drawImage(layer.canvas, 0, 0);
      gc.globalCompositeOperation = 'source-in';
      gc.fillStyle = og.color; gc.fillRect(0, 0, w, h);
      tc.save(); tc.filter = `blur(${og.blur}px)`; tc.globalAlpha = og.opacity;
      tc.drawImage(g, 0, 0); tc.filter = 'none'; tc.restore();
    }

    // Layer + drop shadow via native shadow API
    const ds = active.find(fx => fx.type === 'drop-shadow') as DropShadowEffect | undefined;
    tc.save();
    if (ds) {
      tc.shadowColor = hexToRgba(ds.color, ds.opacity);
      tc.shadowBlur = ds.blur;
      tc.shadowOffsetX = ds.offsetX;
      tc.shadowOffsetY = ds.offsetY;
    }
    tc.drawImage(layer.canvas, 0, 0);
    tc.restore();

    // Inner glow (over layer)
    for (const fx of active) {
      if (fx.type !== 'inner-glow') continue;
      const ig = fx as InnerGlowEffect;
      const ig1 = mkc(); const ic1 = ig1.getContext('2d')!;
      ic1.fillStyle = ig.color; ic1.fillRect(0, 0, w, h);
      ic1.globalCompositeOperation = 'destination-out';
      ic1.drawImage(layer.canvas, 0, 0);
      const ig2 = mkc(); const ic2 = ig2.getContext('2d')!;
      ic2.filter = `blur(${ig.blur}px)`; ic2.drawImage(ig1, 0, 0); ic2.filter = 'none';
      ic2.globalCompositeOperation = 'destination-in'; ic2.drawImage(layer.canvas, 0, 0);
      tc.save(); tc.globalCompositeOperation = 'source-atop';
      tc.globalAlpha = ig.opacity; tc.drawImage(ig2, 0, 0); tc.restore();
    }

    // Gradient overlay (over layer)
    for (const fx of active) {
      if (fx.type !== 'gradient-overlay') continue;
      const go = fx as GradientOverlayEffect;
      const gc2 = mkc(); const gctx = gc2.getContext('2d')!;
      gctx.drawImage(layer.canvas, 0, 0);
      gctx.globalCompositeOperation = 'source-in';
      const angle = (go.angle * Math.PI) / 180;
      const cx = w / 2, cy = h / 2, r = Math.sqrt(w * w + h * h) / 2;
      const grad = gctx.createLinearGradient(
        cx - Math.cos(angle) * r, cy - Math.sin(angle) * r,
        cx + Math.cos(angle) * r, cy + Math.sin(angle) * r,
      );
      for (const s of go.stops) grad.addColorStop(s.position, s.color);
      gctx.globalAlpha = go.opacity; gctx.fillStyle = grad; gctx.fillRect(0, 0, w, h);
      tc.save(); tc.globalCompositeOperation = go.blendMode as GlobalCompositeOperation;
      tc.drawImage(gc2, 0, 0); tc.restore();
    }

    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }

  exportCanvas(): string {
    const el = document.createElement('canvas');
    el.width = this.width; el.height = this.height;
    const ctx = el.getContext('2d')!;
    this._compositeToCtx(ctx, this._layers);
    return el.toDataURL('image/png');
  }
}
