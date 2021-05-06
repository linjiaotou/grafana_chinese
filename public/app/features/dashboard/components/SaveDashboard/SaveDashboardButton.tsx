import React from 'react';
import { Button, ButtonVariant, ModalsController, FullWidthButtonContainer } from '@grafana/ui';
import { DashboardModel } from 'app/features/dashboard/state';
import { SaveDashboardAsModal } from './SaveDashboardAsModal';
import { SaveDashboardModalProxy } from './SaveDashboardModalProxy';
import { selectors } from '@grafana/e2e-selectors';

interface SaveDashboardButtonProps {
  dashboard: DashboardModel;
  onSaveSuccess?: () => void;
}

export const SaveDashboardButton: React.FC<SaveDashboardButtonProps> = ({ dashboard, onSaveSuccess }) => {
  return (
    <ModalsController>
      {({ showModal, hideModal }) => {
        return (
          <Button
            onClick={() => {
              showModal(SaveDashboardModalProxy, {
                dashboard,
                onSaveSuccess,
                onDismiss: hideModal,
              });
            }}
            aria-label={selectors.pages.Dashboard.Settings.General.saveDashBoard}
          >
            保存仪表盘
          </Button>
        );
      }}
    </ModalsController>
  );
};

export const SaveDashboardAsButton: React.FC<SaveDashboardButtonProps & { variant?: ButtonVariant }> = ({
  dashboard,
  onSaveSuccess,
  variant,
}) => {
  return (
    <ModalsController>
      {({ showModal, hideModal }) => {
        return (
          <FullWidthButtonContainer>
            <Button
              onClick={() => {
                showModal(SaveDashboardAsModal, {
                  dashboard,
                  onSaveSuccess,
                  onDismiss: hideModal,
                });
              }}
              variant={variant}
              aria-label={selectors.pages.Dashboard.Settings.General.saveAsDashBoard}
            >
              另存为...
            </Button>
          </FullWidthButtonContainer>
        );
      }}
    </ModalsController>
  );
};
