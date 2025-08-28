import { Auth } from "../auth"
import { Config } from "../config/config"
import { Log } from "../util/log"
import { NamedError } from "../util/error"
import { z } from "zod"
import fs from "fs/promises"
import https from "https"

export namespace MCPOAuth {
  const log = Log.create({ service: "mcp-oauth" })

  export const Failed = NamedError.create(
    "MCPOAuthFailed",
    z.object({
      serverName: z.string(),
      reason: z.string(),
    }),
  )

  export const TokenExpired = NamedError.create(
    "MCPOAuthTokenExpired",
    z.object({
      serverName: z.string(),
    }),
  )

  /**
   * Get a valid OAuth token for an MCP server
   */
  export async function getToken(serverName: string): Promise<string> {
    const cfg = await Config.get()
    const mcpConfig = cfg.mcp?.[serverName]
    
    if (!mcpConfig || mcpConfig.type !== "remote" || !mcpConfig.oauth) {
      throw new Failed({
        serverName,
        reason: "Server not found or OAuth not configured",
      })
    }

    // Check if we have a stored token
    const authKey = `mcp:${serverName}`
    const authInfo = await Auth.get(authKey)
    
    if (authInfo?.type === "oauth") {
      // Check if token is still valid
      const now = Date.now() / 1000
      if (authInfo.expires > now + 60) { // 60 second buffer
        log.debug("using cached token", { serverName })
        return authInfo.access
      }
      
      // Token expired, try to refresh
      log.info("token expired, refreshing", { serverName })
      return await refreshToken(serverName)
    }

    // No token found, need to authorize
    throw new Failed({
      serverName,
      reason: "No valid token found, authorization required",
    })
  }

