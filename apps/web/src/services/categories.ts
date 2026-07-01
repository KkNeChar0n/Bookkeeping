import type { Categories } from '../api/types';

// 收支分类起步清单（可扩展）
export const CATEGORIES: Categories = {
  income: ['工资', '报销', '利息', '投资收益', '其他'],
  expense: ['餐饮', '房租', '交通', '购物', '医疗', '其他'],
};

export const categoriesService = {
  async get(): Promise<Categories> {
    return CATEGORIES;
  },
};
