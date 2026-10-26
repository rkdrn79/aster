import type { CommandHandler } from '../dispatch'
import { prepareResearchHostTools, readResearchHostToolsStatus } from '../research-host-tools'

export const RESEARCH_HOST_TOOLS_HANDLERS: Record<string, CommandHandler> = {
  'research host prepare': async ({ client }) => {
    if (client.isRemote) {
      throw new Error('Prepare tools on the project host')
    }
    console.log(
      JSON.stringify({ ok: true, result: await prepareResearchHostTools(client.userDataPath) })
    )
  },
  'research host tools': async ({ client }) => {
    console.log(
      JSON.stringify({ ok: true, result: await readResearchHostToolsStatus(client.userDataPath) })
    )
  }
}
