import { getBackendSrv } from '@grafana/runtime';

export interface ServerStat {
  name: string;
  value: number;
}

export const getServerStats = async (): Promise<ServerStat[]> => {
  try {
    const res = await getBackendSrv().get('api/admin/stats');
    return [
      { name: '用户总数量', value: res.users },
      { name: '管理员总数量', value: res.admins },
      { name: '编辑者总数量', value: res.editors },
      { name: '浏览者总数量', value: res.viewers },
      { name: '活跃用户数量 (过去30天)', value: res.activeUsers },
      { name: '活跃的管理员数量 (过去30天)', value: res.activeAdmins },
      { name: '活跃的编辑者数量 (过去30天)', value: res.activeEditors },
      { name: '活跃的浏览者数量 (过去30天)', value: res.activeViewers },
      { name: '活跃的会话数量', value: res.activeSessions },
      { name: '仪表盘总数量', value: res.dashboards },
      { name: '组织总数量', value: res.orgs },
      { name: '播放列表总数量', value: res.playlists },
      { name: '快照总数量', value: res.snapshots },
      { name: '仪表盘标签总数量', value: res.tags },
      { name: '星标仪表盘总数量', value: res.stars },
      { name: '预警总数量', value: res.alerts },
    ];
  } catch (error) {
    console.error(error);
    throw error;
  }
};
