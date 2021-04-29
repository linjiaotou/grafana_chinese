import React, { FC, SyntheticEvent } from 'react';
import { Tooltip, Form, Field, Input, VerticalGroup, Button } from '@grafana/ui';
import { selectors } from '@grafana/e2e-selectors';
import { submitButton } from '../Login/LoginForm';
interface Props {
  onSubmit: (pw: string) => void;
  onSkip?: (event?: SyntheticEvent) => void;
}

interface PasswordDTO {
  newPassword: string;
  confirmNew: string;
}

export const ChangePassword: FC<Props> = ({ onSubmit, onSkip }) => {
  const submit = (passwords: PasswordDTO) => {
    onSubmit(passwords.newPassword);
  };
  return (
    <Form onSubmit={submit}>
      {({ errors, register, getValues }) => (
        <>
          <Field label="新密码" invalid={!!errors.newPassword} error={errors?.newPassword?.message}>
            <Input
              autoFocus
              type="password"
              name="newPassword"
              ref={register({
                required: 'New password required',
              })}
            />
          </Field>
          <Field label="确认密码" invalid={!!errors.confirmNew} error={errors?.confirmNew?.message}>
            <Input
              type="password"
              name="confirmNew"
              ref={register({
                required: 'Confirmed password is required',
                validate: (v) => v === getValues().newPassword || 'Passwords must match!',
              })}
            />
          </Field>
          <VerticalGroup>
            <Button type="submit" className={submitButton}>
              提交
            </Button>

            {onSkip && (
              <Tooltip
                content="如果您选择跳过，在您下次登录时依然会提示修改密码。"
                placement="bottom"
              >
                <Button variant="link" onClick={onSkip} type="button" aria-label={selectors.pages.Login.skip}>
                  跳过
                </Button>
              </Tooltip>
            )}
          </VerticalGroup>
        </>
      )}
    </Form>
  );
};
