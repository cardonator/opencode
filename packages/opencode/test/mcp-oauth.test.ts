import { describe, test, expect, beforeEach } from "bun:test"
import { MCPOAuth } from "../src/mcp/oauth"
import { Auth } from "../src/auth"
import { Config } from "../src/config/config"
import { App } from "../src/app/app"

describe("MCPOAuth", () => {
  beforeEach(async () => {
    // Clean up any existing auth data
    const authData = await Auth.all()
    for (const key of Object.keys(authData)) {
      if (key.startsWith("mcp:test-")) {
        await Auth.remove(key)
      }
    }
  })

  test("getToken should throw error when server not configured", async () => {
    await App.provide({ cwd: process.cwd() }, async () => {
      await expect(MCPOAuth.getToken("nonexistent-server")).rejects.toThrow()
    })
  })

  test("getToken should throw error when OAuth not configured", async () => {
    await App.provide({ cwd: process.cwd() }, async () => {
      // Mock a server without OAuth config
      const originalGet = Config.get
      Config.get = async () => ({
        mcp: {
          "test-server": {
            type: "remote" as const,
            url: "https://example.com",
            enabled: true,
            headers: {},
          },
        },
      } as any)

      try {
        await expect(MCPOAuth.getToken("test-server")).rejects.toThrow()
      } finally {
        Config.get = originalGet
      }
    })
  })

  test("getToken should use cached token when valid", async () => {
    await App.provide({ cwd: process.cwd() }, async () => {
      // Set up a valid token
      const futureTime = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      await Auth.set("mcp:test-server", {
        type: "oauth",
        access: "test-access-token",
        refresh: "test-refresh-token",
        expires: futureTime,
      })

      // Mock server config
      const originalGet = Config.get
      Config.get = async () => ({
        mcp: {
          "test-server": {
            type: "remote" as const,
            url: "https://example.com",
            enabled: true,
            headers: {},
            oauth: {
              clientId: "test-client",
              authUrl: "https://example.com/auth",
              tokenUrl: "https://example.com/token",
            },
          },
        },
      } as any)

      try {
        const token = await MCPOAuth.getToken("test-server")
        expect(token).toBe("test-access-token")
      } finally {
        Config.get = originalGet
      }
    })
  })

  test("revokeToken should remove auth data", async () => {
    await App.provide({ cwd: process.cwd() }, async () => {
      // Set up a token
      await Auth.set("mcp:test-server", {
        type: "oauth",
        access: "test-access-token",
        refresh: "test-refresh-token",
        expires: Math.floor(Date.now() / 1000) + 3600,
      })

      // Verify it exists
      const authBefore = await Auth.get("mcp:test-server")
      expect(authBefore).toBeTruthy()

      // Revoke it
      await MCPOAuth.revokeToken("test-server")

      // Verify it's gone
      const authAfter = await Auth.get("mcp:test-server")
      expect(authAfter).toBeUndefined()
    })
  })

  test("should validate OAuth configuration schema", () => {
    const validConfig = {
      type: "remote" as const,
      url: "https://example.com",
      enabled: true,
      oauth: {
        clientId: "test-client",
        clientSecret: "test-secret",
        authUrl: "https://example.com/auth",
        tokenUrl: "https://example.com/token",
        scopes: ["read", "write"],
        clientCert: "/path/to/cert.pem",
        clientKey: "/path/to/key.pem",
        ca: "/path/to/ca.pem",
      },
    }

    // This should not throw
    expect(() => Config.McpRemote.parse(validConfig)).not.toThrow()
  })

  test("should validate minimal OAuth configuration", () => {
    const minimalConfig = {
      type: "remote" as const,
      url: "https://example.com",
      oauth: {
        clientId: "test-client",
        authUrl: "https://example.com/auth",
        tokenUrl: "https://example.com/token",
      },
    }

    // This should not throw
    expect(() => Config.McpRemote.parse(minimalConfig)).not.toThrow()
  })
})