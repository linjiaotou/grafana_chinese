import React, { useState } from 'react';
import { SelectableValue, TimeZone } from '@grafana/data';
import { Select, TagsInput, Input, Field, CollapsableSection, RadioButtonGroup } from '@grafana/ui';
import { selectors } from '@grafana/e2e-selectors';
import { FolderPicker } from 'app/core/components/Select/FolderPicker';
import { DashboardModel } from '../../state/DashboardModel';
import { DeleteDashboardButton } from '../DeleteDashboard/DeleteDashboardButton';
import { TimePickerSettings } from './TimePickerSettings';

interface Props {
  dashboard: DashboardModel;
}

const GRAPH_TOOLTIP_OPTIONS = [
  { value: 0, label: '默认' },
  { value: 1, label: '共享十字光标' },
  { value: 2, label: '共享工具提示' },
];

export const GeneralSettings: React.FC<Props> = ({ dashboard }) => {
  const [renderCounter, setRenderCounter] = useState(0);

  const onFolderChange = (folder: { id: number; title: string }) => {
    dashboard.meta.folderId = folder.id;
    dashboard.meta.folderTitle = folder.title;
    dashboard.meta.hasUnsavedFolderChange = true;
  };

  const onBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    dashboard[event.currentTarget.name as 'title' | 'description'] = event.currentTarget.value;
  };

  const onTooltipChange = (graphTooltip: SelectableValue<number>) => {
    dashboard.graphTooltip = graphTooltip.value;
    setRenderCounter(renderCounter + 1);
  };

  const onRefreshIntervalChange = (intervals: string[]) => {
    dashboard.timepicker.refresh_intervals = intervals.filter((i) => i.trim() !== '');
  };

  const onNowDelayChange = (nowDelay: string) => {
    dashboard.timepicker.nowDelay = nowDelay;
  };

  const onHideTimePickerChange = (hide: boolean) => {
    dashboard.timepicker.hidden = hide;
    setRenderCounter(renderCounter + 1);
  };

  const onTimeZoneChange = (timeZone: TimeZone) => {
    dashboard.timezone = timeZone;
    setRenderCounter(renderCounter + 1);
  };

  const onTagsChange = (tags: string[]) => {
    dashboard.tags = tags;
    setRenderCounter(renderCounter + 1);
  };

  const onEditableChange = (value: boolean) => {
    dashboard.editable = value;
    setRenderCounter(renderCounter + 1);
  };

  const editableOptions = [
    { label: '可编辑', value: true },
    { label: '只读', value: false },
  ];

  return (
    <div style={{ maxWidth: '600px' }}>
      <h3 className="dashboard-settings__header" aria-label={selectors.pages.Dashboard.Settings.General.title}>
        通用
      </h3>
      <div className="gf-form-group">
        <Field label="名称">
          <Input name="title" onBlur={onBlur} defaultValue={dashboard.title} />
        </Field>
        <Field label="描述">
          <Input name="description" onBlur={onBlur} defaultValue={dashboard.description} />
        </Field>
        <Field label="标签">
          <TagsInput tags={dashboard.tags} onChange={onTagsChange} />
        </Field>
        <Field label="文件夹">
          <FolderPicker
            initialTitle={dashboard.meta.folderTitle}
            initialFolderId={dashboard.meta.folderId}
            onChange={onFolderChange}
            enableCreateNew={true}
            dashboardId={dashboard.id}
          />
        </Field>

        <Field
          label="可编辑"
          description="设置为只读以禁用所有编辑。重新加载仪表盘以使更改生效"
        >
          <RadioButtonGroup value={dashboard.editable} options={editableOptions} onChange={onEditableChange} />
        </Field>
      </div>

      <TimePickerSettings
        onTimeZoneChange={onTimeZoneChange}
        onRefreshIntervalChange={onRefreshIntervalChange}
        onNowDelayChange={onNowDelayChange}
        onHideTimePickerChange={onHideTimePickerChange}
        refreshIntervals={dashboard.timepicker.refresh_intervals}
        timePickerHidden={dashboard.timepicker.hidden}
        nowDelay={dashboard.timepicker.nowDelay}
        timezone={dashboard.timezone}
      />

      <CollapsableSection label="面板选项" isOpen={true}>
        <Field
          label="图表工具提示"
          description="控件工具提示和悬停高亮显示不同面板的行为"
        >
          <Select
            onChange={onTooltipChange}
            options={GRAPH_TOOLTIP_OPTIONS}
            width={40}
            value={dashboard.graphTooltip}
          />
        </Field>
      </CollapsableSection>

      <div className="gf-form-button-row">
        {dashboard.meta.canSave && <DeleteDashboardButton dashboard={dashboard} />}
      </div>
    </div>
  );
};
