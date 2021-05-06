import _ from 'lodash';
import { QueryPartDef, QueryPart } from 'app/core/components/query_part/query_part';

const alertQueryDef = new QueryPartDef({
  type: 'query',
  params: [
    { name: 'queryRefId', type: 'string', dynamicLookup: true },
    {
      name: 'from',
      type: 'string',
      options: ['10s', '1m', '5m', '10m', '15m', '1h', '2h', '6h', '12h', '24h', '48h'],
    },
    { name: 'to', type: 'string', options: ['now', 'now-1m', 'now-5m', 'now-10m', 'now-1h'] },
  ],
  defaultParams: ['#A', '15m', 'now', 'avg'],
});

const conditionTypes = [{ text: '查询', value: 'query' }];

const alertStateSortScore = {
  alerting: 1,
  no_data: 2,
  pending: 3,
  ok: 4,
  paused: 5,
};

const evalFunctions = [
  { text: '是否大于', value: 'gt' },
  { text: '是否小于', value: 'lt' },
  { text: '是否超出范围', value: 'outside_range' },
  { text: '是否在范围内', value: 'within_range' },
  { text: '没有值', value: 'no_value' },
];

const evalOperators = [
  { text: '或者', value: 'or' },
  { text: '并且', value: 'and' },
];

const reducerTypes = [
  { text: '平均()', value: 'avg' },
  { text: '最小值()', value: 'min' },
  { text: '最大值()', value: 'max' },
  { text: '求和()', value: 'sum' },
  { text: '计数()', value: 'count' },
  { text: '最近的()', value: 'last' },
  { text: '中间值()', value: 'median' },
  { text: '比较差异()', value: 'diff' },
  { text: '比较绝对差异()', value: 'diff_abs' },
  { text: '比较百分比差异()', value: 'percent_diff' },
  { text: '比较百分比绝对差异()', value: 'percent_diff_abs' },
  { text: '统计不是null的数量', value: 'count_non_null' },
];

const noDataModes = [
  { text: '预警中', value: 'alerting' },
  { text: '没有数据', value: 'no_data' },
  { text: '保持上次的状态', value: 'keep_state' },
  { text: '良好', value: 'ok' },
];

const executionErrorModes = [
  { text: '预警中', value: 'alerting' },
  { text: '保持上次的状态', value: 'keep_state' },
];

function createReducerPart(model: any) {
  const def = new QueryPartDef({ type: model.type, defaultParams: [] });
  return new QueryPart(model, def);
}

function getStateDisplayModel(state: string) {
  switch (state) {
    case 'ok': {
      return {
        text: '良好',
        iconClass: 'heart',
        stateClass: 'alert-state-ok',
      };
    }
    case 'alerting': {
      return {
        text: '预警中',
        iconClass: 'heart-break',
        stateClass: 'alert-state-critical',
      };
    }
    case 'no_data': {
      return {
        text: '没有数据',
        iconClass: 'question-circle',
        stateClass: 'alert-state-warning',
      };
    }
    case 'paused': {
      return {
        text: '已暂停',
        iconClass: 'pause',
        stateClass: 'alert-state-paused',
      };
    }
    case 'pending': {
      return {
        text: '挂起',
        iconClass: 'exclamation-triangle',
        stateClass: 'alert-state-warning',
      };
    }
    case 'unknown': {
      return {
        text: '未知状态',
        iconClass: 'question-circle',
        stateClass: 'alert-state-paused',
      };
    }
  }

  throw { message: '未知的预警状态' };
}

function joinEvalMatches(matches: any, separator: string) {
  return _.reduce(
    matches,
    (res, ev) => {
      if (ev.metric !== undefined && ev.value !== undefined) {
        res.push(ev.metric + '=' + ev.value);
      }

      // For backwards compatibility . Should be be able to remove this after ~2017-06-01
      if (ev.Metric !== undefined && ev.Value !== undefined) {
        res.push(ev.Metric + '=' + ev.Value);
      }

      return res;
    },
    [] as string[]
  ).join(separator);
}

function getAlertAnnotationInfo(ah: any) {
  // backward compatibility, can be removed in grafana 5.x
  // old way stored evalMatches in data property directly,
  // new way stores it in evalMatches property on new data object

  if (_.isArray(ah.data)) {
    return joinEvalMatches(ah.data, ', ');
  } else if (_.isArray(ah.data.evalMatches)) {
    return joinEvalMatches(ah.data.evalMatches, ', ');
  }

  if (ah.data.error) {
    return 'Error: ' + ah.data.error;
  }

  return '';
}

export default {
  alertQueryDef: alertQueryDef,
  getStateDisplayModel: getStateDisplayModel,
  conditionTypes: conditionTypes,
  evalFunctions: evalFunctions,
  evalOperators: evalOperators,
  noDataModes: noDataModes,
  executionErrorModes: executionErrorModes,
  reducerTypes: reducerTypes,
  createReducerPart: createReducerPart,
  getAlertAnnotationInfo: getAlertAnnotationInfo,
  alertStateSortScore: alertStateSortScore,
};
