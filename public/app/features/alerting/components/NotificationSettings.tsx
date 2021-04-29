import React, { FC } from 'react';
import { Checkbox, CollapsableSection, Field, InfoBox, Input } from '@grafana/ui';
import { NotificationSettingsProps } from './NotificationChannelForm';

interface Props extends NotificationSettingsProps {
  imageRendererAvailable: boolean;
}

export const NotificationSettings: FC<Props> = ({ currentFormValues, imageRendererAvailable, register }) => {
  return (
    <CollapsableSection label="通知设置" isOpen={false}>
      <Field>
        <Checkbox name="isDefault" ref={register} label="默认" description="对所有预警使用此通知" />
      </Field>
      <Field>
        <Checkbox
          name="settings.uploadImage"
          ref={register}
          label="包含图片"
          description="捕获图片并将其包含在通知中"
        />
      </Field>
      {currentFormValues.uploadImage && !imageRendererAvailable && (
        <InfoBox title="No image renderer available/installed">
          Grafana cannot find an image renderer to capture an image for the notification. Please make sure the Grafana
          Image Renderer plugin is installed. Please contact your Grafana administrator to install the plugin.
        </InfoBox>
      )}
      <Field>
        <Checkbox
          name="disableResolveMessage"
          ref={register}
          label="禁用解析消息"
          description=" 当预警状态返回false时，禁用发送解析消息[OK]"
        />
      </Field>
      <Field>
        <Checkbox
          name="sendReminder"
          ref={register}
          label="发送提醒"
          description="为触发的预警发送附加通知"
        />
      </Field>
      {currentFormValues.sendReminder && (
        <>
          <Field
            label="发送每一个提醒"
            description="指定发送提醒的频率, 例如每30s, 1m, 10m, 30m 或者 1h 等等。
            在计算规则之后发送预警提醒。因此，发送提醒的间隔不会比配置的预警规则计算间隔更短。"
          >
            <Input name="frequency" ref={register} width={8} />
          </Field>
        </>
      )}
    </CollapsableSection>
  );
};
