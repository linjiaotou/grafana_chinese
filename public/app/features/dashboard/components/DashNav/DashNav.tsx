// Libaries
import React, { PureComponent, FC, ReactNode } from 'react';
import { connect, MapDispatchToProps } from 'react-redux';
// Utils & Services
import { appEvents } from 'app/core/app_events';
import { PlaylistSrv } from 'app/features/playlist/playlist_srv';
// Components
import { DashNavButton } from './DashNavButton';
import { DashNavTimeControls } from './DashNavTimeControls';
import { ButtonGroup, ModalsController, ToolbarButton, PageToolbar } from '@grafana/ui';
import { textUtil } from '@grafana/data';
// State
import { updateLocation } from 'app/core/actions';
import { updateTimeZoneForSession } from 'app/features/profile/state/reducers';
// Types
import { DashboardModel } from '../../state';
import { CoreEvents, StoreState } from 'app/types';
import { ShareModal } from 'app/features/dashboard/components/ShareModal';
import { SaveDashboardModalProxy } from 'app/features/dashboard/components/SaveDashboard/SaveDashboardModalProxy';

export interface OwnProps {
  dashboard: DashboardModel;
  isFullscreen: boolean;
  $injector: any;
  onAddPanel: () => void;
}

interface DispatchProps {
  updateTimeZoneForSession: typeof updateTimeZoneForSession;
  updateLocation: typeof updateLocation;
}

interface DashNavButtonModel {
  show: (props: Props) => boolean;
  component: FC<Partial<Props>>;
  index?: number | 'end';
}

const customLeftActions: DashNavButtonModel[] = [];
const customRightActions: DashNavButtonModel[] = [];

export function addCustomLeftAction(content: DashNavButtonModel) {
  customLeftActions.push(content);
}

export function addCustomRightAction(content: DashNavButtonModel) {
  customRightActions.push(content);
}

export interface StateProps {
  location: any;
}

type Props = StateProps & OwnProps & DispatchProps;

class DashNav extends PureComponent<Props> {
  playlistSrv: PlaylistSrv;

  constructor(props: Props) {
    super(props);
    this.playlistSrv = this.props.$injector.get('playlistSrv');
  }

  onFolderNameClick = () => {
    this.props.updateLocation({
      query: { search: 'open', folder: 'current' },
      partial: true,
    });
  };

  onClose = () => {
    this.props.updateLocation({
      query: { viewPanel: null },
      partial: true,
    });
  };

  onToggleTVMode = () => {
    appEvents.emit(CoreEvents.toggleKioskMode);
  };

  onOpenSettings = () => {
    this.props.updateLocation({
      query: { editview: 'settings' },
      partial: true,
    });
  };

  onStarDashboard = () => {
    const { dashboard, $injector } = this.props;
    const dashboardSrv = $injector.get('dashboardSrv');

    dashboardSrv.starDashboard(dashboard.id, dashboard.meta.isStarred).then((newState: any) => {
      dashboard.meta.isStarred = newState;
      this.forceUpdate();
    });
  };

  onPlaylistPrev = () => {
    this.playlistSrv.prev();
  };

  onPlaylistNext = () => {
    this.playlistSrv.next();
  };

  onPlaylistStop = () => {
    this.playlistSrv.stop();
    this.forceUpdate();
  };

  onDashboardNameClick = () => {
    this.props.updateLocation({
      query: { search: 'open' },
      partial: true,
    });
  };

  addCustomContent(actions: DashNavButtonModel[], buttons: ReactNode[]) {
    actions.map((action, index) => {
      const Component = action.component;
      const element = <Component {...this.props} key={`button-custom-${index}`} />;
      typeof action.index === 'number' ? buttons.splice(action.index, 0, element) : buttons.push(element);
    });
  }

  isInKioskMode() {
    return !!this.props.location.query.kiosk;
  }

  isPlaylistRunning() {
    return this.playlistSrv.isPlaying;
  }

