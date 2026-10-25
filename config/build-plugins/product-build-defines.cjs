const { darkBuildDefines } = require('../dark-build-switches.cjs')
const { resolveAsterUpdateFeed } = require('../scripts/aster-update-feed.cjs')

function productBuildDefines(env = process.env) {
  return {
    ...darkBuildDefines(env),
    ASTER_UPDATE_FEED_URL: JSON.stringify(resolveAsterUpdateFeed(env))
  }
}

module.exports = { productBuildDefines }
