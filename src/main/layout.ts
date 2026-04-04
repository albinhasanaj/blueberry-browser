export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const TOP_BAR_HEIGHT = 88;
export const SIDE_BAR_WIDTH = 400;
export const DEFAULT_WINDOW_TITLE = "Blueberry Browser";

export function getTopBarBounds(bounds: ViewBounds): ViewBounds {
  return {
    x: 0,
    y: 0,
    width: bounds.width,
    height: TOP_BAR_HEIGHT,
  };
}

export function getSidebarBounds(bounds: ViewBounds): ViewBounds {
  return {
    x: bounds.width - SIDE_BAR_WIDTH,
    y: TOP_BAR_HEIGHT,
    width: SIDE_BAR_WIDTH,
    height: bounds.height - TOP_BAR_HEIGHT,
  };
}

export function getTabBounds(
  bounds: ViewBounds,
  isSidebarVisible: boolean,
): ViewBounds {
  const sidebarWidth = isSidebarVisible ? SIDE_BAR_WIDTH : 0;

  return {
    x: 0,
    y: TOP_BAR_HEIGHT,
    width: bounds.width - sidebarWidth,
    height: bounds.height - TOP_BAR_HEIGHT,
  };
}

export function getHiddenBounds(): ViewBounds {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
}
