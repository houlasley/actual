import { send } from '@actual-app/core/platform/client/connection';
import type {
  InvestmentTransactionEntity,
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
  invalidateQueries(queryClient, [
    ...securitiesQueries.all(),
    'investment-transactions',
  ]);
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

type CreateInvestmentTransactionPayload = Omit<
  InvestmentTransactionEntity,
  'id'
>;

export function useCreateInvestmentTransactionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transaction: CreateInvestmentTransactionPayload) => {
      const created: InvestmentTransactionEntity = await send(
        'investment-transaction-create',
        transaction,
      );
      return created;
    },
    onSuccess: () => invalidateHoldings(queryClient),
    onError: error => {
      console.error('Error creating investment transaction:', error);
    },
  });
}

type UpdateInvestmentTransactionPayload = Partial<InvestmentTransactionEntity> &
  Pick<InvestmentTransactionEntity, 'id'>;

export function useUpdateInvestmentTransactionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transaction: UpdateInvestmentTransactionPayload) => {
      return await send('investment-transaction-update', transaction);
    },
    onSuccess: () => invalidateHoldings(queryClient),
    onError: error => {
      console.error('Error updating investment transaction:', error);
    },
  });
}

type DeleteInvestmentTransactionPayload = {
  id: InvestmentTransactionEntity['id'];
};

export function useDeleteInvestmentTransactionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: DeleteInvestmentTransactionPayload) => {
      return await send('investment-transaction-delete', { id });
    },
    onSuccess: () => invalidateHoldings(queryClient),
    onError: error => {
      console.error('Error deleting investment transaction:', error);
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
