import { cmd } from "./cmd"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { MCPOAuth } from "../../mcp/oauth"
import { Config } from "../../config/config"
import { Auth } from "../../auth"

export const McpCommand = cmd({
  command: "mcp",
  builder: (yargs) => yargs.command(McpAddCommand).command(McpAuthCommand).demandCommand(),
  async handler() {},
})

export const McpAddCommand = cmd({
  command: "add",
  describe: "add an MCP server",
  async handler() {
    UI.empty()
    prompts.intro("Add MCP server")

    const name = await prompts.text({
      message: "Enter MCP server name",
      validate: (x) => (x && x.length > 0 ? undefined : "Required"),
    })
    if (prompts.isCancel(name)) throw new UI.CancelledError()

    const type = await prompts.select({
      message: "Select MCP server type",
      options: [
        {
          label: "Local",
          value: "local",
          hint: "Run a local command",
        },
        {
          label: "Remote",
          value: "remote",
          hint: "Connect to a remote URL",
        },
      ],
    })
    if (prompts.isCancel(type)) throw new UI.CancelledError()

    if (type === "local") {
      const command = await prompts.text({
        message: "Enter command to run",
        placeholder: "e.g., opencode x @modelcontextprotocol/server-filesystem",
        validate: (x) => (x && x.length > 0 ? undefined : "Required"),
      })
      if (prompts.isCancel(command)) throw new UI.CancelledError()

      prompts.log.info(`Local MCP server "${name}" configured with command: ${command}`)
      prompts.outro("MCP server added successfully")
      return
    }

    if (type === "remote") {
      const url = await prompts.text({
        message: "Enter MCP server URL",
        placeholder: "e.g., https://example.com/mcp",
        validate: (x) => {
          if (!x) return "Required"
          if (x.length === 0) return "Required"
          const isValid = URL.canParse(x)
          return isValid ? undefined : "Invalid URL"
        },
      })
      if (prompts.isCancel(url)) throw new UI.CancelledError()

      const client = new Client({
        name: "opencode",
        version: "1.0.0",
      })
      const transport = new StreamableHTTPClientTransport(new URL(url))
      await client.connect(transport)
      prompts.log.info(`Remote MCP server "${name}" configured with URL: ${url}`)
    }

    prompts.outro("MCP server added successfully")
  },
})

export const McpAuthCommand = cmd({
  command: "auth",
  describe: "manage OAuth authentication for MCP servers",
  builder: (yargs) =>
    yargs
      .command(McpAuthServerCommand)
      .command(McpAuthListCommand)
      .command(McpAuthRefreshCommand)
      .command(McpAuthRevokeCommand)
      .demandCommand(),
  async handler() {},
})

export const McpAuthServerCommand = cmd({
  command: "authorize <server-name>",
  aliases: ["auth"],
  describe: "authorize OAuth for an MCP server",
  async handler(args) {
    const serverName = args["server-name"] as string
    UI.empty()
    prompts.intro(`Authorize OAuth for MCP server: ${serverName}`)

    try {
      const cfg = await Config.get()
      const mcpConfig = cfg.mcp?.[serverName]
      
      if (!mcpConfig || mcpConfig.type !== "remote") {
        prompts.log.error(`MCP server "${serverName}" not found or not a remote server`)
        prompts.outro("Authorization failed")
        return
      }

      if (!mcpConfig.oauth) {
        prompts.log.error(`OAuth not configured for MCP server "${serverName}"`)
        prompts.outro("Authorization failed")
        return
      }

      await MCPOAuth.authorizeServer(serverName)
      prompts.log.success(`OAuth authorization initiated for ${serverName}`)
      prompts.outro("Authorization completed")
    } catch (error) {
      if (error instanceof MCPOAuth.Failed) {
        prompts.log.error(error.data.reason)
      } else {
        prompts.log.error(error instanceof Error ? error.message : String(error))
      }
      prompts.outro("Authorization failed")
    }
  },
})

export const McpAuthListCommand = cmd({
  command: "list",
  aliases: ["ls"],
  describe: "list authenticated MCP servers",
  async handler() {
    UI.empty()
    prompts.intro("Authenticated MCP servers")

    try {
      const authData = await Auth.all()
      const mcpTokens = Object.entries(authData).filter(([key]) => key.startsWith("mcp:"))
      
      if (mcpTokens.length === 0) {
        prompts.log.info("No authenticated MCP servers found")
        prompts.outro("Done")
        return
      }

      for (const [key, authInfo] of mcpTokens) {
        const serverName = key.replace("mcp:", "")
        if (authInfo.type === "oauth") {
          const expiresAt = new Date(authInfo.expires * 1000)
          const isExpired = Date.now() > authInfo.expires * 1000
          prompts.log.info(`${serverName}: ${isExpired ? "EXPIRED" : "VALID"} (expires ${expiresAt.toLocaleString()})`)
        } else {
          prompts.log.info(`${serverName}: ${authInfo.type}`)
        }
      }
      
      prompts.outro("Done")
    } catch (error) {
      prompts.log.error(error instanceof Error ? error.message : String(error))
      prompts.outro("Failed to list servers")
    }
  },
})

export const McpAuthRefreshCommand = cmd({
  command: "refresh <server-name>",
  describe: "refresh OAuth token for an MCP server",
  async handler(args) {
    const serverName = args["server-name"] as string
    UI.empty()
    prompts.intro(`Refresh OAuth token for: ${serverName}`)

    try {
      await MCPOAuth.refreshToken(serverName)
      prompts.log.success(`Token refreshed successfully for ${serverName}`)
      prompts.outro("Refresh completed")
    } catch (error) {
      if (error instanceof MCPOAuth.Failed) {
        prompts.log.error(error.data.reason)
      } else {
        prompts.log.error(error instanceof Error ? error.message : String(error))
      }
      prompts.outro("Refresh failed")
    }
  },
})

export const McpAuthRevokeCommand = cmd({
  command: "revoke <server-name>",
  describe: "revoke OAuth token for an MCP server",
  async handler(args) {
    const serverName = args["server-name"] as string
    UI.empty()
    prompts.intro(`Revoke OAuth token for: ${serverName}`)

    const confirmed = await prompts.confirm({
      message: `Are you sure you want to revoke authentication for "${serverName}"?`,
    })

    if (prompts.isCancel(confirmed) || !confirmed) {
      prompts.outro("Revocation cancelled")
      return
    }

    try {
      await MCPOAuth.revokeToken(serverName)
      prompts.log.success(`Token revoked successfully for ${serverName}`)
      prompts.outro("Revocation completed")
    } catch (error) {
      prompts.log.error(error instanceof Error ? error.message : String(error))
      prompts.outro("Revocation failed")
    }
  },
})
