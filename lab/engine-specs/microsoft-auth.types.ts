/**
 * Contratos de Tipos para Autenticação Microsoft (MSA), Xbox Live e Mojang
 * Diretório: tropicalia-launcher-lab/engine-specs/microsoft-auth.types.ts
 */

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message?: string;
}

export interface MicrosoftTokenResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  ext_expires_in: number;
  access_token: string;
  refresh_token: string;
}

export interface XboxLiveAuthRequest {
  Properties: {
    AuthMethod: 'RPS';
    SiteName: 'user.auth.xboxlive.com';
    RpsTicket: string; // "d=" + access_token
  };
  RelyingParty: 'http://auth.xboxlive.com';
  TokenType: 'JWT';
}

export interface XboxLiveAuthResponse {
  IssueInstant: string;
  NotAfter: string;
  Token: string;
  DisplayClaims: {
    xui: Array<{
      uhs: string; // User Hash
    }>;
  };
}

export interface XstsAuthorizeRequest {
  Properties: {
    SandboxId: 'RETAIL';
    UserTokens: string[]; // [Token do Xbox Live]
  };
  RelyingParty: 'rp://api.minecraftservices.com/';
  TokenType: 'JWT';
}

export interface XstsAuthorizeResponse {
  IssueInstant: string;
  NotAfter: string;
  Token: string;
  DisplayClaims: {
    xui: Array<{
      uhs: string;
    }>;
  };
}

export interface MinecraftLoginWithXboxRequest {
  identityToken: string; // `XBL3.0 x=${uhs};${xsts_token}`
}

export interface MinecraftLoginWithXboxResponse {
  username: string;
  roles: string[];
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface MinecraftStoreEntitlementsResponse {
  items: Array<{
    name: string; // "product_minecraft", "game_minecraft"
    signature: string;
  }>;
  signature: string;
  keyId: string;
}

export interface MinecraftProfileResponse {
  id: string; // UUID sem traços
  name: string; // Nickname oficial
  skins: Array<{
    id: string;
    state: 'ACTIVE' | 'INACTIVE';
    url: string;
    variant: 'CLASSIC' | 'SLIM';
  }>;
  capes: Array<{
    id: string;
    state: 'ACTIVE' | 'INACTIVE';
    url: string;
    alias: string;
  }>;
}

export interface TropicaliaAccount {
  id: string;
  type: 'MICROSOFT' | 'OFFLINE';
  username: string;
  uuid: string;
  skinUrl?: string;
  capeUrl?: string;
  microsoftRefreshToken?: string; // Salvo em cofre seguro do SO (Keyring/DPAPI)
  minecraftAccessToken?: string;
  tokenExpiresAt?: number;
}
