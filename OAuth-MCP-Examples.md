# OAuth MCP Configuration Examples

This document provides practical examples of how to configure OAuth authentication for MCP servers.

## Basic OAuth Configuration

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "my-oauth-server": {
      "type": "remote",
      "url": "https://api.example.com/mcp",
      "enabled": true,
      "oauth": {
        "clientId": "your-client-id",
        "clientSecret": "your-client-secret",
        "authUrl": "https://auth.example.com/oauth/authorize",
        "tokenUrl": "https://auth.example.com/oauth/token",
        "scopes": ["mcp:read", "mcp:write"]
      }
    }
  }
}
```

## OAuth with mTLS (Mutual TLS)

For enhanced security, you can configure client certificates for the OAuth flow:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "secure-oauth-server": {
      "type": "remote",
      "url": "https://secure-api.example.com/mcp",
      "enabled": true,
      "oauth": {
        "clientId": "secure-client-id",
        "authUrl": "https://secure-auth.example.com/oauth/authorize",
        "tokenUrl": "https://secure-auth.example.com/oauth/token",
        "scopes": ["mcp:admin"],
        "clientCert": "/path/to/client.crt",
        "clientKey": "/path/to/client.key",
        "ca": "/path/to/ca.crt"
      }
    }
  }
}
```

## PKCE-only OAuth (No Client Secret)

For public clients or enhanced security using PKCE:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "public-oauth-server": {
      "type": "remote",
      "url": "https://public-api.example.com/mcp",
      "enabled": true,
      "oauth": {
        "clientId": "public-client-id",
        "authUrl": "https://auth.example.com/oauth/authorize",
        "tokenUrl": "https://auth.example.com/oauth/token",
        "scopes": ["mcp:read"]
      }
    }
  }
}
```

## Mixed Authentication

You can have both OAuth and traditional API key servers:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "oauth-server": {
      "type": "remote",
      "url": "https://oauth-api.example.com/mcp",
      "enabled": true,
      "oauth": {
        "clientId": "oauth-client-id",
        "authUrl": "https://auth.example.com/oauth/authorize",
        "tokenUrl": "https://auth.example.com/oauth/token"
      }
    },
    "api-key-server": {
      "type": "remote",
      "url": "https://api-key.example.com/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer your-api-key"
      }
    }
  }
}
```

## CLI Usage Examples

### Authorize a server
```bash
opencode mcp auth authorize my-oauth-server
```

This will:
1. Open your browser to the OAuth authorization URL
2. Start a local callback server on http://localhost:8080
3. Handle the OAuth callback and store the token securely

### List authenticated servers
```bash
opencode mcp auth list
```

### Refresh an expired token
```bash
opencode mcp auth refresh my-oauth-server
```

### Revoke authentication
```bash
opencode mcp auth revoke my-oauth-server
```

## Security Notes

1. **Client Secrets**: Store client secrets securely. Consider using environment variables or external secret management.

2. **Certificate Paths**: Ensure certificate files have proper permissions (readable only by the user running opencode).

3. **Token Storage**: OAuth tokens are automatically stored in `~/.local/share/opencode/auth.json` with 0600 permissions.

4. **PKCE**: The implementation automatically uses PKCE (Proof Key for Code Exchange) for enhanced security, even when a client secret is provided.

5. **Token Refresh**: Tokens are automatically refreshed when they expire during MCP operations.

## Troubleshooting

### Authorization fails to open browser
If the browser doesn't open automatically, the authorization URL will be printed to the console. Copy and paste it into your browser manually.

### Certificate errors with mTLS
Ensure your certificate files are in PEM format and readable by the opencode process:
```bash
chmod 600 /path/to/client.key
chmod 644 /path/to/client.crt /path/to/ca.crt
```

### Token refresh failures
If token refresh fails, you may need to re-authorize:
```bash
opencode mcp auth revoke my-server
opencode mcp auth authorize my-server
```