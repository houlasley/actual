import { send } from '@actual-app/core/platform/client/connection';
import type { HoldingView } from '@actual-app/core/server/securities/app';
import type {
  AccountEntity,
  SecurityEntity,
  SecurityPriceEntity,
} from '@actual-app/core/types/models';
import { queryOptions } from '@tanstack/react-query';

export const securitiesQueries = {
  all: () => ['securities'],
  lists: () => [...securitiesQueries.all(), 'lists'],
  list: () =>
    queryOptions<SecurityEntity[]>({
      queryKey: [...securitiesQueries.lists()],
      queryFn: async () => {
        const securities: SecurityEntity[] = await send('securities-get');
        return securities;
      },
      placeholderData: [],
      // Manually invalidated when securities change
      staleTime: Infinity,
    }),
  holdings: (accountId: AccountEntity['id']) =>
    queryOptions<HoldingView[]>({
      queryKey: [...securitiesQueries.all(), 'holdings', accountId],
      queryFn: async () => {
        const holdings: HoldingView[] = await send('holdings-get', {
          accountId,
        });
        return holdings;
      },
      placeholderData: [],
      staleTime: Infinity,
    }),
  prices: (securityId: SecurityEntity['id']) =>
    queryOptions<SecurityPriceEntity[]>({
      queryKey: [...securitiesQueries.all(), 'prices', securityId],
      queryFn: async () => {
        const prices: SecurityPriceEntity[] = await send(
          'security-prices-get',
          {
            security: securityId,
          },
        );
        return prices;
      },
      placeholderData: [],
      staleTime: Infinity,
    }),
};
