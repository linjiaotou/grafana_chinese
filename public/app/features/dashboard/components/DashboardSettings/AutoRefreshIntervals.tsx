import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { Input, defaultIntervals, Field } from '@grafana/ui';

import { getTimeSrv } from '../../services/TimeSrv';

export interface Props {
  refreshIntervals: string[];
  onRefreshIntervalChange: (interval: string[]) => void;
  getIntervalsFunc?: typeof getValidIntervals;
  validateIntervalsFunc?: typeof validateIntervals;
}

export const AutoRefreshIntervals: FC<Props> = ({
  refreshIntervals,
  onRefreshIntervalChange,
  getIntervalsFunc = getValidIntervals,
  validateIntervalsFunc = validateIntervals,
}) => {
  const [intervals, setIntervals] = useState<string[]>(getIntervalsFunc(refreshIntervals ?? defaultIntervals));
  const [invalidIntervalsMessage, setInvalidIntervalsMessage] = useState<string | null>(null);

  useEffect(() => {
    const intervals = getIntervalsFunc(refreshIntervals ?? defaultIntervals);
    setIntervals(intervals);
  }, [refreshIntervals]);

  const intervalsString = useMemo(() => {
    if (!Array.isArray(intervals)) {
      return '';
    }

    return intervals.join(',');
  }, [intervals]);

  const onIntervalsChange = useCallback(
    (event: React.FormEvent<HTMLInputElement>) => {
      const newIntervals = event.currentTarget.value ? event.currentTarget.value.split(',') : [];

      setIntervals(newIntervals);
    },
    [setIntervals]
  );

  const onIntervalsBlur = useCallback(
    (event: React.FormEvent<HTMLInputElement>) => {
      const invalidMessage = validateIntervalsFunc(intervals);

      if (invalidMessage === null) {
        // only refresh dashboard JSON if intervals are valid
        onRefreshIntervalChange(getIntervalsFunc(intervals));
      }

      setInvalidIntervalsMessage(invalidMessage);
    },
    [intervals, onRefreshIntervalChange, setInvalidIntervalsMessage]
  );

  return (
    <Field
      label="自动刷新"
      description="定义在自动刷新下拉菜单中可用的自动刷新间隔"
      error={invalidIntervalsMessage}
      invalid={!!invalidIntervalsMessage}
    >
      <Input
        invalid={!!invalidIntervalsMessage}
        value={intervalsString}
        onChange={onIntervalsChange}
        onBlur={onIntervalsBlur}
      />
    </Field>
  );
};

export const validateIntervals = (
  intervals: string[],
  dependencies: { getTimeSrv: typeof getTimeSrv } = { getTimeSrv }
): string | null => {
  try {
    getValidIntervals(intervals, dependencies);
    return null;
  } catch (err) {
    return err.message;
  }
};

export const getValidIntervals = (
  intervals: string[],
  dependencies: { getTimeSrv: typeof getTimeSrv } = { getTimeSrv }
) => {
  const cleanIntervals = intervals.filter((i) => i.trim() !== '').map((interval) => interval.replace(/\s+/g, ''));
  return [...new Set(dependencies.getTimeSrv().getValidIntervals(cleanIntervals))];
};