  /**
   * Refresh an expired OAuth token
   */
  export async function refreshToken(serverName: string): Promise<string> {
    const cfg = await Config.get()
    const mcpConfig = cfg.mcp?.[serverName]
    
    if (!mcpConfig || mcpConfig.type !== "remote" || !mcpConfig.oauth) {
      throw new Failed({
        serverName,
        reason: "Server not found or OAuth not configured",
      })
    }

    const authKey = `mcp:${serverName}`
    const authInfo = await Auth.get(authKey)
    
    if (!authInfo || authInfo.type !== "oauth" || !authInfo.refresh) {
      throw new Failed({
        serverName,
        reason: "No refresh token available",
      })
    }

    const oauthConfig = mcpConfig.oauth
    const httpsAgent = await createHttpsAgent(oauthConfig)

    try {
      const tokenResponse = await fetch(oauthConfig.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: authInfo.refresh,
          client_id: oauthConfig.clientId,
          ...(oauthConfig.clientSecret && { client_secret: oauthConfig.clientSecret }),
        }),
        // @ts-ignore - Node.js specific agent option
        ...(httpsAgent && { agent: httpsAgent }),
      })

      if (!tokenResponse.ok) {
        throw new Error(`Token refresh failed: ${tokenResponse.status} ${tokenResponse.statusText}`)
      }

      const tokenData = await tokenResponse.json() as {
        access_token: string
        refresh_token?: string
        expires_in: number
      }

      const expiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in

      // Update stored auth info
      await Auth.set(authKey, {
        type: "oauth",
        access: tokenData.access_token,
        refresh: tokenData.refresh_token || authInfo.refresh,
        expires: expiresAt,
      })

      log.info("token refreshed successfully", { serverName })
      return tokenData.access_token
    } catch (error) {
      log.error("token refresh failed", { 
        serverName, 
        error: error instanceof Error ? error.message : String(error) 
      })
      throw new Failed({
        serverName,
        reason: `Token refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  /**
   * Trigger OAuth authorization flow for an MCP server
   */
  export async function authorizeServer(serverName: string): Promise<void> {
    const cfg = await Config.get()
    const mcpConfig = cfg.mcp?.[serverName]
    
    if (!mcpConfig || mcpConfig.type !== "remote" || !mcpConfig.oauth) {
      throw new Failed({
        serverName,
        reason: "Server not found or OAuth not configured",
      })
    }

    const oauthConfig = mcpConfig.oauth
    const scopes = oauthConfig.scopes?.join(" ") || ""
    
    // Generate PKCE values for security
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    const state = generateRandomString(32)
    const redirectUri = "http://localhost:8080/oauth/callback"

    // Build authorization URL
    const authParams = new URLSearchParams({
      response_type: "code",
      client_id: oauthConfig.clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    })

    const authUrl = `${oauthConfig.authUrl}?${authParams.toString()}`
    
    log.info("starting OAuth flow", { serverName, authUrl })
    
    // Start local server to handle callback
    const callbackResult = await startOAuthCallbackServer()
    
    // Open browser to authorization URL
    try {
      const { spawn } = await import("child_process")
      const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
      spawn(opener, [authUrl], { detached: true, stdio: "ignore" })
      log.info("opened browser for authorization", { serverName })
    } catch (error) {
      log.warn("failed to open browser automatically", { 
        serverName, 
        error: error instanceof Error ? error.message : String(error) 
      })
      console.log(`Please open this URL in your browser: ${authUrl}`)
    }

    // Wait for callback
    const { code, receivedState } = await callbackResult
    
    if (receivedState !== state) {
      throw new Failed({
        serverName,
        reason: "OAuth state mismatch - possible CSRF attack",
      })
    }

    // Exchange code for token
    await exchangeCodeForToken(serverName, oauthConfig, code, codeVerifier, redirectUri)
    
    log.info("OAuth authorization completed successfully", { serverName })
  }

  /**
   * Revoke OAuth token for an MCP server
   */
  export async function revokeToken(serverName: string): Promise<void> {
    const authKey = `mcp:${serverName}`
    await Auth.remove(authKey)
    log.info("token revoked", { serverName })
  }

  /**
   * Create HTTPS agent with mTLS configuration if provided
   */
  async function createHttpsAgent(oauthConfig: NonNullable<NonNullable<Config.Mcp & { type: "remote" }>["oauth"]>): Promise<https.Agent | undefined> {
    if (!oauthConfig?.clientCert || !oauthConfig?.clientKey) {
      return undefined
    }

    try {
      const cert = await fs.readFile(oauthConfig.clientCert, "utf8")
      const key = await fs.readFile(oauthConfig.clientKey, "utf8")
      const ca = oauthConfig.ca ? await fs.readFile(oauthConfig.ca, "utf8") : undefined

      return new https.Agent({
        cert,
        key,
        ca,
        rejectUnauthorized: true,
      })
    } catch (error) {
      log.error("failed to load mTLS certificates", {
        error: error instanceof Error ? error.message : String(error),
      })
      throw new Failed({
        serverName: "unknown",
        reason: `Failed to load mTLS certificates: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }

  /**
   * Generate a cryptographically secure random string for PKCE
   */
  function generateCodeVerifier(): string {
    const buffer = new Uint8Array(32)
    crypto.getRandomValues(buffer)
    return Buffer.from(buffer)
      .toString("base64url")
  }

  /**
   * Generate PKCE code challenge from verifier
   */
  async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)
    const digest = await crypto.subtle.digest("SHA-256", data)
    return Buffer.from(digest).toString("base64url")
  }

  /**
   * Generate a random string
   */
  function generateRandomString(length: number): string {
    const buffer = new Uint8Array(length)
    crypto.getRandomValues(buffer)
    return Buffer.from(buffer).toString("base64url").slice(0, length)
  }

  /**
   * Start a local HTTP server to handle OAuth callback
   */
  async function startOAuthCallbackServer(): Promise<{ code: string; receivedState: string }> {
    const http = await import("http")
    const url = await import("url")
    
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        if (req.url?.startsWith("/oauth/callback")) {
          const parsedUrl = url.parse(req.url, true)
          const code = parsedUrl.query["code"] as string
          const state = parsedUrl.query["state"] as string
          const error = parsedUrl.query["error"] as string

          if (error) {
            res.writeHead(400, { "Content-Type": "text/html" })
            res.end(`<html><body><h1>Authorization Failed</h1><p>Error: ${error}</p></body></html>`)
            server.close()
            reject(new Error(`OAuth authorization failed: ${error}`))
            return
          }

          if (!code || !state) {
            res.writeHead(400, { "Content-Type": "text/html" })
            res.end(`<html><body><h1>Authorization Failed</h1><p>Missing authorization code or state</p></body></html>`)
            server.close()
            reject(new Error("Missing authorization code or state"))
            return
          }

          res.writeHead(200, { "Content-Type": "text/html" })
          res.end(`<html><body><h1>Authorization Successful</h1><p>You can close this window and return to the terminal.</p></body></html>`)
          server.close()
          
          resolve({ code, receivedState: state })
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" })
          res.end("Not Found")
        }
      })

      server.listen(8080, "localhost", () => {
        log.debug("OAuth callback server started on http://localhost:8080")
      })

      server.on("error", (error) => {
        reject(new Error(`Failed to start OAuth callback server: ${error.message}`))
      })

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close()
        reject(new Error("OAuth authorization timed out"))
      }, 5 * 60 * 1000)
    })
  }

  /**
   * Exchange authorization code for access token
   */
  async function exchangeCodeForToken(
    serverName: string, 
    oauthConfig: NonNullable<NonNullable<Config.Mcp & { type: "remote" }>["oauth"]>, 
    code: string, 
    codeVerifier: string, 
    redirectUri: string
  ): Promise<void> {
    const httpsAgent = await createHttpsAgent(oauthConfig)

    try {
      const tokenResponse = await fetch(oauthConfig.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: oauthConfig.clientId,
          code_verifier: codeVerifier,
          ...(oauthConfig.clientSecret && { client_secret: oauthConfig.clientSecret }),
        }),
        // @ts-ignore - Node.js specific agent option
        ...(httpsAgent && { agent: httpsAgent }),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText} - ${errorText}`)
      }

      const tokenData = await tokenResponse.json() as {
        access_token: string
        refresh_token?: string
        expires_in: number
      }

      const expiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in

      // Store token using existing Auth system
      const authKey = `mcp:${serverName}`
      await Auth.set(authKey, {
        type: "oauth",
        access: tokenData.access_token,
        refresh: tokenData.refresh_token || "",
        expires: expiresAt,
      })

      log.info("OAuth token stored successfully", { serverName })
    } catch (error) {
      log.error("token exchange failed", { 
        serverName, 
        error: error instanceof Error ? error.message : String(error) 
      })
      throw new Failed({
        serverName,
        reason: `Token exchange failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }
}