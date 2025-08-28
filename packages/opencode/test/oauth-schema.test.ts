import { describe, test, expect } from "bun:test"
import { Config } from "../src/config/config"

describe("OAuth MCP Configuration Schema", () => {
  test("should validate complete OAuth configuration", () => {
    const validConfig = {
      type: "remote" as const,
      url: "https://example.com/mcp",
      enabled: true,
      headers: { "User-Agent": "opencode" },
      oauth: {
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        authUrl: "https://auth.example.com/oauth/authorize",
        tokenUrl: "https://auth.example.com/oauth/token",
        scopes: ["mcp:read", "mcp:write"],
        clientCert: "/path/to/client.crt",
        clientKey: "/path/to/client.key",
        ca: "/path/to/ca.crt",
      },
    }

    const result = Config.McpRemote.parse(validConfig)
    expect(result.oauth).toBeDefined()
    expect(result.oauth?.clientId).toBe("test-client-id")
    expect(result.oauth?.scopes).toEqual(["mcp:read", "mcp:write"])
  })

  test("should validate minimal OAuth configuration", () => {
    const minimalConfig = {
      type: "remote" as const,
      url: "https://example.com/mcp",
      oauth: {
        clientId: "test-client",
        authUrl: "https://auth.example.com/oauth/authorize",
        tokenUrl: "https://auth.example.com/oauth/token",
      },
    }

    const result = Config.McpRemote.parse(minimalConfig)
    expect(result.oauth).toBeDefined()
    expect(result.oauth?.clientId).toBe("test-client")
    expect(result.oauth?.clientSecret).toBeUndefined()
    expect(result.oauth?.scopes).toBeUndefined()
  })

  test("should validate remote config without OAuth", () => {
    const configWithoutOAuth = {
      type: "remote" as const,
      url: "https://example.com/mcp",
      enabled: true,
      headers: { "Authorization": "Bearer api-key" },
    }

    const result = Config.McpRemote.parse(configWithoutOAuth)
    expect(result.oauth).toBeUndefined()
    expect(result.headers).toEqual({ "Authorization": "Bearer api-key" })
  })

  test("should reject invalid OAuth configuration", () => {
    const invalidConfig = {
      type: "remote" as const,
      url: "https://example.com/mcp",
      oauth: {
        clientId: "test-client",
        // Missing required authUrl and tokenUrl
      },
    }

    expect(() => Config.McpRemote.parse(invalidConfig)).toThrow()
  })

  test("should handle mTLS certificate paths", () => {
    const configWithMTLS = {
      type: "remote" as const,
      url: "https://secure.example.com/mcp",
      oauth: {
        clientId: "secure-client",
        authUrl: "https://auth.example.com/oauth/authorize",
        tokenUrl: "https://auth.example.com/oauth/token",
        clientCert: "/etc/ssl/certs/client.crt",
        clientKey: "/etc/ssl/private/client.key",
        ca: "/etc/ssl/certs/ca.crt",
      },
    }

    const result = Config.McpRemote.parse(configWithMTLS)
    expect(result.oauth?.clientCert).toBe("/etc/ssl/certs/client.crt")
    expect(result.oauth?.clientKey).toBe("/etc/ssl/private/client.key")
    expect(result.oauth?.ca).toBe("/etc/ssl/certs/ca.crt")
  })
})