import { BaseTool, type PointerData, type ToolContext } from './BaseTool.ts';

export class EraserTool extends BaseTool {
  readonly id = 'eraser';
  readonly label = 'Goma';
  readonly cursor = 'cell';

  private drawing = false;
  private lastX = 0;
  private lastY = 0;

  onStart(data: PointerData, ctx: ToolContext): void {
    this.drawing = true;
    this.lastX = data.x;
    this.lastY = data.y;
    this.erase(data, ctx);
  }

  private erase(data: PointerData, ctx: ToolContext): void {
    const size = ctx.size * (0.5 + data.pressure * 0.5);
    const prev = ctx.ctx.globalCompositeOperation;
    ctx.ctx.globalCompositeOperation = 'destination-out';
    ctx.ctx.beginPath();
    ctx.ctx.arc(data.x, data.y, size / 2, 0, Math.PI * 2);
    ctx.ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.ctx.fill();
    ctx.ctx.globalCompositeOperation = prev;
  }

  onMove(data: PointerData, ctx: ToolContext): void {
    if (!this.drawing) return;
    const size = ctx.size * (0.5 + data.pressure * 0.5);
    const prev = ctx.ctx.globalCompositeOperation;
    ctx.ctx.globalCompositeOperation = 'destination-out';
    ctx.ctx.beginPath();
    ctx.ctx.moveTo(this.lastX, this.lastY);
    ctx.ctx.lineTo(data.x, data.y);
    ctx.ctx.lineWidth = size;
    ctx.ctx.lineCap = 'round';
    ctx.ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.ctx.stroke();
    ctx.ctx.globalCompositeOperation = prev;
    this.lastX = data.x;
    this.lastY = data.y;
  }

  onEnd(_data: PointerData, _ctx: ToolContext): void {
    this.drawing = false;
  }
}
