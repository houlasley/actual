import { send } from '@actual-app/core/platform/client/connection';
import type {
  HoldingEntity,
  SecurityEntity,
  SecurityPriceEntity,
} from '@actual-app/core/types/models';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { securitiesQueries } from './queries';

function invalidateQueries(queryClient: QueryClient, queryKey?: QueryKey) {
  void queryClient.invalidateQueries({
    queryKey: queryKey ?? securitiesQueries.lists(),
  });
}

function invalidateHoldings(queryClient: QueryClient) {
  invalidateQueries(queryClient, securitiesQueries.lists());
  invalidateQueries(queryClient, [...securitiesQueries.all(), 'holdings']);
}

type CreateSecurityPayload = {
  ticker: SecurityEntity['ticker'];
  name?: SecurityEntity['name'];
  type?: SecurityEntity['type'];
};

export function useCreateSecurityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ticker, name, type }: CreateSecurityPayload) => {
      const security: SecurityEntity = await send('security-create', {
        ticker,
        name,
        type,
      });
      return security;
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error creating security:', error);
    },
  });
}

type UpdateSecurityPayload = Partial<SecurityEntity> &
  Pick<SecurityEntity, 'id'>;

export function useUpdateSecurityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (security: UpdateSecurityPayload) => {
      return await send('security-update', security);
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error updating security:', error);
    },
  });
}

type DeleteSecurityPayload = {
  id: SecurityEntity['id'];
};

export function useDeleteSecurityMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: DeleteSecurityPayload) => {
      return await send('security-delete', { id });
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error deleting security:', error);
    },
  });
}

type CreateHoldingPayload = {
  account: HoldingEntity['account'];
  security: HoldingEntity['security'];
  shares?: HoldingEntity['shares'];
  cost_basis?: HoldingEntity['cost_basis'];
};

export function useCreateHoldingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      account,
      security,
      shares,
      cost_basis,
    }: CreateHoldingPayload) => {
      const holding: HoldingEntity = await send('holding-create', {
        account,
        security,
        shares,
        cost_basis,
      });
      return holding;
    },
    onSuccess: () => invalidateHoldings(queryClient),
    onError: error => {
      console.error('Error creating holding:', error);
    },
  });
}

type UpdateHoldingPayload = Partial<HoldingEntity> & Pick<HoldingEntity, 'id'>;

export function useUpdateHoldingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (holding: UpdateHoldingPayload) => {
      return await send('holding-update', holding);
    },
    onSuccess: () => invalidateHoldings(queryClient),
    onError: error => {
      console.error('Error updating holding:', error);
    },
  });
}

type DeleteHoldingPayload = {
  id: HoldingEntity['id'];
};

export function useDeleteHoldingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: DeleteHoldingPayload) => {
      return await send('holding-delete', { id });
    },
    onSuccess: () => invalidateHoldings(queryClient),
    onError: error => {
      console.error('Error deleting holding:', error);
    },
  });
}

type SetSecurityPricesPayload = {
  security: SecurityPriceEntity['security'];
  prices: Array<Pick<SecurityPriceEntity, 'date' | 'price'>>;
};

export function useSetSecurityPricesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ security, prices }: SetSecurityPricesPayload) => {
      return await send('security-prices-set', { security, prices });
    },
    onSuccess: (_, { security }) => {
      invalidateHoldings(queryClient);
      invalidateQueries(queryClient, [
        ...securitiesQueries.all(),
        'prices',
        security,
      ]);
    },
    onError: error => {
      console.error('Error setting security prices:', error);
    },
  });
}
