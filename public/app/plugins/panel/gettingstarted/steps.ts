import { getDatasourceSrv } from 'app/features/plugins/datasource_srv';
import { getBackendSrv } from 'app/core/services/backend_srv';
import store from 'app/core/store';
import { SetupStep } from './types';

// const step1TutorialTitle = 'Grafana fundamentals';
const step1TutorialTitle = 'Grafana 基础';
const step2TutorialTitle = 'Create users and teams';
const keyPrefix = 'getting.started.';
const step1Key = `${keyPrefix}${step1TutorialTitle.replace(' ', '-').trim().toLowerCase()}`;
const step2Key = `${keyPrefix}${step2TutorialTitle.replace(' ', '-').trim().toLowerCase()}`;

export const getSteps = (): SetupStep[] => [
  {
    heading: 'Welcome to Grafana',
    subheading: 'The steps below will guide you to quickly finish setting up your Grafana installation.',
    title: '基础',
    // info: 'The steps below will guide you to quickly finish setting up your Grafana installation.',
    info: '下面的步骤将会引导您快速的完成Grafana安装与设置。',
    done: false,
    cards: [
      {
        type: 'tutorial',
        heading: '数据源与仪表盘',
        title: step1TutorialTitle,
        info:
          // 'Set up and understand Grafana if you have no prior experience. This tutorial guides you through the entire process and covers the “Data source” and “Dashboards” steps to the right.',
          '如果您没有相关经验，请建立并理解Grafana。本教程将指导您完成整个过程，并给您正确的介绍“数据源”和“仪表盘”相关步骤。',
        href: 'https://grafana.com/tutorials/grafana-fundamentals',
        icon: 'grafana',
        check: () => Promise.resolve(store.get(step1Key)),
        key: step1Key,
        done: false,
      },
      {
        type: 'docs',
        title: '添加您的第一个数据源',
        heading: '数据源',
        icon: 'database',
        learnHref: 'https://grafana.com/docs/grafana/latest/features/datasources/add-a-data-source',
        href: 'datasources/new',
        check: () => {
          return new Promise((resolve) => {
            resolve(
              getDatasourceSrv()
                .getMetricSources()
                .filter((item) => {
                  return item.meta.builtIn !== true;
                }).length > 0
            );
          });
        },
        done: false,
      },
      {
        type: 'docs',
        heading: '仪表盘',
        title: '创建您的第一个仪表盘',
        icon: 'apps',
        href: 'dashboard/new',
        learnHref: 'https://grafana.com/docs/grafana/latest/guides/getting_started/#create-a-dashboard',
        check: async () => {
          const result = await getBackendSrv().search({ limit: 1 });
          return result.length > 0;
        },
        done: false,
      },
    ],
  },
  {
    heading: '设置完成!',
    subheading:
      'All necessary steps to use Grafana are done. Now tackle advanced steps or make the best use of this home dashboard – it is, after all, a fully customizable dashboard – and remove this panel.',
    title: '高级',
    // info: ' Manage your users and teams and add plugins. These steps are optional',
    info: ' 可以根据以下步骤，管理您的用户和团队以及添加插件。',
    done: false,
    cards: [
      {
        type: 'tutorial',
        heading: '用户',
        title: '创建团队与用户',
        // info: 'Learn to organize your users in teams and manage resource access and roles.',
        info: '学习组织您团队中的用户，并且管理资源访问和角色。',
        href: 'https://grafana.com/tutorials/create-users-and-teams',
        icon: 'users-alt',
        key: step2Key,
        check: () => Promise.resolve(store.get(step2Key)),
        done: false,
      },
      {
        type: 'docs',
        heading: '插件',
        title: '查找并安装插件',
        learnHref: 'https://grafana.com/docs/grafana/latest/plugins/installation',
        href: 'plugins',
        icon: 'plug',
        check: async () => {
          const plugins = await getBackendSrv().get('/api/plugins', { embedded: 0, core: 0 });
          return Promise.resolve(plugins.length > 0);
        },
        done: false,
      },
    ],
  },
];
