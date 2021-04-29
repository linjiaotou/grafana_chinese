import { DataFrame, FieldConfigSource, PanelPlugin } from '@grafana/data';

export interface PanelEditorTab {
  id: string;
  text: string;
  active: boolean;
  icon: string;
}

export enum PanelEditorTabId {
  Query = 'query',
  Transform = 'transform',
  Visualize = 'visualize',
  Alert = 'alert',
}

export enum DisplayMode {
  Fill = 0,
  Fit = 1,
  Exact = 2,
}

export const displayModes = [
  { value: DisplayMode.Fill, label: '填充', description: '使用所有可用空间' },
  { value: DisplayMode.Fit, label: '适合', description: '适合空间保持率' },
  { value: DisplayMode.Exact, label: '精确', description: '和仪表盘一样大' },
];

/** @internal */
export interface Props {
  plugin: PanelPlugin;
  config: FieldConfigSource;
  onChange: (config: FieldConfigSource) => void;
  /* Helpful for IntelliSense */
  data: DataFrame[];
}