  renderLeftActionsButton() {
    const { dashboard } = this.props;
    const { canStar, canShare, isStarred } = dashboard.meta;
    const buttons: ReactNode[] = [];

    if (this.isInKioskMode() || this.isPlaylistRunning()) {
      return [];
    }

    if (canStar) {
      buttons.push(
        <DashNavButton
          tooltip="标记为收藏"
          icon={isStarred ? 'favorite' : 'star'}
          iconType={isStarred ? 'mono' : 'default'}
          iconSize="lg"
          onClick={this.onStarDashboard}
          key="button-star"
        />
      );
    }

    if (canShare) {
      buttons.push(
        <ModalsController key="button-share">
          {({ showModal, hideModal }) => (
            <DashNavButton
              tooltip="分享仪表盘或者面板"
              icon="share-alt"
              iconSize="lg"
              onClick={() => {
                showModal(ShareModal, {
                  dashboard,
                  onDismiss: hideModal,
                });
              }}
            />
          )}
        </ModalsController>
      );
    }

    this.addCustomContent(customLeftActions, buttons);
    return buttons;
  }

  renderPlaylistControls() {
    return (
      <ButtonGroup key="playlist-buttons">
        <ToolbarButton tooltip="访问上一个仪表盘" icon="backward" onClick={this.onPlaylistPrev} narrow />
        <ToolbarButton onClick={this.onPlaylistStop}>停止播放列表</ToolbarButton>
        <ToolbarButton tooltip="访问下一个仪表盘" icon="forward" onClick={this.onPlaylistNext} narrow />
      </ButtonGroup>
    );
  }

  renderRightActionsButton() {
    const { dashboard, onAddPanel, location, updateTimeZoneForSession, isFullscreen } = this.props;
    const { canEdit, showSettings } = dashboard.meta;
    const { snapshot } = dashboard;
    const snapshotUrl = snapshot && snapshot.originalUrl;
    const buttons: ReactNode[] = [];
    const tvButton = (
      <ToolbarButton tooltip="循环查看模式" icon="monitor" onClick={this.onToggleTVMode} key="tv-button" />
    );

    let timeControls: React.ReactNode | null;

    if (!dashboard.timepicker.hidden) {
      timeControls = (
        <DashNavTimeControls
          dashboard={dashboard}
          location={location}
          onChangeTimeZone={updateTimeZoneForSession}
          key="time-controls"
        />
      );
    }

    if (this.isPlaylistRunning()) {
      return [this.renderPlaylistControls(), timeControls];
    }

    if (this.isInKioskMode()) {
      return [timeControls, tvButton];
    }

    if (canEdit && !isFullscreen) {
      buttons.push(<ToolbarButton tooltip="添加面板" icon="panel-add" onClick={onAddPanel} key="button-panel-add" />);
      buttons.push(
        <ModalsController key="button-save">
          {({ showModal, hideModal }) => (
            <ToolbarButton
              tooltip="保存仪表盘"
              icon="save"
              onClick={() => {
                showModal(SaveDashboardModalProxy, {
                  dashboard,
                  onDismiss: hideModal,
                });
              }}
            />
          )}
        </ModalsController>
      );
    }

    if (snapshotUrl) {
      buttons.push(
        <ToolbarButton
          tooltip="打开原来的仪表盘"
          onClick={() => this.gotoSnapshotOrigin(snapshotUrl)}
          icon="link"
          key="button-snapshot"
        />
      );
    }

    if (showSettings) {
      buttons.push(
        <ToolbarButton tooltip="仪表盘设置" icon="cog" onClick={this.onOpenSettings} key="button-settings" />
      );
    }

    this.addCustomContent(customRightActions, buttons);
    buttons.push(timeControls);
    buttons.push(tvButton);
    return buttons;
  }

  gotoSnapshotOrigin(snapshotUrl: string) {
    window.location.href = textUtil.sanitizeUrl(snapshotUrl);
  }

  render() {
    const { dashboard, isFullscreen } = this.props;
    const onGoBack = isFullscreen ? this.onClose : undefined;

    return (
      <PageToolbar
        pageIcon={isFullscreen ? undefined : 'apps'}
        title={dashboard.title}
        parent={dashboard.meta.folderTitle}
        onClickTitle={this.onDashboardNameClick}
        onClickParent={this.onFolderNameClick}
        onGoBack={onGoBack}
        leftItems={this.renderLeftActionsButton()}
      >
        {this.renderRightActionsButton()}
      </PageToolbar>
    );
  }
}

const mapStateToProps = (state: StoreState) => ({
  location: state.location,
});

const mapDispatchToProps: MapDispatchToProps<DispatchProps, OwnProps> = {
  updateLocation,
  updateTimeZoneForSession,
};

export default connect(mapStateToProps, mapDispatchToProps)(DashNav);
