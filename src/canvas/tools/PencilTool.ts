import { BaseTool, type PointerData, type ToolContext } from './BaseTool.ts';
import { colorF32ToCss } from '../../utils/color.ts';

export class PencilTool extends BaseTool {
  readonly id = 'pencil';
  readonly label = 'Lápiz';
  readonly cursor = 'crosshair';

  private drawing = false;
  private lastX = 0;
  private lastY = 0;

  onStart(data: PointerData, ctx: ToolContext): void {
    this.drawing = true;
    this.lastX = data.x;
    this.lastY = data.y;

    const size = ctx.size * (0.3 + data.pressure * 0.7);
    ctx.ctx.beginPath();
    ctx.ctx.arc(data.x, data.y, size / 2, 0, Math.PI * 2);
    ctx.ctx.fillStyle = colorF32ToCss({ ...ctx.color, a: ctx.opacity });
    ctx.ctx.fill();
  }

  onMove(data: PointerData, ctx: ToolContext): void {
    if (!this.drawing) return;
    const size = ctx.size * (0.3 + data.pressure * 0.7);
    ctx.ctx.beginPath();
    ctx.ctx.moveTo(this.lastX, this.lastY);
    ctx.ctx.lineTo(data.x, data.y);
    ctx.ctx.strokeStyle = colorF32ToCss({ ...ctx.color, a: ctx.opacity });
    ctx.ctx.lineWidth = size;
    ctx.ctx.lineCap = 'round';
    ctx.ctx.lineJoin = 'round';
    ctx.ctx.stroke();
    this.lastX = data.x;
    this.lastY = data.y;
  }

  onEnd(_data: PointerData, _ctx: ToolContext): void {
    this.drawing = false;
  }
}
