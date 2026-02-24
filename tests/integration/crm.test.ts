import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { registerTools } from '../../src/mcp_servers/crm/tools.js';

// Mock HubSpot Client
const mockCreateContact = vi.fn();
const mockUpdateContact = vi.fn();
const mockSearchContacts = vi.fn();
const mockCreateDeal = vi.fn();
const mockUpdateDeal = vi.fn();
const mockSearchCompanies = vi.fn();
const mockGetOwners = vi.fn();

vi.mock('@hubspot/api-client', () => {
  return {
    Client: vi.fn().mockImplementation(() => {
      return {
        crm: {
          contacts: {
            basicApi: {
              create: mockCreateContact,
              update: mockUpdateContact
            },
            searchApi: {
              doSearch: mockSearchContacts
            }
          },
          deals: {
            basicApi: {
              create: mockCreateDeal,
              update: mockUpdateDeal
            }
          },
          companies: {
            searchApi: {
              doSearch: mockSearchCompanies
            }
          },
          owners: {
            ownersApi: {
              getPage: mockGetOwners
            }
          }
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
      argsSchema: z.object(argsSchema), // Convert to Zod object for validation
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

describe('CRM MCP Server', () => {
  let server: MockMcpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HUBSPOT_ACCESS_TOKEN = 'test-token';
    server = new MockMcpServer();
    registerTools(server as any);
  });

  it('should register all tools', () => {
    const toolNames = Object.keys(server.tools);
    expect(toolNames).toContain('create_contact');
    expect(toolNames).toContain('update_contact');
    expect(toolNames).toContain('search_contacts');
    expect(toolNames).toContain('create_deal');
    expect(toolNames).toContain('update_deal');
    expect(toolNames).toContain('search_companies');
    expect(toolNames).toContain('sync_status');
  });

  it('should create a contact', async () => {
    const contactData = {
      id: '123',
      properties: {
        email: 'test@example.com',
        firstname: 'John',
        lastname: 'Doe'
      }
    };
    mockCreateContact.mockResolvedValue(contactData);

    const result = await server.call('create_contact', {
      email: 'test@example.com',
      firstname: 'John',
      lastname: 'Doe'
    });

    expect(mockCreateContact).toHaveBeenCalledWith({
      properties: {
        email: 'test@example.com',
        firstname: 'John',
        lastname: 'Doe'
      },
      associations: []
    });

    expect(result.content[0].text).toContain('123');
    expect(JSON.parse(result.content[0].text)).toEqual(contactData);
  });

  it('should update a contact', async () => {
    const updateData = {
      id: '123',
      properties: {
        firstname: 'Jane'
      }
    };
    mockUpdateContact.mockResolvedValue(updateData);

    const result = await server.call('update_contact', {
      id: '123',
      properties: JSON.stringify({ firstname: 'Jane' })
    });

    expect(mockUpdateContact).toHaveBeenCalledWith('123', {
      properties: { firstname: 'Jane' }
    });
    expect(JSON.parse(result.content[0].text)).toEqual(updateData);
  });

  it('should search contacts', async () => {
    const searchResults = {
      results: [
        { id: '1', properties: { email: 'search@example.com' } }
      ]
    };
    mockSearchContacts.mockResolvedValue(searchResults);

    const result = await server.call('search_contacts', {
      query: 'search',
      limit: 5
    });

    expect(mockSearchContacts).toHaveBeenCalledWith(expect.objectContaining({
      limit: 5,
      filterGroups: expect.arrayContaining([
        expect.objectContaining({
          filters: expect.arrayContaining([
            expect.objectContaining({ propertyName: 'email', value: 'search' })
          ])
        })
      ])
    }));
    expect(JSON.parse(result.content[0].text)).toEqual(searchResults.results);
  });

  it('should create a deal', async () => {
    const dealData = { id: 'deal-1', properties: { dealname: 'Big Deal' } };
    mockCreateDeal.mockResolvedValue(dealData);

    const result = await server.call('create_deal', {
      dealname: 'Big Deal',
      amount: '1000'
    });

    expect(mockCreateDeal).toHaveBeenCalledWith({
      properties: {
        dealname: 'Big Deal',
        amount: '1000',
        pipeline: 'default',
        dealstage: 'appointmentscheduled'
      },
      associations: []
    });
    expect(JSON.parse(result.content[0].text)).toEqual(dealData);
  });

  it('should update a deal', async () => {
    const dealData = { id: 'deal-1', properties: { amount: '2000' } };
    mockUpdateDeal.mockResolvedValue(dealData);

    const result = await server.call('update_deal', {
      id: 'deal-1',
      properties: JSON.stringify({ amount: '2000' })
    });

    expect(mockUpdateDeal).toHaveBeenCalledWith('deal-1', {
      properties: { amount: '2000' }
    });
    expect(JSON.parse(result.content[0].text)).toEqual(dealData);
  });

  it('should search companies', async () => {
    const companyResults = {
      results: [{ id: 'comp-1', properties: { name: 'Acme' } }]
    };
    mockSearchCompanies.mockResolvedValue(companyResults);

    const result = await server.call('search_companies', {
      query: 'Acme'
    });

    expect(mockSearchCompanies).toHaveBeenCalledWith(expect.objectContaining({
        filterGroups: expect.arrayContaining([
            expect.objectContaining({
                filters: expect.arrayContaining([
                    expect.objectContaining({ propertyName: 'name', value: 'Acme' })
                ])
            })
        ])
    }));
    expect(JSON.parse(result.content[0].text)).toEqual(companyResults.results);
  });

  it('should check sync status', async () => {
    mockGetOwners.mockResolvedValue({ results: [{ id: 'owner-1' }] });

    const result = await server.call('sync_status', {});

    expect(mockGetOwners).toHaveBeenCalled();
    const status = JSON.parse(result.content[0].text);
    expect(status.status).toBe('connected');
    expect(status.owner_count_sample).toBe(1);
  });

  it('should handle errors gracefully', async () => {
    mockCreateContact.mockRejectedValue(new Error('API Error'));

    const result = await server.call('create_contact', {
      email: 'fail@example.com'
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error creating contact: API Error');
  });

  it('should throw if HUBSPOT_ACCESS_TOKEN is missing', async () => {
    delete process.env.HUBSPOT_ACCESS_TOKEN;

    // Since getHubSpotClient is called inside the handler, it should throw/return error
    // But my implementation returns `isError: true` with message

    await expect(server.call('create_contact', { email: 'test@example.com' })).rejects.toThrow('HUBSPOT_ACCESS_TOKEN environment variable is not set.');
  });
});
