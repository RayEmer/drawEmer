import type { LayerManager } from '../canvas/LayerManager.ts';
import type { AnyLayer, Layer, LayerGroup } from '../canvas/Layer.ts';
import { BLEND_MODES } from '../canvas/Layer.ts';

export class LayerPanel {
  private lm: LayerManager;
  private layerList: HTMLElement;
  private blendSelect: HTMLSelectElement;
  private opacitySlider: HTMLInputElement;
  private opacityVal: HTMLElement;
  private contextMenu: HTMLElement;
  private ctxTarget: string | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private _dragFromHandle = false;
  private _dragSourceId: string | null = null;

  constructor(lm: LayerManager) {
    this.lm = lm;
    this.layerList    = document.getElementById('layer-list')!;
    this.blendSelect  = document.getElementById('layer-blend-mode') as HTMLSelectElement;
    this.opacitySlider = document.getElementById('layer-opacity-slider') as HTMLInputElement;
    this.opacityVal   = document.getElementById('layer-opacity-val')!;
    this.contextMenu  = document.getElementById('layer-context-menu')!;

    for (const bm of BLEND_MODES) {
      const opt = document.createElement('option');
      opt.value = bm.value; opt.textContent = bm.label;
      this.blendSelect.appendChild(opt);
    }

    this.bindStatic();
  }

  private bindStatic(): void {
    document.getElementById('btn-add-layer')?.addEventListener('click', () => this.lm.addLayer());
    document.getElementById('btn-add-group')?.addEventListener('click', () => this.lm.addGroup());

    document.getElementById('btn-toggle-layers')?.addEventListener('click', () => {
      document.getElementById('layer-panel')?.classList.toggle('panel-open');
    });

    this.blendSelect.addEventListener('change', () => {
      if (this.lm.activeId) this.lm.setBlendMode(this.lm.activeId, this.blendSelect.value as never);
    });

    this.opacitySlider.addEventListener('input', () => {
      if (this.lm.activeId) {
        this.lm.setOpacity(this.lm.activeId, parseInt(this.opacitySlider.value) / 100);
        this.opacityVal.textContent = this.opacitySlider.value + '%';
      }
    });

    // Context menu buttons
    const ctx = (id: string, fn: () => void) =>
      document.getElementById(id)?.addEventListener('click', () => { fn(); this.hideCtx(); });

    ctx('ctx-duplicate',  () => this.ctxTarget && this.lm.duplicateLayer(this.ctxTarget));
    ctx('ctx-copy',       () => this.ctxTarget && this.lm.copyLayer(this.ctxTarget));
    ctx('ctx-paste',      () => this.lm.pasteLayer());
    ctx('ctx-move-up',    () => this.ctxTarget && this.lm.moveUp(this.ctxTarget));
    ctx('ctx-move-down',  () => this.ctxTarget && this.lm.moveDown(this.ctxTarget));
    ctx('ctx-merge-down', () => this.ctxTarget && this.lm.mergeDown(this.ctxTarget));
    ctx('ctx-flatten',    () => { if (confirm('¿Aplanar todas las capas en una?')) this.lm.flattenAll(); });
    ctx('ctx-effects',    () => {
      if (this.ctxTarget) document.dispatchEvent(new CustomEvent('show-effects', { detail: this.ctxTarget }));
    });
    ctx('ctx-delete', () => {
      if (this.ctxTarget && confirm('¿Eliminar esta capa?')) this.lm.deleteLayer(this.ctxTarget);
    });

    document.addEventListener('pointerdown', (e) => {
      if (!this.contextMenu.contains(e.target as Node)) this.hideCtx();
    });
  }

  render(): void {
    try {
      this.layerList.innerHTML = '';
      const rev = [...this.lm.layers].reverse();
      for (const item of rev) this.renderItem(item, 0);

      const active = this.lm.findLayer(this.lm.activeId);
      if (active) {
        this.blendSelect.value = active.blendMode;
        const pct = Math.round(active.opacity * 100);
        this.opacitySlider.value = String(pct);
        this.opacityVal.textContent = pct + '%';
      }
    } catch (err) {
      console.error('[LayerPanel] render error:', err);
    }
  }

  private renderItem(item: AnyLayer, depth: number): void {
    const isActive = item.id === this.lm.activeId;
    const row = document.createElement('div');
    row.className = 'layer-row' + (isActive ? ' active' : '') + (item.type === 'group' ? ' group-row' : '');
    row.dataset['id'] = item.id;
    row.style.paddingLeft = `${8 + depth * 14}px`;

    if (item.type === 'group') {
      this.buildGroupRow(row, item as LayerGroup);
      this.layerList.appendChild(row);
      if (!(item as LayerGroup).collapsed) {
        const revChildren = [...(item as LayerGroup).children].reverse();
        for (const child of revChildren) this.renderItem(child, depth + 1);
      }
    } else {
      this.buildLayerRow(row, item as Layer);
      this.layerList.appendChild(row);
    }
  }

