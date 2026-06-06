import type { LayerManager } from '../canvas/LayerManager.ts';
import type {
  LayerEffect, DropShadowEffect, OuterGlowEffect,
  InnerGlowEffect, GradientOverlayEffect, GradientStop, BlendMode,
} from '../canvas/Layer.ts';
import { BLEND_MODES } from '../canvas/Layer.ts';

export class LayerEffectsDialog {
  private panel: HTMLElement;
  private lm: LayerManager;
  private currentId: string | null = null;
  private liveStops: GradientStop[] = [];
  private _originalEffects: LayerEffect[] = [];
  private _rafPending = false;

  constructor(lm: LayerManager) {
    this.lm = lm;
    this.panel = document.getElementById('layer-effects-panel')!;

    const goBlend = document.getElementById('go-blend') as HTMLSelectElement;
    for (const bm of BLEND_MODES) {
      const opt = document.createElement('option');
      opt.value = bm.value; opt.textContent = bm.label;
      goBlend.appendChild(opt);
    }

    document.getElementById('effects-cancel')?.addEventListener('click', () => this.cancel());
    document.getElementById('effects-apply')?.addEventListener('click', () => this.hide());
    document.getElementById('effects-close')?.addEventListener('click', () => this.hide());

    document.addEventListener('show-effects', (e: Event) => {
      this.show((e as CustomEvent<string>).detail);
    });

    this.bindInputs();
    this.bindDrag();
  }

  private bindDrag(): void {
    const handle = document.getElementById('fx-drag-handle')!;
    let startX = 0, startY = 0;

    handle.addEventListener('pointerdown', e => {
      if ((e.target as HTMLElement).closest('.fx-close-btn')) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      startX = e.clientX - this.panel.offsetLeft;
      startY = e.clientY - this.panel.offsetTop;
    });

    handle.addEventListener('pointermove', e => {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      e.preventDefault();
      const x = Math.max(0, Math.min(window.innerWidth  - this.panel.offsetWidth,  e.clientX - startX));
      const y = Math.max(0, Math.min(window.innerHeight - this.panel.offsetHeight, e.clientY - startY));
      this.panel.style.left = `${x}px`;
      this.panel.style.top  = `${y}px`;
    });

    handle.addEventListener('pointerup', e => {
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    });
  }

