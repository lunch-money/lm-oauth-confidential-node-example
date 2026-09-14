import 'dotenv/config'
import { createOpenIdClient } from './oauth/index.js'
import {
  loadConfiguration,
  safeConfigurationError,
} from './scaffolding/configuration.js'
import { createApp } from './scaffolding/http/app.js'
import { startServer } from './scaffolding/http/server.js'

async function start(): Promise<void> {
  let configuration
  try {
    configuration = loadConfiguration()
  } catch (error) {
    // Security invariant: diagnostics identify setting names but never rejected values.
    console.error(`Startup failed: ${safeConfigurationError(error)}`)
    process.exitCode = 1
    return
  }

  let protocol
  try {
    protocol = await createOpenIdClient(configuration.oauth)
  } catch {
    // Security invariant: do not print discovery responses, which may contain
    // upstream implementation details that do not belong in shared logs.
    console.error(
      'Startup failed: OAuth discovery failed. Check LUNCH_MONEY_API_BASE_URL and confirm that its origin exposes /.well-known/oauth-authorization-server.',
    )
    process.exitCode = 1
    return
  }

  try {
    startServer(createApp(configuration, protocol), configuration.port)
  } catch {
    console.error(
      'Startup failed: the local HTTP server could not start. Check PORT and confirm that it is available.',
    )
    process.exitCode = 1
  }
}

await start()
