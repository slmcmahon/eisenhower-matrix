#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULTS = {
  azureFoundry: {
    endpoint: process.env.AZURE_FOUNDRY_ENDPOINT || 'https://codegen-foundry.cognitiveservices.azure.com',
    deployment: process.env.AZURE_FOUNDRY_DEPLOYMENT || 'gpt-4.1-2',
    apiVersion: process.env.AZURE_FOUNDRY_API_VERSION || '2025-01-01-preview',
    apiKey: process.env.AZURE_FOUNDRY_API_KEY || '',
    timeoutMs: Number(process.env.AZURE_FOUNDRY_TIMEOUT_MS || 5000),
    maxOutputTokens: Number(process.env.AZURE_FOUNDRY_MAX_OUTPUT_TOKENS || 250),
  },
};

function userDataDir() {
  const appName = 'eisenhower-matrix';
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName);
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, appName);
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdgConfig, appName);
}

function settingsPath() {
  return path.join(userDataDir(), 'settings.json');
}

function bootstrap() {
  const filePath = settingsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  let current = {};
  if (fs.existsSync(filePath)) {
    try {
      current = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      current = {};
    }
  }

  const next = {
    ...current,
    azureFoundry: {
      ...(current.azureFoundry || {}),
      endpoint: current?.azureFoundry?.endpoint || DEFAULTS.azureFoundry.endpoint,
      deployment: current?.azureFoundry?.deployment || DEFAULTS.azureFoundry.deployment,
      apiVersion: current?.azureFoundry?.apiVersion || DEFAULTS.azureFoundry.apiVersion,
      apiKey: current?.azureFoundry?.apiKey || DEFAULTS.azureFoundry.apiKey,
      timeoutMs: Number(current?.azureFoundry?.timeoutMs) || DEFAULTS.azureFoundry.timeoutMs,
      maxOutputTokens:
        Number(current?.azureFoundry?.maxOutputTokens) || DEFAULTS.azureFoundry.maxOutputTokens,
    },
  };

  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8');
  console.log(`[bootstrap] settings: ${filePath}`);
}

if (require.main === module) {
  bootstrap();
}

module.exports = {
  bootstrap,
};
