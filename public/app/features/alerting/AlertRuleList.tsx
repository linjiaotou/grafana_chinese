import React, { PureComponent } from 'react';
import { hot } from 'react-hot-loader';
import { connect, ConnectedProps } from 'react-redux';
import Page from 'app/core/components/Page/Page';
import AlertRuleItem from './AlertRuleItem';
import appEvents from 'app/core/app_events';
import { updateLocation } from 'app/core/actions';
import { getNavModel } from 'app/core/selectors/navModel';
import { AlertDefinition, AlertRule, CoreEvents, StoreState } from 'app/types';
import { getAlertRulesAsync, togglePauseAlertRule } from './state/actions';
import { getAlertRuleItems, getSearchQuery } from './state/selectors';
import { FilterInput } from 'app/core/components/FilterInput/FilterInput';
import { SelectableValue } from '@grafana/data';
import { config } from '@grafana/runtime';
import { setSearchQuery } from './state/reducers';
import { Button, LinkButton, Select, VerticalGroup } from '@grafana/ui';
import { AlertDefinitionItem } from './components/AlertDefinitionItem';

function mapStateToProps(state: StoreState) {
  return {
    navModel: getNavModel(state.navIndex, 'alert-list'),
    alertRules: getAlertRuleItems(state),
    stateFilter: state.location.query.state,
    search: getSearchQuery(state.alertRules),
    isLoading: state.alertRules.isLoading,
    ngAlertDefinitions: state.alertDefinition.alertDefinitions,
  };
}

const mapDispatchToProps = {
  updateLocation,
  getAlertRulesAsync,
  setSearchQuery,
  togglePauseAlertRule,
};

const connector = connect(mapStateToProps, mapDispatchToProps);

interface OwnProps {}

export type Props = OwnProps & ConnectedProps<typeof connector>;

export class AlertRuleListUnconnected extends PureComponent<Props, any> {
  stateFilters = [
    { label: '全部', value: 'all' },
    { label: '良好', value: 'ok' },
    { label: '不太好', value: 'not_ok' },
    { label: '告警中', value: 'alerting' },
    { label: '没有数据', value: 'no_data' },
    { label: '已暂停', value: 'paused' },
    { label: '挂起', value: 'pending' },
  ];

  componentDidMount() {
    this.fetchRules();
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.stateFilter !== this.props.stateFilter) {
      this.fetchRules();
    }
  }

  async fetchRules() {
    await this.props.getAlertRulesAsync({ state: this.getStateFilter() });
  }

  getStateFilter(): string {
    const { stateFilter } = this.props;
    if (stateFilter) {
      return stateFilter.toString();
    }
    return 'all';
  }

  onStateFilterChanged = (option: SelectableValue) => {
    this.props.updateLocation({
      query: { state: option.value },
    });
  };

  onOpenHowTo = () => {
    appEvents.emit(CoreEvents.showModal, {
      src: 'public/app/features/alerting/partials/alert_howto.html',
      modalClass: 'confirm-modal',
      model: {},
    });
  };

  onSearchQueryChange = (value: string) => {
    this.props.setSearchQuery(value);
  };

  onTogglePause = (rule: AlertRule) => {
    this.props.togglePauseAlertRule(rule.id, { paused: rule.state !== 'paused' });
  };

  alertStateFilterOption = ({ text, value }: { text: string; value: string }) => {
    return (
      <option key={value} value={value}>
        {text}
      </option>
    );
  };

  render() {
    const { navModel, alertRules, search, isLoading } = this.props;

    return (
      <Page navModel={navModel}>
        <Page.Contents isLoading={isLoading}>
          <div className="page-action-bar">
            <div className="gf-form gf-form--grow">
              <FilterInput
                labelClassName="gf-form--has-input-icon gf-form--grow"
                inputClassName="gf-form-input"
                placeholder="检索预警"
                value={search}
                onChange={this.onSearchQueryChange}
              />
            </div>
            <div className="gf-form">
              <label className="gf-form-label">状态</label>

              <div className="width-13">
                <Select
                  options={this.stateFilters}
                  onChange={this.onStateFilterChanged}
                  value={this.getStateFilter()}
                />
              </div>
            </div>
            <div className="page-action-bar__spacer" />
            {config.featureToggles.ngalert && (
              <LinkButton variant="primary" href="alerting/new">
                添加NG预警
              </LinkButton>
            )}
            <Button variant="secondary" onClick={this.onOpenHowTo}>
              如何添加预警
            </Button>
          </div>
          <VerticalGroup spacing="none">
            {alertRules.map((rule, index) => {
              // Alert definition has "title" as name property.
              if (rule.hasOwnProperty('name')) {
                return (
                  <AlertRuleItem
                    rule={rule as AlertRule}
                    key={rule.id}
                    search={search}
                    onTogglePause={() => this.onTogglePause(rule as AlertRule)}
                  />
                );
              }
              return (
                <AlertDefinitionItem
                  key={`${rule.id}-${index}`}
                  alertDefinition={rule as AlertDefinition}
                  search={search}
                />
              );
            })}
          </VerticalGroup>
        </Page.Contents>
      </Page>
    );
  }
}

export default hot(module)(connector(AlertRuleListUnconnected));
