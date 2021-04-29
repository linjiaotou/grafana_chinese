import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import { setUsersSearchQuery } from './state/reducers';
import { getInviteesCount, getUsersSearchQuery } from './state/selectors';
import { FilterInput } from 'app/core/components/FilterInput/FilterInput';
import { RadioButtonGroup, LinkButton } from '@grafana/ui';

export interface Props {
  searchQuery: string;
  setUsersSearchQuery: typeof setUsersSearchQuery;
  onShowInvites: () => void;
  pendingInvitesCount: number;
  canInvite: boolean;
  showInvites: boolean;
  externalUserMngLinkUrl: string;
  externalUserMngLinkName: string;
}

export class UsersActionBar extends PureComponent<Props> {
  render() {
    const {
      canInvite,
      externalUserMngLinkName,
      externalUserMngLinkUrl,
      searchQuery,
      pendingInvitesCount,
      setUsersSearchQuery,
      onShowInvites,
      showInvites,
    } = this.props;
    const options = [
      { label: 'Users', value: 'users' },
      { label: `Pending Invites (${pendingInvitesCount})`, value: 'invites' },
    ];

    return (
      <div className="page-action-bar">
        <div className="gf-form gf-form--grow">
          <FilterInput
            labelClassName="gf-form--has-input-icon"
            inputClassName="gf-form-input width-20"
            value={searchQuery}
            onChange={setUsersSearchQuery}
            placeholder="使用账号邮箱或者名称查询用户"
          />
          {pendingInvitesCount > 0 && (
            <div style={{ marginLeft: '1rem' }}>
              <RadioButtonGroup value={showInvites ? '邀请' : '用户列表'} options={options} onChange={onShowInvites} />
            </div>
          )}
          <div className="page-action-bar__spacer" />
          {canInvite && <LinkButton href="org/users/invite">邀请</LinkButton>}
          {externalUserMngLinkUrl && (
            <LinkButton href={externalUserMngLinkUrl} target="_blank" rel="noopener">
              {externalUserMngLinkName}
            </LinkButton>
          )}
        </div>
      </div>
    );
  }
}

function mapStateToProps(state: any) {
  return {
    searchQuery: getUsersSearchQuery(state.users),
    pendingInvitesCount: getInviteesCount(state.users),
    externalUserMngLinkName: state.users.externalUserMngLinkName,
    externalUserMngLinkUrl: state.users.externalUserMngLinkUrl,
    canInvite: state.users.canInvite,
  };
}

const mapDispatchToProps = {
  setUsersSearchQuery,
};

export default connect(mapStateToProps, mapDispatchToProps)(UsersActionBar);
