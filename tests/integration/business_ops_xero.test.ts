import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { registerXeroTools } from '../../src/mcp_servers/business_ops/xero_tools.js';

// Mock Xero Client
const mockSetTokenSet = vi.fn();
const mockUpdateTenants = vi.fn();
const mockGetInvoices = vi.fn();
const mockCreateInvoices = vi.fn();
const mockGetReportBalanceSheet = vi.fn();
const mockGetReportProfitAndLoss = vi.fn();

vi.mock('xero-node', () => {
  return {
    XeroClient: vi.fn().mockImplementation(() => {
      return {
        setTokenSet: mockSetTokenSet,
        updateTenants: mockUpdateTenants,
        accountingApi: {
          getInvoices: mockGetInvoices,
          createInvoices: mockCreateInvoices,
          getReportBalanceSheet: mockGetReportBalanceSheet,
          getReportProfitAndLoss: mockGetReportProfitAndLoss
        }
      };
    })
  };
});

// Mock McpServer
class MockMcpServer {
  tools: Record<string, any> = {};

  tool(name: string, description: string, argsSchema: any, handler: any) {
    this.tools[name] = {
      description,
      argsSchema: z.object(argsSchema),
      handler
    };
  }

  async call(name: string, args: any) {
    const tool = this.tools[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    const parsedArgs = tool.argsSchema.parse(args);
    return tool.handler(parsedArgs);
  }
}

describe('Business Ops Xero Integration', () => {
  let server: MockMcpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.XERO_ACCESS_TOKEN = 'test-token';
    process.env.XERO_TENANT_ID = 'test-tenant-id';
    server = new MockMcpServer();
    registerXeroTools(server as any);
  });

  it('should register all tools', () => {
    const toolNames = Object.keys(server.tools);
    expect(toolNames).toContain('list_invoices');
    expect(toolNames).toContain('create_invoice');
    expect(toolNames).toContain('get_balance_sheet');
    expect(toolNames).toContain('get_profit_and_loss');
  });

  it('should list invoices', async () => {
    const invoices = [{ invoiceID: 'inv-123', total: 100 }];
    mockGetInvoices.mockResolvedValue({ body: { invoices } });

    const result = await server.call('list_invoices', {
        statuses: ['AUTHORISED'],
        page: 1
    });

    expect(mockGetInvoices).toHaveBeenCalledWith(
        'test-tenant-id',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        ['AUTHORISED'],
        1,
        undefined,
        undefined,
        undefined
    );
    expect(JSON.parse(result.content[0].text)).toEqual(invoices);
  });

  it('should create an invoice', async () => {
    const invoice = { invoiceID: 'inv-new', total: 500 };
    mockCreateInvoices.mockResolvedValue({ body: { invoices: [invoice] } });

    const input = {
        contactId: 'con-123',
        lineItems: [{ description: 'Item 1', quantity: 1, unitAmount: 500 }],
        status: 'DRAFT'
    };

    const result = await server.call('create_invoice', input);

    expect(mockCreateInvoices).toHaveBeenCalledWith(
        'test-tenant-id',
        expect.objectContaining({
            invoices: [expect.objectContaining({
                contact: { contactID: 'con-123' },
                status: 'DRAFT'
            })]
        })
    );
    expect(JSON.parse(result.content[0].text)).toEqual(invoice);
  });

  it('should get balance sheet', async () => {
    const report = { reportID: 'rep-bs' };
    mockGetReportBalanceSheet.mockResolvedValue({ body: report });

    const result = await server.call('get_balance_sheet', { date: '2023-12-31' });

    expect(mockGetReportBalanceSheet).toHaveBeenCalledWith(
        'test-tenant-id',
        '2023-12-31',
        undefined,
        undefined,
        undefined,
        undefined
    );
    expect(JSON.parse(result.content[0].text)).toEqual(report);
  });

   it('should get profit and loss', async () => {
    const report = { reportID: 'rep-pl' };
    mockGetReportProfitAndLoss.mockResolvedValue({ body: report });

    const result = await server.call('get_profit_and_loss', { fromDate: '2023-01-01', toDate: '2023-12-31' });

    expect(mockGetReportProfitAndLoss).toHaveBeenCalledWith(
        'test-tenant-id',
        '2023-01-01',
        '2023-12-31',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
    );
    expect(JSON.parse(result.content[0].text)).toEqual(report);
  });

  it('should handle missing token error', async () => {
      delete process.env.XERO_ACCESS_TOKEN;
      const result = await server.call('list_invoices', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("XERO_ACCESS_TOKEN environment variable is not set.");
  });

  it('should handle API errors', async () => {
      mockGetInvoices.mockRejectedValue(new Error('API Error'));
      const result = await server.call('list_invoices', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error listing invoices: API Error');
  });

  it('should fetch tenant ID if not provided', async () => {
      delete process.env.XERO_TENANT_ID;
      mockUpdateTenants.mockResolvedValue([{ tenantId: 'fetched-tenant-id' }]);
      mockGetInvoices.mockResolvedValue({ body: { invoices: [] } });

      await server.call('list_invoices', {});

      expect(mockUpdateTenants).toHaveBeenCalled();
      expect(mockGetInvoices).toHaveBeenCalledWith(
          'fetched-tenant-id',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          1,
          undefined,
          undefined,
          undefined
      );
  });
});
