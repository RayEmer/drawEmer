import type { CanvasConfig } from '../canvas/LayerManager.ts';

export class NewCanvasDialog {
  private overlay: HTMLElement;
  private widthInput: HTMLInputElement;
  private heightInput: HTMLInputElement;
  private sizeWarn: HTMLElement;
  private bgTransparent: HTMLInputElement;
  private onConfirm: (config: CanvasConfig) => void;

  constructor(onConfirm: (config: CanvasConfig) => void) {
    this.onConfirm     = onConfirm;
    this.overlay       = document.getElementById('new-canvas-overlay')!;
    this.widthInput    = document.getElementById('canvas-width')  as HTMLInputElement;
    this.heightInput   = document.getElementById('canvas-height') as HTMLInputElement;
    this.sizeWarn      = document.getElementById('canvas-size-warn')!;
    this.bgTransparent = document.getElementById('bg-transparent') as HTMLInputElement;

    document.getElementById('modal-create')!.addEventListener('click', () => this.submit());
    document.getElementById('modal-cancel')!.addEventListener('click', () => this.hide());
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.hide(); });

    document.querySelectorAll<HTMLButtonElement>('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.widthInput.value  = btn.dataset['w'] ?? '800';
        this.heightInput.value = btn.dataset['h'] ?? '600';
        this.checkSize();
      });
    });

    [this.widthInput, this.heightInput].forEach(inp => inp.addEventListener('input', () => this.checkSize()));
  }

  show(): void {
    this.overlay.classList.remove('hidden');
    this.widthInput.focus(); this.widthInput.select();
    this.checkSize();
  }

  hide(): void { this.overlay.classList.add('hidden'); }

  private checkSize(): void {
    const w = parseInt(this.widthInput.value) || 0;
    const h = parseInt(this.heightInput.value) || 0;
    this.sizeWarn.classList.toggle('hidden', w * h <= 2073600);
  }

  private submit(): void {
    const w = Math.max(1, Math.min(16384, parseInt(this.widthInput.value) || 800));
    const h = Math.max(1, Math.min(16384, parseInt(this.heightInput.value) || 600));
    const background = this.bgTransparent?.checked ? 'transparent' : 'white';
    this.hide();
    this.onConfirm({ width: w, height: h, background });
  }
}
