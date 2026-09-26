export const regions = [
  { id: 'all', name: '全部地区' },
  { id: 'beijing', name: '北京' },
  { id: 'shanghai', name: '上海' },
  { id: 'guangdong', name: '广东' },
  { id: 'jiangsu', name: '江苏' },
  { id: 'zhejiang', name: '浙江' },
  { id: 'sichuan', name: '四川' },
  { id: 'hubei', name: '湖北' },
  { id: 'hunan', name: '湖南' },
  { id: 'shandong', name: '山东' },
  { id: 'henan', name: '河南' },
  { id: 'hebei', name: '河北' },
  { id: 'liaoning', name: '辽宁' },
  { id: 'shaanxi', name: '陕西' },
  { id: 'chongqing', name: '重庆' },
  { id: 'tianjin', name: '天津' }
];


// 机构名单已移到后端（backend/src/data/institutions.js），
// 页面通过 /api/institutions 获取，联系记录持久化在数据库里。

export const serviceTypes = [
  '疼痛管理',
  '症状控制',
  '心理支持',
  '家属辅导',
  '居家宁养',
  '营养支持',
  '康复指导',
  '社工服务',
  '家庭病床'
];