  private buildLayerRow(row: HTMLElement, layer: Layer): void {
    // Drag handle
    const handle = document.createElement('span');
    handle.className = 'layer-drag-handle';
    handle.innerHTML = svgGrip();
    handle.title = 'Arrastrar para reordenar';
    handle.addEventListener('pointerdown', () => { this._dragFromHandle = true; });

    // Thumbnail
    const thumb = document.createElement('canvas');
    thumb.className = 'layer-thumb'; thumb.width = 28; thumb.height = 28;
    this.drawThumb(thumb, layer);

    // Name
    const name = document.createElement('span');
    name.className = 'layer-name'; name.textContent = layer.name; name.title = layer.name;
    name.addEventListener('dblclick', e => { e.stopPropagation(); this.startRename(name, layer.id); });

    // Locked badge
    const lockBadge = document.createElement('span');
    lockBadge.className = 'layer-lock-badge' + (layer.locked ? '' : ' hidden');
    lockBadge.innerHTML = svgLock();

    // Effects badge
    const fxBadge = document.createElement('span');
    fxBadge.className = 'layer-fx-badge' + (layer.effects.some(f => f.enabled) ? '' : ' hidden');
    fxBadge.textContent = 'fx';
    fxBadge.title = 'Tiene efectos de capa';

    // Eye
    const eye = document.createElement('button');
    eye.className = 'layer-btn' + (layer.visible ? '' : ' dimmed');
    eye.title = layer.visible ? 'Ocultar' : 'Mostrar';
    eye.innerHTML = layer.visible ? svgEye() : svgEyeOff();
    eye.addEventListener('click', e => { e.stopPropagation(); this.lm.setVisible(layer.id, !layer.visible); });

    // Lock
    const lock = document.createElement('button');
    lock.className = 'layer-btn' + (layer.locked ? ' active' : '');
    lock.title = layer.locked ? 'Desbloquear' : 'Bloquear';
    lock.innerHTML = svgLock();
    lock.addEventListener('click', e => { e.stopPropagation(); this.lm.setLocked(layer.id, !layer.locked); });

    row.append(handle, thumb, name, fxBadge, lockBadge, eye, lock);
    this.bindRowInteraction(row, layer.id);
    this.bindDragEvents(row, layer.id);
  }

  private buildGroupRow(row: HTMLElement, group: LayerGroup): void {
    const handle = document.createElement('span');
    handle.className = 'layer-drag-handle';
    handle.innerHTML = svgGrip();
    handle.title = 'Arrastrar para reordenar';
    handle.addEventListener('pointerdown', () => { this._dragFromHandle = true; });

    const arrow = document.createElement('span');
    arrow.className = 'group-arrow'; arrow.textContent = group.collapsed ? '▶' : '▼';
    arrow.addEventListener('click', e => { e.stopPropagation(); this.lm.toggleGroupCollapse(group.id); });

    const icon = document.createElement('span');
    icon.className = 'group-icon'; icon.innerHTML = svgFolder();

    const name = document.createElement('span');
    name.className = 'layer-name'; name.textContent = group.name; name.title = group.name;
    name.addEventListener('dblclick', e => { e.stopPropagation(); this.startRename(name, group.id); });

    const eye = document.createElement('button');
    eye.className = 'layer-btn' + (group.visible ? '' : ' dimmed');
    eye.innerHTML = group.visible ? svgEye() : svgEyeOff();
    eye.addEventListener('click', e => { e.stopPropagation(); this.lm.setVisible(group.id, !group.visible); });

    row.append(handle, arrow, icon, name, eye);
    row.addEventListener('pointerdown', e => {
      if ((e.target as HTMLElement).closest('.group-arrow, .layer-btn, .layer-drag-handle')) return;
      this.lm.setActive(group.id);
    });
    row.addEventListener('contextmenu', e => { e.preventDefault(); this.showCtx(group.id, e.clientX, e.clientY); });
    this.bindDragEvents(row, group.id);
  }

