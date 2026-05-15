import type { SecurityEntity } from './security';

export type SecurityPriceEntity = {
  id: string;
  security: SecurityEntity['id'];
  date: string;
  price: number;
};
