declare module 'justified-layout' {
  export interface JustifiedLayoutInputBox {
    width: number;
    height: number;
  }

  export interface JustifiedLayoutConfig {
    containerWidth?: number;
    containerPadding?: number | {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };
    boxSpacing?: number | {
      horizontal?: number;
      vertical?: number;
    };
    targetRowHeight?: number;
    targetRowHeightTolerance?: number;
    maxNumRows?: number;
    forceAspectRatio?: number | false;
    showWidows?: boolean;
    fullWidthBreakoutRowCadence?: number | false;
    widowLayoutStyle?: 'left' | 'center' | 'justify';
  }

  export interface JustifiedLayoutBox {
    aspectRatio: number;
    top: number;
    left: number;
    width: number;
    height: number;
  }

  export interface JustifiedLayoutGeometry {
    containerHeight: number;
    widowCount: number;
    boxes: JustifiedLayoutBox[];
  }

  export default function justifiedLayout(
    input: Array<number | JustifiedLayoutInputBox>,
    config?: JustifiedLayoutConfig,
  ): JustifiedLayoutGeometry;
}
