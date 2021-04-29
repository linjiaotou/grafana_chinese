import React, { FC } from 'react';
import { InlineFormLabel, LegacyForms } from '@grafana/ui';
import { selectors } from '@grafana/e2e-selectors';

const { Input, Switch } = LegacyForms;

export interface Props {
  dataSourceName: string;
  isDefault: boolean;
  onNameChange: (name: string) => void;
  onDefaultChange: (value: boolean) => void;
}

const BasicSettings: FC<Props> = ({ dataSourceName, isDefault, onDefaultChange, onNameChange }) => {
  return (
    <div className="gf-form-group" aria-label="Datasource settings page basic settings">
      <div className="gf-form-inline">
        <div className="gf-form max-width-30" style={{ marginRight: '3px' }}>
          <InlineFormLabel
            tooltip={
              '在面板中选择数据源时使用该名称， 默认的数据源在新面板中预先选择。'
            }
          >
            名称
          </InlineFormLabel>
          <Input
            className="gf-form-input max-width-23"
            type="text"
            value={dataSourceName}
            placeholder="Name"
            onChange={(event) => onNameChange(event.target.value)}
            required
            aria-label={selectors.pages.DataSource.name}
          />
        </div>
        <Switch
          label="默认"
          checked={isDefault}
          onChange={(event) => {
            // @ts-ignore
            onDefaultChange(event.target.checked);
          }}
        />
      </div>
    </div>
  );
};

export default BasicSettings;
