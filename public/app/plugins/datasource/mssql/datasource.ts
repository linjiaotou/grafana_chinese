import _ from 'lodash';
import { Observable, of } from 'rxjs';
import { catchError, map, mapTo } from 'rxjs/operators';
import { getBackendSrv } from '@grafana/runtime';
import { ScopedVars } from '@grafana/data';

import ResponseParser, { MssqlResponse } from './response_parser';
import { getTemplateSrv, TemplateSrv } from 'app/features/templating/template_srv';
import { getTimeSrv, TimeSrv } from 'app/features/dashboard/services/TimeSrv';
import { MssqlQueryForInterpolation } from './types';

export class MssqlDatasource {
  id: any;
  name: any;
  responseParser: ResponseParser;
  interval: string;

  constructor(
    instanceSettings: any,
    private readonly templateSrv: TemplateSrv = getTemplateSrv(),
    private readonly timeSrv: TimeSrv = getTimeSrv()
  ) {
    this.name = instanceSettings.name;
    this.id = instanceSettings.id;
    this.responseParser = new ResponseParser();
    this.interval = (instanceSettings.jsonData || {}).timeInterval || '1m';
  }

  interpolateVariable(value: any, variable: any) {
    if (typeof value === 'string') {
      if (variable.multi || variable.includeAll) {
        return "'" + value.replace(/'/g, `''`) + "'";
      } else {
        return value;
      }
    }

    if (typeof value === 'number') {
      return value;
    }

    const quotedValues = _.map(value, (val) => {
      if (typeof value === 'number') {
        return value;
      }

      return "'" + val.replace(/'/g, `''`) + "'";
    });
    return quotedValues.join(',');
  }

  interpolateVariablesInQueries(
    queries: MssqlQueryForInterpolation[],
    scopedVars: ScopedVars
  ): MssqlQueryForInterpolation[] {
    let expandedQueries = queries;
    if (queries && queries.length > 0) {
      expandedQueries = queries.map((query) => {
        const expandedQuery = {
          ...query,
          datasource: this.name,
          rawSql: this.templateSrv.replace(query.rawSql, scopedVars, this.interpolateVariable),
          rawQuery: true,
        };
        return expandedQuery;
      });
    }
    return expandedQueries;
  }

  query(options: any): Observable<MssqlResponse> {
    const queries = _.filter(options.targets, (item) => {
      return item.hide !== true;
    }).map((item) => {
      return {
        refId: item.refId,
        intervalMs: options.intervalMs,
        maxDataPoints: options.maxDataPoints,
        datasourceId: this.id,
        rawSql: this.templateSrv.replace(item.rawSql, options.scopedVars, this.interpolateVariable),
        format: item.format,
      };
    });

    if (queries.length === 0) {
      return of({ data: [] });
    }

    return getBackendSrv()
      .fetch({
        url: '/api/tsdb/query',
        method: 'POST',
        data: {
          from: options.range.from.valueOf().toString(),
          to: options.range.to.valueOf().toString(),
          queries: queries,
        },
      })
      .pipe(map(this.responseParser.processQueryResult));
  }

  annotationQuery(options: any) {
    if (!options.annotation.rawQuery) {
      return Promise.reject({ message: 'Query missing in annotation definition' });
    }

    const query = {
      refId: options.annotation.name,
      datasourceId: this.id,
      rawSql: this.templateSrv.replace(options.annotation.rawQuery, options.scopedVars, this.interpolateVariable),
      format: 'table',
    };

    return getBackendSrv()
      .fetch({
        url: '/api/tsdb/query',
        method: 'POST',
        data: {
          from: options.range.from.valueOf().toString(),
          to: options.range.to.valueOf().toString(),
          queries: [query],
        },
      })
      .pipe(map((data: any) => this.responseParser.transformAnnotationResponse(options, data)))
      .toPromise();
  }

  metricFindQuery(query: string, optionalOptions: { variable: { name: string } }) {
    let refId = 'tempvar';
    if (optionalOptions && optionalOptions.variable && optionalOptions.variable.name) {
      refId = optionalOptions.variable.name;
    }

    const interpolatedQuery = {
      refId: refId,
      datasourceId: this.id,
      rawSql: this.templateSrv.replace(query, {}, this.interpolateVariable),
      format: 'table',
    };

    const range = this.timeSrv.timeRange();
    const data = {
      queries: [interpolatedQuery],
      from: range.from.valueOf().toString(),
      to: range.to.valueOf().toString(),
    };

    return getBackendSrv()
      .fetch({
        url: '/api/tsdb/query',
        method: 'POST',
        data: data,
      })
      .pipe(map((data: any) => this.responseParser.parseMetricFindQueryResult(refId, data)))
      .toPromise();
  }

  testDatasource() {
    return getBackendSrv()
      .fetch({
        url: '/api/tsdb/query',
        method: 'POST',
        data: {
          from: '5m',
          to: 'now',
          queries: [
            {
              refId: 'A',
              intervalMs: 1,
              maxDataPoints: 1,
              datasourceId: this.id,
              rawSql: 'SELECT 1',
              format: 'table',
            },
          ],
        },
      })
      .pipe(
        mapTo({ status: 'success', message: '数据库连接成功' }),
        catchError((err) => {
          console.error(err);
          if (err.data && err.data.message) {
            return of({ status: 'error', message: err.data.message });
          }

          return of({ status: 'error', message: err.status });
        })
      )
      .toPromise();
  }

  targetContainsTemplate(target: any) {
    const rawSql = target.rawSql.replace('$__', '');
    return this.templateSrv.variableExists(rawSql);
  }
}
