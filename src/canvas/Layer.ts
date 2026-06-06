export type BlendMode =
  | 'source-over' | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'hard-light' | 'soft-light' | 'difference' | 'exclusion'
  | 'hue' | 'saturation' | 'color' | 'luminosity';

export const BLEND_MODES: ReadonlyArray<{ value: BlendMode; label: string }> = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply',    label: 'Multiplicar' },
  { value: 'screen',      label: 'Pantalla' },
  { value: 'overlay',     label: 'Superponer' },
  { value: 'darken',      label: 'Oscurecer' },
  { value: 'lighten',     label: 'Aclarar' },
  { value: 'color-dodge', label: 'Sobreexposición' },
  { value: 'color-burn',  label: 'Subexposición' },
  { value: 'hard-light',  label: 'Luz fuerte' },
  { value: 'soft-light',  label: 'Luz suave' },
  { value: 'difference',  label: 'Diferencia' },
  { value: 'exclusion',   label: 'Exclusión' },
  { value: 'hue',         label: 'Matiz' },
  { value: 'saturation',  label: 'Saturación' },
  { value: 'color',       label: 'Color' },
  { value: 'luminosity',  label: 'Luminosidad' },
];

export interface DropShadowEffect {
  type: 'drop-shadow';
  enabled: boolean;
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
  opacity: number;
}
export interface OuterGlowEffect {
  type: 'outer-glow';
  enabled: boolean;
  blur: number;
  color: string;
  opacity: number;
}
export interface InnerGlowEffect {
  type: 'inner-glow';
  enabled: boolean;
  blur: number;
  color: string;
  opacity: number;
}
export interface GradientStop { color: string; position: number; }
export interface GradientOverlayEffect {
  type: 'gradient-overlay';
  enabled: boolean;
  opacity: number;
  angle: number;
  blendMode: BlendMode;
  stops: GradientStop[];
}

export type LayerEffect =
  | DropShadowEffect | OuterGlowEffect | InnerGlowEffect | GradientOverlayEffect;

export interface Layer {
  id: string; name: string; type: 'layer';
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  visible: boolean; locked: boolean;
  opacity: number; blendMode: BlendMode;
  effects: LayerEffect[];
}
export interface LayerGroup {
  id: string; name: string; type: 'group';
  visible: boolean; locked: boolean;
  opacity: number; blendMode: BlendMode;
  collapsed: boolean; children: AnyLayer[];
}
export type AnyLayer = Layer | LayerGroup;

let _n = 1;
export function nextName(prefix: string): string { return `${prefix} ${_n++}`; }

function uid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function createLayer(name: string, w: number, h: number): Layer {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return { id: uid(), name, type: 'layer', canvas, ctx,
    visible: true, locked: false, opacity: 1, blendMode: 'source-over', effects: [] };
}

export function createGroup(name: string): LayerGroup {
  return { id: uid(), name, type: 'group',
    visible: true, locked: false, opacity: 1, blendMode: 'source-over',
    collapsed: false, children: [] };
}

export function cloneLayer(src: Layer): Layer {
  const dst = createLayer(src.name, src.canvas.width, src.canvas.height);
  dst.ctx.putImageData(src.ctx.getImageData(0, 0, src.canvas.width, src.canvas.height), 0, 0);
  dst.visible = src.visible; dst.locked = src.locked;
  dst.opacity = src.opacity; dst.blendMode = src.blendMode;
  dst.effects = src.effects.map(fx =>
    fx.type === 'gradient-overlay'
      ? { ...fx, stops: fx.stops.map(s => ({ ...s })) }
      : { ...fx }
  );
  return dst;
}

export function hexToRgba(hex: string, opacity: number): string {
  const h = hex.replace('#', '').padEnd(6, '0');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}
