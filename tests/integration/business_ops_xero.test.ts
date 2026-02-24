import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerXeroTools } from '../../src/mcp_servers/business_ops/xero_tools.js';

// Mock xero-node
const mockGetInvoices = vi.fn();
const mockCreateInvoices = vi.fn();
const mockGetContacts = vi.fn();
const mockUpdateTenants = vi.fn();
const mockRefreshToken = vi.fn();

vi.mock('xero-node', () => {
  return {
    XeroClient: vi.fn().mockImplementation(() => ({
      readTokenSet: vi.fn().mockReturnValue({
        expired: () => false,
        access_token: 'mock_access_token'
      }),
      setTokenSet: vi.fn(),
      refreshToken: mockRefreshToken,
      accountingApi: {
        getInvoices: mockGetInvoices,
        createInvoices: mockCreateInvoices,
        getContacts: mockGetContacts,
        getReportBalanceSheet: vi.fn().mockResolvedValue({ body: {} }),
        getReportProfitAndLoss: vi.fn().mockResolvedValue({ body: {} })
      },
      updateTenants: mockUpdateTenants
    }))
  };
});

describe('Xero Tools Integration', () => {
  let mockServer: any;
  let registeredTools: Record<string, Function> = {};
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.XERO_CLIENT_ID = 'mock_client_id';
    process.env.XERO_CLIENT_SECRET = 'mock_client_secret';
    process.env.XERO_ACCESS_TOKEN = 'mock_access_token';
    process.env.XERO_REFRESH_TOKEN = 'mock_refresh_token';
    process.env.XERO_TENANT_ID = 'mock_tenant_id';

    registeredTools = {};
    mockServer = {
      tool: vi.fn((name, description, schema, handler) => {
        registeredTools[name] = handler;
      })
    };

    registerXeroTools(mockServer);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should register expected tools', () => {
    expect(registeredTools).toHaveProperty('xero_get_invoices');
    expect(registeredTools).toHaveProperty('xero_create_invoice');
    expect(registeredTools).toHaveProperty('xero_get_contacts');
  });

  it('should list invoices', async () => {
    mockGetInvoices.mockResolvedValue({
      body: {
        invoices: [{ InvoiceID: '123', InvoiceNumber: 'INV-001' }]
      }
    });

    const handler = registeredTools['xero_get_invoices'];
    const result = await handler({ page: 1 });

    expect(mockGetInvoices).toHaveBeenCalled();
    expect(result.content[0].text).toContain('INV-001');
    expect(result.isError).toBeUndefined();
  });

  it('should create invoice', async () => {
    mockCreateInvoices.mockResolvedValue({
      body: {
        invoices: [{ InvoiceID: 'new-id', InvoiceNumber: 'INV-NEW' }]
      }
    });

    const handler = registeredTools['xero_create_invoice'];
    const result = await handler({
        contactId: 'contact-123',
        lineItems: [{ description: 'Test Item', quantity: 1, unitAmount: 100 }]
    });

    expect(mockCreateInvoices).toHaveBeenCalled();
    expect(result.content[0].text).toContain('new-id');
  });

  it('should get contacts', async () => {
    mockGetContacts.mockResolvedValue({
      body: {
        contacts: [{ ContactID: 'c1', Name: 'Test Contact' }]
      }
    });

    const handler = registeredTools['xero_get_contacts'];
    const result = await handler({ page: 1 });

    expect(mockGetContacts).toHaveBeenCalled();
    expect(result.content[0].text).toContain('Test Contact');
  });

  it('should handle errors gracefully', async () => {
    mockGetInvoices.mockRejectedValue(new Error('API Error'));

    const handler = registeredTools['xero_get_invoices'];
    const result = await handler({ page: 1 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('API Error');
  });

  it('should fetch tenant ID if not provided in env', async () => {
    delete process.env.XERO_TENANT_ID;
    mockUpdateTenants.mockResolvedValue({ body: [{ tenantId: 'fetched-tenant-id' }] });
    mockGetInvoices.mockResolvedValue({ body: { invoices: [] } });

    const handler = registeredTools['xero_get_invoices'];
    await handler({ page: 1 });

    expect(mockUpdateTenants).toHaveBeenCalled();
    expect(mockGetInvoices).toHaveBeenCalledWith(
        'fetched-tenant-id',
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, undefined, undefined, undefined
    );
  });
});
