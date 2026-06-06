import { CanvasEngine } from './canvas/CanvasEngine.ts';
import { ZoomController } from './canvas/ZoomController.ts';
import { ColorPicker } from './ui/ColorPicker.ts';
import { NewCanvasDialog } from './ui/NewCanvasDialog.ts';
import { LayerPanel } from './ui/LayerPanel.ts';
import { LayerEffectsDialog } from './ui/LayerEffectsDialog.ts';

export function initApp(): void {
  const canvasEl = document.getElementById('main-canvas') as HTMLCanvasElement;
  const engine   = new CanvasEngine(canvasEl);
  const lm       = engine.layerManager;

  const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
  const btnRedo = document.getElementById('btn-redo') as HTMLButtonElement;

  const zoom = new ZoomController(
    document.getElementById('canvas-area')!,
    document.getElementById('canvas-scroll')!,
    canvasEl,
    () => engine.cancelStroke(),
  );
  zoom.onZoomChange = (z) => updateInfo(canvasEl.width, canvasEl.height, z);

  const layerPanel = new LayerPanel(lm);
  new LayerEffectsDialog(lm);

  lm.onLayersChange  = () => layerPanel.render();
  lm.onHistoryChange = () => {
    btnUndo.disabled = !engine.canUndo;
    btnRedo.disabled = !engine.canRedo;
  };

  btnUndo.addEventListener('click', () => engine.undo());
  btnRedo.addEventListener('click', () => engine.redo());

  const colorPicker = new ColorPicker((color) => { engine.color = color; });

  const dialog = new NewCanvasDialog((config) => {
    showCanvas();
    engine.createCanvas(config);
    zoom.fitToViewport();
    updateInfo(config.width, config.height, zoom.zoom);
  });

  document.querySelectorAll<HTMLButtonElement>('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset['tool']; if (!id) return; activateTool(id);
    });
  });

  function activateTool(id: string): void {
    engine.setTool(id);
    document.querySelectorAll('.tool-btn').forEach(b =>
      b.classList.toggle('active', (b as HTMLElement).dataset['tool'] === id));
  }

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); engine.undo(); return; }
      if (e.key === 'y') { e.preventDefault(); engine.redo(); return; }
      if (e.key === 'Z') { e.preventDefault(); engine.redo(); return; }
      if (e.key === 'n') { e.preventDefault(); dialog.show(); return; }
      if (e.key === '0') { e.preventDefault(); zoom.fitToViewport(); return; }
    }
    switch (e.key.toLowerCase()) {
      case 'p': activateTool('pencil'); break;
      case 'b': activateTool('brush');  break;
      case 'e': activateTool('eraser'); break;
    }
  });

  const sizeSlider = document.getElementById('size-slider') as HTMLInputElement;
  const sizeValue  = document.getElementById('size-value')  as HTMLInputElement;
  sizeSlider.addEventListener('input', () => {
    const v = parseInt(sizeSlider.value);
    engine.size = v; sizeValue.value = String(v);
  });
  sizeValue.addEventListener('input', () => {
    const v = Math.max(1, Math.min(100, parseInt(sizeValue.value) || 1));
    engine.size = v; sizeSlider.value = String(v);
  });

  const opSlider = document.getElementById('opacity-slider') as HTMLInputElement;
  const opValue  = document.getElementById('opacity-value')  as HTMLInputElement;
  opSlider.addEventListener('input', () => {
    const v = parseInt(opSlider.value);
    engine.opacity = v / 100; opValue.value = String(v);
  });
  opValue.addEventListener('input', () => {
    const v = Math.max(1, Math.min(100, parseInt(opValue.value) || 100));
    engine.opacity = v / 100; opSlider.value = String(v);
  });

  document.getElementById('btn-new')?.addEventListener('click',  () => dialog.show());
  document.getElementById('btn-new-2')?.addEventListener('click', () => dialog.show());
  document.getElementById('btn-clear')?.addEventListener('click', () => {
    if (!engine.hasCanvas) return;
    if (confirm('¿Limpiar la capa activa?')) engine.clear();
  });
  document.getElementById('btn-export')?.addEventListener('click', () => {
    if (!engine.hasCanvas) return;
    colorPicker.pushHistory();
    engine.exportPNG();
  });

  canvasEl.addEventListener('pointerup', () => {
    if (engine.hasCanvas) colorPicker.pushHistory();
  });

  function showCanvas(): void {
    document.getElementById('canvas-placeholder')!.classList.add('hidden');
    document.getElementById('canvas-scroll')!.style.display = 'flex';
  }

  function updateInfo(w: number, h: number, z = zoom.zoom): void {
    const el = document.getElementById('canvas-info');
    if (el) el.textContent = `${w} × ${h} px  |  ${Math.round(z * 100)}%`;
  }

  dialog.show();
}
