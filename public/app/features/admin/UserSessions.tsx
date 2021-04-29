import React, { PureComponent } from 'react';
import { css } from 'emotion';
import { ConfirmButton, ConfirmModal, Button } from '@grafana/ui';
import { UserSession } from 'app/types';

interface Props {
  sessions: UserSession[];

  onSessionRevoke: (id: number) => void;
  onAllSessionsRevoke: () => void;
}

interface State {
  showLogoutModal: boolean;
}

export class UserSessions extends PureComponent<Props, State> {
  state: State = {
    showLogoutModal: false,
  };

  showLogoutConfirmationModal = (show: boolean) => () => {
    this.setState({ showLogoutModal: show });
  };

  onSessionRevoke = (id: number) => {
    return () => {
      this.props.onSessionRevoke(id);
    };
  };

  onAllSessionsRevoke = () => {
    this.setState({ showLogoutModal: false });
    this.props.onAllSessionsRevoke();
  };

  render() {
    const { sessions } = this.props;
    const { showLogoutModal } = this.state;

    const logoutFromAllDevicesClass = css`
      margin-top: 0.8rem;
    `;

    return (
      <>
        <h3 className="page-heading">会话</h3>
        <div className="gf-form-group">
          <div className="gf-form">
            <table className="filter-table form-inline">
              <thead>
                <tr>
                  <th>最后上线</th>
                  <th>登录时间</th>
                  <th>IP地址</th>
                  <th colSpan={2}>浏览器和操作系统</th>
                </tr>
              </thead>
              <tbody>
                {sessions &&
                  sessions.map((session, index) => (
                    <tr key={`${session.id}-${index}`}>
                      <td>{session.isActive ? 'Now' : session.seenAt}</td>
                      <td>{session.createdAt}</td>
                      <td>{session.clientIp}</td>
                      <td>{`${session.browser} on ${session.os} ${session.osVersion}`}</td>
                      <td>
                        <div className="pull-right">
                          <ConfirmButton
                            confirmText="确认退出"
                            confirmVariant="destructive"
                            onConfirm={this.onSessionRevoke(session.id)}
                          >
                            强制退出
                          </ConfirmButton>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className={logoutFromAllDevicesClass}>
            {sessions.length > 0 && (
              <Button variant="secondary" onClick={this.showLogoutConfirmationModal(true)}>
                强制退出所有设备
              </Button>
            )}
            <ConfirmModal
              isOpen={showLogoutModal}
              title="强制退出所有设备"
              body="您确定要从所有设备强制退出吗?"
              confirmText="强制退出"
              onConfirm={this.onAllSessionsRevoke}
              onDismiss={this.showLogoutConfirmationModal(false)}
            />
          </div>
        </div>
      </>
    );
  }
}
