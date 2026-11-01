import { BaseDrawingTool } from './BaseDrawingTool';
import { TrendlineTool } from './tools/TrendlineTool';
import { RayTool } from './tools/RayTool';
import { InfoLineTool } from './tools/InfoLineTool';
import { HorizontalLineTool } from './tools/HorizontalLineTool';
import { HorizontalRayTool } from './tools/HorizontalRayTool';
import { VerticalLineTool } from './tools/VerticalLineTool';
import { CrossLineTool } from './tools/CrossLineTool';
import { ParallelChannelTool } from './tools/ParallelChannelTool';
import { FibRetracementTool } from './tools/FibRetracementTool';
import { FibExtensionTool } from './tools/FibExtensionTool';
import { RectangleTool } from './tools/RectangleTool';
import { RotatedRectangleTool } from './tools/RotatedRectangleTool';
import { PathTool } from './tools/PathTool';
import { LongPositionTool } from './tools/LongPositionTool';
import { ShortPositionTool } from './tools/ShortPositionTool';
import { AnchoredVWAPTool } from './tools/AnchoredVWAPTool';
import { FixedRangeVolumeProfileTool } from './tools/FixedRangeVolumeProfileTool';
import { AnchoredVolumeProfileTool } from './tools/AnchoredVolumeProfileTool';
import type { DrawingToolType } from './types';

class DrawingToolRegistry {
  private tools = new Map<DrawingToolType, BaseDrawingTool>();

  constructor() {
    this.register(new TrendlineTool());
    this.register(new RayTool());
    this.register(new InfoLineTool());
    this.register(new HorizontalLineTool());
    this.register(new HorizontalRayTool());
    this.register(new VerticalLineTool());
    this.register(new CrossLineTool());
    this.register(new ParallelChannelTool());
    this.register(new FibRetracementTool());
    this.register(new FibExtensionTool());
    this.register(new RectangleTool());
    this.register(new RotatedRectangleTool());
    this.register(new PathTool());
    this.register(new LongPositionTool());
    this.register(new ShortPositionTool());
    this.register(new AnchoredVWAPTool());
    this.register(new FixedRangeVolumeProfileTool());
    this.register(new AnchoredVolumeProfileTool());
  }

  register(tool: BaseDrawingTool): void {
    this.tools.set(tool.id, tool);
  }

  get(type: DrawingToolType): BaseDrawingTool | undefined {
    return this.tools.get(type);
  }

  has(type: DrawingToolType): boolean {
    return this.tools.has(type);
  }

  getAll(): BaseDrawingTool[] {
    return Array.from(this.tools.values());
  }
}

export const drawingRegistry = new DrawingToolRegistry();
