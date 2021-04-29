import React, { FC } from 'react';
import config from 'app/core/config';
import { UserDTO } from 'app/types';
import { Button, LinkButton, Form, Field, Input, HorizontalGroup } from '@grafana/ui';
import { ChangePasswordFields } from 'app/core/utils/UserProvider';
import { css } from 'emotion';

export interface Props {
  user: UserDTO;
  isSaving: boolean;
  onChangePassword: (payload: ChangePasswordFields) => void;
}

export const ChangePasswordForm: FC<Props> = ({ user, onChangePassword, isSaving }) => {
  const { ldapEnabled, authProxyEnabled, disableLoginForm } = config;
  const authSource = user.authLabels?.length && user.authLabels[0];

  if (ldapEnabled || authProxyEnabled) {
    return <p>You cannot change password when ldap or auth proxy authentication is enabled.</p>;
  }
  if (authSource && disableLoginForm) {
    return <p>Password cannot be changed here!</p>;
  }

  return (
    <div
      className={css`
        max-width: 400px;
      `}
    >
      <Form onSubmit={onChangePassword}>
        {({ register, errors, getValues }) => {
          return (
            <>
              <Field label="旧密码" invalid={!!errors.oldPassword} error={errors?.oldPassword?.message}>
                <Input type="password" name="oldPassword" ref={register({ required: '需要使用旧密码' })} />
              </Field>

              <Field label="新密码" invalid={!!errors.newPassword} error={errors?.newPassword?.message}>
                <Input
                  type="password"
                  name="newPassword"
                  ref={register({
                    required: '需要新密码',
                    validate: {
                      confirm: (v) => v === getValues().confirmNew || 'Passwords must match',
                      old: (v) => v !== getValues().oldPassword || `New password can't be the same as the old one.`,
                    },
                  })}
                />
              </Field>

              <Field label="确认密码" invalid={!!errors.confirmNew} error={errors?.confirmNew?.message}>
                <Input
                  type="password"
                  name="confirmNew"
                  ref={register({
                    required: '需要确认新密码',
                    validate: (v) => v === getValues().newPassword || '密码必须匹配',
                  })}
                />
              </Field>
              <HorizontalGroup>
                <Button variant="primary" disabled={isSaving}>
                  修改密码
                </Button>
                <LinkButton variant="secondary" href={`${config.appSubUrl}/profile`}>
                  取消
                </LinkButton>
              </HorizontalGroup>
            </>
          );
        }}
      </Form>
    </div>
  );
};
