import { FolderDTO } from 'app/types';
import { NavModelItem, NavModel } from '@grafana/data';

export function buildNavModel(folder: FolderDTO): NavModelItem {
  const model = {
    icon: 'folder',
    id: 'manage-folder',
    subTitle: 'Manage folder dashboards & permissions',
    url: '',
    text: folder.title,
    breadcrumbs: [{ title: '仪表盘', url: 'dashboards' }],
    children: [
      {
        active: false,
        icon: 'apps',
        id: `folder-dashboards-${folder.uid}`,
        text: '仪表盘',
        url: folder.url,
      },
    ],
  };

  if (folder.canAdmin) {
    model.children.push({
      active: false,
      icon: 'lock',
      id: `folder-permissions-${folder.uid}`,
      text: 'Permissions',
      url: `${folder.url}/permissions`,
    });
  }

  if (folder.canSave) {
    model.children.push({
      active: false,
      icon: 'cog',
      id: `folder-settings-${folder.uid}`,
      text: 'Settings',
      url: `${folder.url}/settings`,
    });
  }

  return model;
}

export function getLoadingNav(tabIndex: number): NavModel {
  const main = buildNavModel({
    id: 1,
    uid: 'loading',
    title: 'Loading',
    url: 'url',
    canSave: true,
    canEdit: true,
    canAdmin: true,
    version: 0,
  });

  main.children![tabIndex].active = true;

  return {
    main: main,
    node: main.children![tabIndex],
  };
}
