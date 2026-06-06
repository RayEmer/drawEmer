import { BaseTool, type PointerData, type ToolContext } from './BaseTool.ts';
import { colorF32ToCss } from '../../utils/color.ts';

export class BrushTool extends BaseTool {
  readonly id = 'brush';
  readonly label = 'Pincel';
  readonly cursor = 'crosshair';

  private drawing = false;
  private lastX = 0;
  private lastY = 0;

  onStart(data: PointerData, ctx: ToolContext): void {
    this.drawing = true;
    this.lastX = data.x;
    this.lastY = data.y;
    this.stamp(data, ctx);
  }

  private stamp(data: PointerData, ctx: ToolContext): void {
    const size = ctx.size * (0.5 + data.pressure * 0.5);
    const opacity = ctx.opacity * (0.3 + data.pressure * 0.7);
    const gradient = ctx.ctx.createRadialGradient(
      data.x, data.y, 0,
      data.x, data.y, size,
    );
    gradient.addColorStop(0,   colorF32ToCss({ ...ctx.color, a: opacity }));
    gradient.addColorStop(0.5, colorF32ToCss({ ...ctx.color, a: opacity * 0.5 }));
    gradient.addColorStop(1,   colorF32ToCss({ ...ctx.color, a: 0 }));
    ctx.ctx.beginPath();
    ctx.ctx.arc(data.x, data.y, size, 0, Math.PI * 2);
    ctx.ctx.fillStyle = gradient;
    ctx.ctx.fill();
  }

  onMove(data: PointerData, ctx: ToolContext): void {
    if (!this.drawing) return;
    const dist = Math.hypot(data.x - this.lastX, data.y - this.lastY);
    const step = Math.max(1, ctx.size * 0.12);
    if (dist >= step) {
      this.stamp(data, ctx);
      this.lastX = data.x;
      this.lastY = data.y;
    }
  }

  onEnd(_data: PointerData, _ctx: ToolContext): void {
    this.drawing = false;
  }
}
