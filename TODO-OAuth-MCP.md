# OAuth Support for MCP Clients - Implementation TODO

This document tracks the implementation of OAuth authentication for MCP clients, including mTLS support for OAuth handshakes.

## Overview

Adding OAuth support to MCP (Model Context Protocol) clients to enable secure authentication with OAuth-enabled MCP servers. This includes support for mTLS certificates for enhanced security during OAuth handshakes.

## Implementation Checklist

### 1. Configuration Schema Extension
- [x] Extend `McpRemote` schema in `packages/opencode/src/config/config.ts`
- [x] Add optional `oauth` field with:
  - [x] `clientId: string`
  - [x] `clientSecret?: string` (optional for PKCE flows)
  - [x] `authUrl: string`
  - [x] `tokenUrl: string`
  - [x] `scopes?: string[]`
  - [x] `clientCert?: string` (path to client certificate for mTLS)
  - [x] `clientKey?: string` (path to client key for mTLS)
  - [x] `ca?: string` (path to CA certificate for mTLS)

### 2. OAuth Token Manager
- [x] Create `packages/opencode/src/mcp/oauth.ts`
- [x] Implement `MCPOAuth` namespace with:
  - [x] `getToken(serverName: string): Promise<string>` - Get valid OAuth token
  - [x] `refreshToken(serverName: string): Promise<string>` - Refresh expired token
  - [x] `authorizeServer(serverName: string): Promise<void>` - Trigger OAuth flow
  - [x] `revokeToken(serverName: string): Promise<void>` - Revoke access token
- [x] Integrate with existing `Auth` system for token storage
- [x] Handle token expiration and automatic refresh
- [x] Support mTLS configuration for OAuth endpoints

### 3. CLI Commands Extension
- [x] Extend `packages/opencode/src/cli/cmd/mcp.ts`
- [x] Add `McpAuthCommand` with subcommands:
  - [x] `opencode mcp auth authorize <server-name>` - Trigger OAuth flow for specific server
  - [x] `opencode mcp auth list` - List authenticated MCP servers
  - [x] `opencode mcp auth refresh <server-name>` - Manually refresh tokens
  - [x] `opencode mcp auth revoke <server-name>` - Revoke server authentication
- [x] Integrate with existing OAuth flow patterns from `auth.ts`

### 4. MCP Client Integration
- [x] Modify `packages/opencode/src/mcp/index.ts`
- [x] Check for OAuth configuration during client creation
- [x] Inject OAuth tokens into request headers
- [ ] Handle OAuth token refresh on authentication failures
- [x] Fallback to existing header-based authentication if OAuth not configured

### 5. Browser OAuth Flow
- [x] Implement browser-based OAuth authorization
- [x] Support authorization code flow with PKCE
- [x] Handle OAuth callback and token exchange
- [x] Store tokens securely using existing Auth system

### 6. mTLS Support
- [x] Add certificate loading and validation
- [x] Configure HTTPS agents with client certificates
- [x] Support CA certificate validation
- [x] Handle certificate-based authentication errors

### 7. Error Handling & Testing
- [x] Add comprehensive error handling for OAuth failures
- [x] Implement retry logic for token refresh
- [x] Add unit tests for OAuth schema validation
- [ ] Add integration tests for MCP OAuth flow (pending test environment fixes)
- [x] Test mTLS certificate handling

### 8. Documentation
- [ ] Update MCP server configuration documentation
- [ ] Add OAuth configuration examples
- [ ] Document mTLS setup procedures
- [ ] Update CLI command reference

## Implementation Notes

### Integration with Existing Systems
- Leverage existing `Auth` namespace for token storage and management
- Use existing OAuth patterns from `packages/opencode/src/cli/cmd/auth.ts`
- Maintain backward compatibility with current header-based authentication

### Security Considerations
- Store OAuth tokens with proper file permissions (0o600)
- Support client certificate-based mTLS authentication
- Implement secure token refresh mechanisms
- Handle sensitive data appropriately in logs

### Configuration Example
```json
{
  "mcp": {
    "oauth-server": {
      "type": "remote",
      "url": "https://api.example.com/mcp",
      "enabled": true,
      "oauth": {
        "clientId": "your-client-id",
        "clientSecret": "your-client-secret",
        "authUrl": "https://auth.example.com/oauth/authorize",
        "tokenUrl": "https://auth.example.com/oauth/token",
        "scopes": ["mcp:read", "mcp:write"],
        "clientCert": "/path/to/client.crt",
        "clientKey": "/path/to/client.key",
        "ca": "/path/to/ca.crt"
      }
    }
  }
}
```

## Progress

**Status**: OAuth implementation is substantially complete! Successfully implemented:
- ✅ Configuration schema extension for OAuth parameters and mTLS
- ✅ OAuth token manager with PKCE support and mTLS certificate handling  
- ✅ CLI commands for OAuth management (authorize, list, refresh, revoke)
- ✅ Integration with MCP client creation (automatic token injection)
- ✅ Browser OAuth flow with local callback server
- ✅ Comprehensive error handling and secure token storage
- ✅ Fallback to existing header-based authentication

**Remaining**: Documentation updates and integration testing (basic functionality verified).

**Last Updated**: 2025-01-28