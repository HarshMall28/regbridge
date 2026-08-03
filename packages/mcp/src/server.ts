import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "regbridge",
  version: "0.1.0",
  description: "EU crop protection regulatory intelligence",
});

// Tools will be registered here in Chat 8

const transport = new StdioServerTransport();
await server.connect(transport);
