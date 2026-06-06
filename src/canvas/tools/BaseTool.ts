import type { ColorF32 } from '../../utils/color.ts';

export interface PointerData {
  x: number;
  y: number;
  pressure: number;   // 0.0 – 1.0
  pointerType: string; // 'mouse' | 'pen' | 'touch'
}

export interface ToolContext {
  ctx: CanvasRenderingContext2D;
  color: ColorF32;
  size: number;     // px
  opacity: number;  // 0.0 – 1.0
}

export abstract class BaseTool {
  abstract readonly id: string;
  abstract readonly label: string;
  abstract readonly cursor: string;

  abstract onStart(data: PointerData, ctx: ToolContext): void;
  abstract onMove(data: PointerData, ctx: ToolContext): void;
  abstract onEnd(data: PointerData, ctx: ToolContext): void;
}
