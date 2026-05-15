import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TestProviders } from '#mocks';

import { Accounts } from './Accounts';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

vi.mock('./Account', () => ({
  Account: () => null,
  accountNameStyle: {},
}));

vi.mock('./SecondaryItem', () => ({
  SecondaryItem: () => null,
}));

vi.mock('#accounts', () => ({
  useMoveAccountMutation: () => ({ mutate: vi.fn() }),
  useSyncAndDownloadMutation: () => ({ mutate: vi.fn() }),
}));

vi.mock('#hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: [
      {
        id: 'bank-account-1',
        name: 'Checking',
        bank: 'bank-id',
        closed: false,
        tombstone: false,
      },
    ],
  }),
}));

vi.mock('#hooks/useClosedAccounts', () => ({
  useClosedAccounts: () => ({ data: [] }),
}));

vi.mock('#hooks/useFailedAccounts', () => ({
  useFailedAccounts: () => new Map(),
}));

vi.mock('#hooks/useLocalPref', () => ({
  useLocalPref: () => [false, vi.fn()],
}));

vi.mock('#hooks/useOffBudgetAccounts', () => ({
  useOffBudgetAccounts: () => ({ data: [] }),
}));

vi.mock('#hooks/useOnBudgetAccounts', () => ({
  useOnBudgetAccounts: () => ({ data: [] }),
}));

vi.mock('#hooks/useSyncServerStatus', () => ({
  useSyncServerStatus: () => 'online',
}));

vi.mock('#hooks/useUpdatedAccounts', () => ({
  useUpdatedAccounts: () => [],
}));

vi.mock('#spreadsheet/bindings', () => ({
  allAccountBalance: () => null,
  onBudgetAccountBalance: () => null,
  offBudgetAccountBalance: () => null,
  accountBalance: () => null,
}));

vi.mock('#components/AnimatedRefresh', () => ({
  AnimatedRefresh: () => null,
}));

describe('Accounts sidebar', () => {
  it('displays "Sync all bank accounts" button when bank accounts are connected', () => {
    render(<Accounts />, { wrapper: TestProviders });

    expect(screen.getByText('Sync all bank accounts')).toBeInTheDocument();
  });
});