  private bindInputs(): void {
    const live = () => this._scheduleLiveApply();

    ['ds-opacity','ds-blur','ds-offsetx','ds-offsety',
     'og-opacity','og-blur',
     'ig-opacity','ig-blur',
     'go-opacity','go-angle'].forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement;
      const lbl = document.getElementById(id + '-val');
      if (el && lbl) el.addEventListener('input', () => { lbl.textContent = el.value; live(); });
    });

    ['ds-enabled','og-enabled','ig-enabled','go-enabled'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => { this._syncAccordions(); live(); });
    });

    ['ds-color','og-color','ig-color'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', live);
    });

    document.getElementById('go-blend')?.addEventListener('change', live);

    // Clicking the header background (not the checkbox/label) only toggles collapsed state
    document.querySelectorAll<HTMLElement>('.effect-header').forEach(header => {
      header.addEventListener('click', e => {
        const t = e.target as HTMLElement;
        if (t.tagName === 'INPUT' || t.tagName === 'LABEL') return;
        header.closest('.effect-section')?.classList.toggle('fx-collapsed');
      });
    });
  }

  private _syncAccordions(): void {
    (['ds', 'og', 'ig', 'go'] as const).forEach(p => {
      const cb = document.getElementById(`${p}-enabled`) as HTMLInputElement | null;
      const section = cb?.closest('.effect-section');
      if (!section) return;
      if (cb!.checked) {
        section.classList.remove('fx-collapsed');   // activar → expandir siempre
      } else {
        section.classList.add('fx-collapsed');       // desactivar → colapsar siempre
      }
    });
  }

  private _scheduleLiveApply(): void {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => { this._rafPending = false; this._liveApply(); });
  }

  private _liveApply(): void {
    if (!this.currentId) return;
    this.lm.setEffects(this.currentId, this._buildEffects());
  }

  show(layerId: string): void {
    const layer = this.lm.findLayer(layerId);
    if (layer?.type !== 'layer') return;
    this.currentId = layerId;
    this._originalEffects = layer.effects.map(fx =>
      fx.type === 'gradient-overlay'
        ? { ...fx, stops: (fx as GradientOverlayEffect).stops.map(s => ({ ...s })) }
        : { ...fx }
    );
    (document.getElementById('effects-layer-name')!).textContent = layer.name;
    this.load(layer.effects);
    this.panel.classList.remove('hidden');
  }

  hide(): void { this.panel.classList.add('hidden'); this.currentId = null; }

  private cancel(): void {
    if (this.currentId) this.lm.setEffects(this.currentId, this._originalEffects);
    this.hide();
  }

  private load(effects: LayerEffect[]): void {
    const get = <T extends LayerEffect>(t: T['type']) =>
      effects.find(fx => fx.type === t) as T | undefined;

    const ds = get<DropShadowEffect>('drop-shadow');
    this.setCheck('ds-enabled', ds?.enabled ?? false);
    this.setColor('ds-color',   ds?.color ?? '#000000');
    this.setRange('ds-opacity', Math.round((ds?.opacity ?? 0.75) * 100));
    this.setRange('ds-blur',    ds?.blur    ?? 10);
    this.setRange('ds-offsetx', ds?.offsetX ?? 5);
    this.setRange('ds-offsety', ds?.offsetY ?? 5);

    const og = get<OuterGlowEffect>('outer-glow');
    this.setCheck('og-enabled', og?.enabled ?? false);
    this.setColor('og-color',   og?.color ?? '#ffee00');
    this.setRange('og-opacity', Math.round((og?.opacity ?? 0.75) * 100));
    this.setRange('og-blur',    og?.blur    ?? 15);

    const ig = get<InnerGlowEffect>('inner-glow');
    this.setCheck('ig-enabled', ig?.enabled ?? false);
    this.setColor('ig-color',   ig?.color ?? '#ffffff');
    this.setRange('ig-opacity', Math.round((ig?.opacity ?? 0.75) * 100));
    this.setRange('ig-blur',    ig?.blur    ?? 10);

    const go = get<GradientOverlayEffect>('gradient-overlay');
    this.setCheck('go-enabled', go?.enabled ?? false);
    this.setRange('go-opacity', Math.round((go?.opacity ?? 1) * 100));
    this.setRange('go-angle',   go?.angle  ?? 0);
    (document.getElementById('go-blend') as HTMLSelectElement).value = go?.blendMode ?? 'source-over';
    this.liveStops = go?.stops
      ? go.stops.map(s => ({ ...s }))
      : [{ color: '#000000', position: 0 }, { color: '#ffffff', position: 1 }];
    this.renderStops();
    this._syncAccordions();
  }

  private _buildEffects(): LayerEffect[] {
    const fx: LayerEffect[] = [];

    if (this.getCheck('ds-enabled')) {
      fx.push({ type: 'drop-shadow', enabled: true,
        color:   this.getColor('ds-color'),
        opacity: this.getRange('ds-opacity') / 100,
        blur:    this.getRange('ds-blur'),
        offsetX: this.getRange('ds-offsetx'),
        offsetY: this.getRange('ds-offsety'),
      } as DropShadowEffect);
    }
    if (this.getCheck('og-enabled')) {
      fx.push({ type: 'outer-glow', enabled: true,
        color:   this.getColor('og-color'),
        opacity: this.getRange('og-opacity') / 100,
        blur:    this.getRange('og-blur'),
      } as OuterGlowEffect);
    }
    if (this.getCheck('ig-enabled')) {
      fx.push({ type: 'inner-glow', enabled: true,
        color:   this.getColor('ig-color'),
        opacity: this.getRange('ig-opacity') / 100,
        blur:    this.getRange('ig-blur'),
      } as InnerGlowEffect);
    }
    if (this.getCheck('go-enabled')) {
      fx.push({ type: 'gradient-overlay', enabled: true,
        opacity:   this.getRange('go-opacity') / 100,
        angle:     this.getRange('go-angle'),
        blendMode: (document.getElementById('go-blend') as HTMLSelectElement).value as BlendMode,
        stops: this.readStops(),
      } as GradientOverlayEffect);
    }

    return fx;
  }

  private renderStops(): void {
    const container = document.getElementById('go-stops')!;
    container.innerHTML = '';
    this.liveStops.forEach((stop, i) => {
      const row = document.createElement('div');
      row.className = 'go-stop-row';

      const colorIn = document.createElement('input');
      colorIn.type = 'color'; colorIn.value = stop.color; colorIn.className = 'go-stop-color';
      colorIn.addEventListener('input', () => { this.liveStops[i].color = colorIn.value; this._scheduleLiveApply(); });

      const posIn = document.createElement('input');
      posIn.type = 'range'; posIn.min = '0'; posIn.max = '100';
      posIn.value = String(Math.round(stop.position * 100));
      posIn.className = 'go-stop-pos';
      const posLbl = document.createElement('span');
      posLbl.className = 'go-stop-lbl'; posLbl.textContent = posIn.value + '%';
      posIn.addEventListener('input', () => {
        this.liveStops[i].position = parseInt(posIn.value) / 100;
        posLbl.textContent = posIn.value + '%';
        this._scheduleLiveApply();
      });

      const del = document.createElement('button');
      del.textContent = '×'; del.className = 'go-stop-del';
      del.disabled = this.liveStops.length <= 2;
      del.addEventListener('click', () => { this.liveStops.splice(i, 1); this.renderStops(); this._scheduleLiveApply(); });

      row.append(colorIn, posIn, posLbl, del);
      container.appendChild(row);
    });

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Punto de color'; addBtn.className = 'go-stop-add';
    addBtn.addEventListener('click', () => {
      this.liveStops.push({ color: '#888888', position: 0.5 });
      this.renderStops();
      this._scheduleLiveApply();
    });
    container.appendChild(addBtn);
  }

  private readStops(): GradientStop[] {
    return [...this.liveStops].sort((a, b) => a.position - b.position);
  }

  private setCheck(id: string, v: boolean) { (document.getElementById(id) as HTMLInputElement).checked = v; }
  private getCheck(id: string): boolean    { return (document.getElementById(id) as HTMLInputElement).checked; }
  private setColor(id: string, v: string)  { (document.getElementById(id) as HTMLInputElement).value = v; }
  private getColor(id: string): string     { return (document.getElementById(id) as HTMLInputElement).value; }
  private setRange(id: string, v: number)  {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) el.value = String(v);
    const lbl = document.getElementById(id + '-val');
    if (lbl) lbl.textContent = String(v);
  }
  private getRange(id: string): number {
    return parseInt((document.getElementById(id) as HTMLInputElement).value ?? '0');
  }
}
