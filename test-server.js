#!/usr/bin/env node

console.log('Starting minimal test MCP server...');
console.log('Node.js version:', process.version);

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

console.log('Imports loaded successfully');

(async () => {
  try {
    console.log('Creating MCP server...');
    const server = new McpServer({
      name: "test-server",
      version: "1.0.0"
    }, {
      capabilities: {
        tools: { listChanged: false }
      }
    });

    console.log('Adding simple test tool...');
    server.tool(
      "test-tool",
      {
        message: {
          type: "string",
          description: "Test message"
        }
      },
      async (args) => {
        return {
          content: [{ type: "text", text: `Hello: ${args.message}` }]
        };
      }
    );

    console.log('Setting up transport...');
    const transport = new StdioServerTransport();
    
    console.log('Connecting to transport...');
    await server.connect(transport);
    
    console.log('Test MCP server connected and ready!');
  } catch (error) {
    console.error('Error in test server:', error);
    process.exit(1);
  }
})();