  private bindRowInteraction(row: HTMLElement, id: string): void {
    row.addEventListener('pointerdown', e => {
      if ((e.target as HTMLElement).closest('.layer-btn, .layer-drag-handle')) return;
      this.lm.setActive(id);
      this.startLongPress(id, e as PointerEvent);
    });
    row.addEventListener('pointerup',    () => this.cancelLongPress());
    row.addEventListener('pointerleave', () => this.cancelLongPress());
    row.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (this._dragFromHandle || this._dragSourceId) return;
      this.showCtx(id, e.clientX, e.clientY);
    });
  }

  private bindDragEvents(row: HTMLElement, id: string): void {
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', e => {
      if (!this._dragFromHandle) { e.preventDefault(); return; }
      this._dragFromHandle = false;
      this._dragSourceId = id;
      this.cancelLongPress();
      e.dataTransfer!.effectAllowed = 'move';
      e.dataTransfer!.setData('text/plain', id);
      setTimeout(() => row.classList.add('dragging'), 0);
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      this._dragSourceId = null;
      this._clearDragIndicators();
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      if (!this._dragSourceId || this._dragSourceId === id) return;
      e.dataTransfer!.dropEffect = 'move';
      this._clearDragIndicators();
      const r = row.getBoundingClientRect();
      row.classList.add(e.clientY < r.top + r.height / 2 ? 'drag-over-above' : 'drag-over-below');
    });
    row.addEventListener('dragleave', e => {
      if (!row.contains(e.relatedTarget as Node))
        row.classList.remove('drag-over-above', 'drag-over-below');
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      if (!this._dragSourceId || this._dragSourceId === id) return;
      const r = row.getBoundingClientRect();
      const domBefore = e.clientY < r.top + r.height / 2;
      // Panel muestra capas en orden inverso al array:
      // soltar "encima" en DOM = insertar después en array, y viceversa
      this.lm.moveLayerTo(this._dragSourceId, id, !domBefore);
      this._clearDragIndicators();
    });
  }

  private _clearDragIndicators(): void {
    this.layerList.querySelectorAll<HTMLElement>('.drag-over-above, .drag-over-below')
      .forEach(el => el.classList.remove('drag-over-above', 'drag-over-below'));
  }

  private drawThumb(canvas: HTMLCanvasElement, layer: Layer): void {
    const ctx = canvas.getContext('2d')!;
    // Checkered
    for (let x = 0; x < 28; x += 7) {
      for (let y = 0; y < 28; y += 7) {
        ctx.fillStyle = (Math.floor(x / 7) + Math.floor(y / 7)) % 2 === 0 ? '#c0c0c0' : '#ffffff';
        ctx.fillRect(x, y, 7, 7);
      }
    }
    ctx.drawImage(layer.canvas, 0, 0, 28, 28);
  }

  private startRename(nameEl: HTMLElement, id: string): void {
    const old = nameEl.textContent ?? '';
    nameEl.contentEditable = 'true'; nameEl.focus();
    const range = document.createRange();
    range.selectNodeContents(nameEl);
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
    const finish = () => {
      nameEl.contentEditable = 'false';
      const n = nameEl.textContent?.trim() || old;
      nameEl.textContent = n; this.lm.setName(id, n);
    };
    nameEl.addEventListener('blur', finish, { once: true });
    nameEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
      if (e.key === 'Escape') { nameEl.textContent = old; nameEl.blur(); }
    }, { once: true });
  }

  private startLongPress(id: string, e: PointerEvent): void {
    this.cancelLongPress();
    this.longPressTimer = setTimeout(() => {
      navigator.vibrate?.(30);
      this.showCtx(id, e.clientX, e.clientY);
    }, 600);
  }

  private cancelLongPress(): void {
    if (this.longPressTimer !== null) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
  }

  private showCtx(id: string, x: number, y: number): void {
    this.ctxTarget = id;
    const item = this.lm.findLayer(id);
    const isLayer = item?.type === 'layer';
    (document.getElementById('ctx-paste') as HTMLButtonElement).style.opacity = this.lm.hasClipboard() ? '1' : '0.4';
    ['ctx-copy', 'ctx-merge-down', 'ctx-effects'].forEach(bid => {
      const b = document.getElementById(bid);
      if (b) (b as HTMLElement).style.display = isLayer ? '' : 'none';
    });
    const cm = this.contextMenu;
    cm.style.left = `${Math.min(x, window.innerWidth  - cm.offsetWidth  - 8)}px`;
    cm.style.top  = `${Math.min(y, window.innerHeight - cm.offsetHeight - 8)}px`;
    cm.classList.remove('hidden');
  }

  private hideCtx(): void { this.contextMenu.classList.add('hidden'); this.ctxTarget = null; }
}

const svgGrip   = () => `<svg width="9" height="13" viewBox="0 0 9 13" fill="currentColor"><circle cx="2.5" cy="2" r="1.4"/><circle cx="6.5" cy="2" r="1.4"/><circle cx="2.5" cy="6.5" r="1.4"/><circle cx="6.5" cy="6.5" r="1.4"/><circle cx="2.5" cy="11" r="1.4"/><circle cx="6.5" cy="11" r="1.4"/></svg>`;
const svgEye    = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const svgEyeOff = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.06-5.94M9.9 4.24A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
const svgLock   = () => `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const svgFolder = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
